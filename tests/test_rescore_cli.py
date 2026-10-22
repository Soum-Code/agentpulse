"""Re-scoring the evaluation rows written before the NLI label-order and risk fixes.

`python -m app.rescore_cli` scores rows at model_version "v1.0" again from the text stored in the
spans table. These tests run it against a small database built here, with the NLI call replaced
by a stub (the tool-claim validator and the risk aggregation are the real ones), so no model is
needed. What they pin down: the default is a dry run; an old row changes and a current one does
not; a second --apply changes nothing; alerts, drift records and baselines are never touched; the
numbers built from the scores follow; and a row that cannot be reproduced is left alone.
"""

from __future__ import annotations

import asyncio
import csv
import json
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app import rescore_cli
from app.models import AgentRecord, Alert, Baseline, DriftRecord, Evaluation, Span, Trace
from app.services import evaluation_runner, evaluator
from app.services.alerting import AlertEngine
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline
from app.services.grounding import GroundingResult

EVIDENCE = "the evidence the agent saw"
TOOL_OUTPUT = "I used the web_search tool and found 3 documents"  # the tool really found 5


def _grounding(entailment, neutral, contradiction, stage="stage2") -> GroundingResult:
    return GroundingResult(
        grounding_score=round(contradiction + 0.5 * neutral, 4),
        entailment_prob=entailment, contradiction_prob=contradiction, neutral_prob=neutral,
        label="entailment", evaluation_stage=stage, latency_ms=0.0,
        input_tokens=40, input_truncated=False,
    )


# What the stub NLI says, by claim text. "claim-nli-down" answers like a model that failed to load.
NLI = {
    "claim-a": _grounding(0.8, 0.1, 0.1),                  # grounding 0.15
    TOOL_OUTPUT: _grounding(0.8, 0.1, 0.1),                # grounding 0.15
    "claim-b": _grounding(0.1, 0.6, 0.3),                  # grounding 0.6
    "claim-nli-down": _grounding(0.5, 0.5, 0.0, stage="stage1"),
}


def fake_nli(source, claim):
    assert claim in NLI, f"the NLI must not be asked about {claim!r}"
    return NLI[claim]


def _eval(span_id, trace_id, risk, *, version="v1.0", stage="stage2", grounding=None,
          probs=(None, None, None), tool=None, found=None, disagreement=None, label=None):
    return Evaluation(
        span_id=span_id, trace_id=trace_id, evaluation_stage=stage, grounding_score=grounding,
        entailment_prob=probs[0], neutral_prob=probs[1], contradiction_prob=probs[2],
        tool_claim_score=tool, tool_claims_found=found, disagreement_score=disagreement,
        overall_risk_score=risk, label=label, model_version=version, config_version=version,
    )


def _span(span_id, trace_id, agent, output, **extra):
    return Span(span_id=span_id, trace_id=trace_id, agent_id=agent,
                input_summary=EVIDENCE if output else None, output_summary=output, **extra)


def _alert(span_id, trace_id, agent, alert_type, field, value, threshold):
    return Alert(trace_id=trace_id, span_id=span_id, agent_id=agent, alert_type=alert_type,
                 severity="HIGH", message="m",
                 details_json=json.dumps({"condition_field": field, "value": value, "threshold": threshold}))


def _ema(*scores):
    avg = scores[0]
    for score in scores[1:]:
        avg = avg * 0.95 + score * 0.05
    return avg


def _seed() -> list:
    """Rows as the live database holds them. Evaluations get ids 1..6 in this order."""
    return [
        Trace(trace_id="t1", overall_risk_score=0.5),
        Trace(trace_id="t2", overall_risk_score=0.95),
        Trace(trace_id="t3", overall_risk_score=0.3),
        # "writer": three spans, the third already scored under the current code.
        _span("sp1", "t1", "writer", "claim-a"),
        _span("sp2", "t1", "writer", TOOL_OUTPUT, tool_name="web_search",
              tool_result_summary="Found 5 documents"),
        _span("sp3", "t2", "writer", "claim-b"),
        # "reviewer": a similarity-only row (keeps its grounding) and a row with no text at all.
        _span("sp4", "t3", "reviewer", "claim-stage1"),
        _span("sp5", "t3", "reviewer", None),
        # "mystery": its stored average is not what its rows add up to.
        _span("sp6", "t2", "mystery", "claim-b"),
        _eval("sp1", "t1", 0.5, grounding=0.5, probs=(0.1, 0.8, 0.1), disagreement=0.7, label="medium_risk"),
        _eval("sp2", "t1", 0.2, grounding=0.2, probs=(0.7, 0.2, 0.1), tool=0.0, label="low_risk"),
        _eval("sp3", "t2", 0.9, version="v1.1", grounding=0.9, probs=(0.0, 0.2, 0.8), tool=0.0, found=0, label="high_risk"),
        _eval("sp4", "t3", 0.3, stage="stage1", grounding=0.3, probs=(0.2, 0.7, 0.1), label="low_risk"),
        _eval("sp5", "t3", None, stage="skipped"),
        _eval("sp6", "t2", 0.95, grounding=0.95, probs=(0.0, 0.1, 0.9), label="high_risk"),
        AgentRecord(agent_id="writer", avg_risk_score=_ema(0.5, 0.2, 0.9)),
        AgentRecord(agent_id="reviewer", avg_risk_score=0.3),
        AgentRecord(agent_id="mystery", avg_risk_score=0.4),
        DriftRecord(agent_id="writer", span_id="sp1", quality_drift=0.2, stability_index=60.0),
        Baseline(agent_id="writer", baseline_type="embedding_centroid", data=b"\x01\x02", sample_count=3),
        _alert("sp1", "t1", "writer", "ASI_DROP", "stability_index", 47.0, 50.0),
        _alert("sp1", "t1", "writer", "DRIFT_DETECTED", "window_centroid_distance", 0.9, 0.3),
        _alert("sp6", "t2", "mystery", "GROUNDING_FAILURE", "grounding_score", 0.95, 0.7),
    ]


@pytest.fixture
def db(tmp_path, monkeypatch):
    """A database file with the seed rows, and the session factory the program is pointed at."""
    path = tmp_path / "live-copy.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{path.as_posix()}", poolclass=NullPool)
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def factory():
        async with maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def build():
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        async with factory() as session:
            session.add_all(_seed())

    asyncio.run(build())
    monkeypatch.setattr(rescore_cli, "get_session", factory)
    monkeypatch.setattr(rescore_cli, "evaluate_grounding", fake_nli)
    monkeypatch.setattr(rescore_cli, "load_models", lambda **kwargs: None)
    monkeypatch.setattr(rescore_cli, "models_loaded", lambda: {"nli_model": True})
    yield path, factory
    asyncio.run(engine.dispose())


def cli(*, apply: bool, csv_path=None) -> int:
    return asyncio.run(rescore_cli._amain(apply, str(csv_path) if csv_path else None))


def table(path: Path, name: str) -> list[tuple]:
    conn = sqlite3.connect(str(path))
    try:
        return conn.execute(f"SELECT * FROM {name} ORDER BY rowid").fetchall()
    finally:
        conn.close()


def evaluation(path: Path, span_id: str) -> dict:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        return dict(conn.execute("SELECT * FROM evaluations WHERE span_id=?", (span_id,)).fetchone())
    finally:
        conn.close()


ALL_TABLES = ("traces", "spans", "evaluations", "agent_records", "alerts", "drift_records", "baselines")
KEPT_TABLES = ("spans", "alerts", "drift_records", "baselines")


def test_without_apply_nothing_is_written(db, tmp_path, capsys):
    path, _ = db
    assert rescore_cli.build_parser().parse_args([]).apply is False
    before = {t: table(path, t) for t in ALL_TABLES}

    assert cli(apply=False, csv_path=tmp_path / "changes.csv") == 0

    assert {t: table(path, t) for t in ALL_TABLES} == before
    assert "DRY RUN: nothing was written" in capsys.readouterr().out
    rows = list(csv.DictReader(open(tmp_path / "changes.csv", encoding="utf-8")))
    assert [r["span_id"] for r in rows] == ["sp1", "sp2", "sp4", "sp5", "sp6"]  # not sp3: already v1.1
    first = rows[0]
    assert (first["grounding_score_old"], first["grounding_score_new"]) == ("0.5", "0.15")
    assert (first["model_version_old"], first["model_version_new"]) == ("v1.0", "v1.1")


def test_apply_rescores_old_rows_and_leaves_current_ones(db):
    path, _ = db
    current = evaluation(path, "sp3")

    cli(apply=True)

    sp1 = evaluation(path, "sp1")
    assert (sp1["grounding_score"], sp1["entailment_prob"], sp1["neutral_prob"]) == (0.15, 0.8, 0.1)
    assert (sp1["overall_risk_score"], sp1["label"]) == (0.15, "low_risk")
    assert (sp1["model_version"], sp1["config_version"]) == ("v1.1", "v1.1")
    assert sp1["disagreement_score"] == 0.7  # kept as stored
    assert (sp1["tool_claim_score"], sp1["tool_claims_found"]) == (None, None)  # no tool call

    # The old 0.0 said nothing. The validator is run again, finds the wrong count, and the claim
    # now counts in the average (0.4 * 0.15 + 0.25 * 1.0) / 0.65.
    sp2 = evaluation(path, "sp2")
    assert (sp2["tool_claim_score"], sp2["tool_claims_found"]) == (1.0, 1)
    assert sp2["overall_risk_score"] == round((0.4 * 0.15 + 0.25 * 1.0) / 0.65, 4)

    # A similarity-only row keeps its grounding (the stub would fail the test if asked about it).
    sp4 = evaluation(path, "sp4")
    assert (sp4["grounding_score"], sp4["entailment_prob"], sp4["overall_risk_score"]) == (0.3, 0.2, 0.3)
    assert sp4["model_version"] == "v1.1"
    assert evaluation(path, "sp5")["model_version"] == "v1.1"  # nothing to score, still stamped

    assert evaluation(path, "sp3") == current  # already v1.1: not a byte of it moves


def test_a_second_apply_changes_nothing(db, tmp_path):
    path, factory = db

    cli(apply=True)
    after_first = {t: table(path, t) for t in ALL_TABLES}
    assert asyncio.run(rescore_cli.load_stale(factory)) == []

    assert cli(apply=True, csv_path=tmp_path / "again.csv") == 0
    assert {t: table(path, t) for t in ALL_TABLES} == after_first
    assert not (tmp_path / "again.csv").exists()  # it stopped before scoring anything


def test_alerts_drift_records_and_baselines_are_never_touched(db, capsys):
    path, _ = db
    before = {t: table(path, t) for t in KEPT_TABLES}

    cli(apply=True)

    assert {t: table(path, t) for t in KEPT_TABLES} == before
    out = capsys.readouterr().out
    # Listed because their triggering score moved: the grounding alert (0.95 -> 0.6, now below its
    # threshold) and the ASI alert (whose quality_drift part came from the old grounding scores).
    # The drift alert rests on embeddings only, so it is not listed.
    assert "GROUNDING_FAILURE" in out and "no longer above threshold 0.7" in out
    assert "ASI_DROP" in out and "not recomputed" in out
    assert "DRIFT_DETECTED" not in out


def test_agent_average_and_trace_risk_follow_the_new_scores(db, capsys):
    path, _ = db
    risk = lambda span: evaluation(path, span)["overall_risk_score"]  # noqa: E731

    cli(apply=True)

    conn = sqlite3.connect(str(path))
    averages = dict(conn.execute("SELECT agent_id, avg_risk_score FROM agent_records"))
    traces = dict(conn.execute("SELECT trace_id, overall_risk_score FROM traces"))
    conn.close()
    assert averages["writer"] == _ema(risk("sp1"), risk("sp2"), 0.9)
    assert averages["reviewer"] == 0.3  # no risk score of this agent moved
    assert averages["mystery"] == 0.4  # 0.4 is not what its rows give (0.95): not rebuilt, and said so
    assert "mystery: LEFT ALONE" in capsys.readouterr().out
    assert traces == {"t1": max(risk("sp1"), risk("sp2")), "t2": max(0.9, risk("sp6")), "t3": 0.3}


def test_a_row_the_nli_model_cannot_reproduce_is_left_alone(db, capsys):
    path, _ = db
    conn = sqlite3.connect(str(path))
    conn.execute("UPDATE spans SET output_summary='claim-nli-down' WHERE span_id='sp1'")
    conn.commit()
    conn.close()

    assert cli(apply=True) == 1  # not 0: a script must not read this as done

    sp1 = evaluation(path, "sp1")
    assert (sp1["model_version"], sp1["grounding_score"]) == ("v1.0", 0.5)
    assert evaluation(path, "sp2")["model_version"] == "v1.1"
    assert "SKIPPED" in capsys.readouterr().out


def test_it_refuses_to_run_without_the_models(db, monkeypatch):
    path, _ = db
    monkeypatch.setattr(rescore_cli, "models_loaded", lambda: {"nli_model": False})
    before = {t: table(path, t) for t in ALL_TABLES}

    with pytest.raises(SystemExit, match="models not fully loaded"):
        cli(apply=True)

    assert {t: table(path, t) for t in ALL_TABLES} == before


def test_it_scores_a_span_the_way_the_worker_does(monkeypatch):
    """Same inputs through the worker's own run_evaluation_sync give the same stored values."""
    monkeypatch.setattr(evaluator, "evaluate_grounding", fake_nli)
    monkeypatch.setattr(evaluator, "get_embedding", lambda text: None)
    payload = {
        "span_id": "sp2", "trace_id": "t1", "agent_id": "writer", "input_summary": EVIDENCE,
        "output_summary": TOOL_OUTPUT, "tool_name": "web_search",
        "tool_result_summary": "Found 5 documents", "status": "success",
    }
    pipeline = EvaluationPipeline(DriftDetector(), AlertEngine(cooldown_seconds=0))
    worker = evaluation_runner.run_evaluation_sync(pipeline, payload, [])

    span = Span(span_id="sp2", trace_id="t1", agent_id="writer", input_summary=EVIDENCE,
                output_summary=TOOL_OUTPUT, tool_name="web_search", tool_result_summary="Found 5 documents")
    monkeypatch.setattr(rescore_cli, "evaluate_grounding", fake_nli)
    new = rescore_cli.rescore_row(_eval("sp2", "t1", 0.2, grounding=0.2), span, pipeline)

    assert new["grounding_score"] == worker.grounding.grounding_score
    assert (new["tool_claim_score"], new["tool_claims_found"]) == (
        worker.tool_claim.tool_claim_score, worker.tool_claim.total_claims)
    assert (new["overall_risk_score"], new["label"]) == (worker.overall_risk_score, worker.risk_label)
    assert (new["model_version"], new["config_version"]) == (worker.model_version, worker.config_version)
