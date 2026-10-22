"""The "unverifiable" verdict: what the NLI model concluded, shown next to the risk score.

grounding_score = contradiction_prob + 0.3 * neutral_prob puts a neutral-only output at 0.3, which
reads low_risk, the same as a supported one. The score is not changed (nothing here touches it).
`grounding_verdict` names the NLI class that won, "contradicted" | "unverifiable" | "supported",
from the three probabilities already stored on each evaluation, and the read API returns it.

Unit tests cover the function and `nli_breakdown`. The API tests run the real routes against a small
database built here and pin down that the new fields appear, that every existing field is the same,
and that rows that are not a real NLI result (similarity-only, skipped, v1.0 with swapped labels)
give None instead of a verdict.
"""

from __future__ import annotations

import asyncio
import math
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import torch
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app import routers
from app.config import settings
from app.main import create_app
from app.models import Evaluation, Span, Trace
from app.routers import ingest
from app.routers.ingest import SIMULATION_SERVICE
from app.services import grounding
from app.services.grounding import grounding_verdict, nli_breakdown

NEW_FIELDS = ("entailment_prob", "contradiction_prob", "neutral_prob", "grounding_verdict")
OLD_EVALUATION_FIELDS = ("grounding_score", "tool_claim_score", "overall_risk_score", "label", "evaluation_stage")


# ---- grounding_verdict --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "entailment, contradiction, neutral, expected",
    [
        (0.97, 0.01, 0.02, "supported"),
        (0.03, 0.02, 0.95, "unverifiable"),
        (0.01, 0.96, 0.03, "contradicted"),
        (0.2, 0.3, 0.5, "unverifiable"),
        (0.3, 0.2, 0.5, "unverifiable"),
        (0.4, 0.35, 0.25, "supported"),
        (0.4, 0.25, 0.35, "supported"),
    ],
)
def test_the_verdict_is_the_class_with_the_highest_probability(entailment, contradiction, neutral, expected):
    assert grounding_verdict(entailment, contradiction, neutral) == expected


@pytest.mark.parametrize(
    "entailment, contradiction, neutral, expected",
    [
        # Two classes tie for the top: the riskier one wins (contradicted > unverifiable > supported).
        (0.0, 0.5, 0.5, "contradicted"),
        (0.5, 0.5, 0.0, "contradicted"),
        (0.5, 0.0, 0.5, "unverifiable"),
        # Three-way tie.
        (1 / 3, 1 / 3, 1 / 3, "contradicted"),
        # A tie below a clear winner does not matter.
        (0.1, 0.1, 0.8, "unverifiable"),
    ],
)
def test_ties_go_to_the_riskier_class(entailment, contradiction, neutral, expected):
    assert grounding_verdict(entailment, contradiction, neutral) == expected


@pytest.mark.parametrize(
    "args",
    [
        (None, 0.3, 0.3),
        (0.3, None, 0.3),
        (0.3, 0.3, None),
        (None, None, None),
        (float("nan"), 0.3, 0.3),
        (0.3, float("inf"), 0.3),
    ],
)
def test_a_missing_or_non_finite_probability_gives_no_verdict(args):
    assert grounding_verdict(*args) is None


def test_zero_is_a_probability_not_a_missing_value():
    assert grounding_verdict(0.0, 0.0, 0.0) == "contradicted"
    assert grounding_verdict(1.0, 0.0, 0.0) == "supported"


# The id2label of cross-encoder/nli-deberta-v3-small (read from its config.json).
_MODEL_ORDER = {"contradiction": 0, "entailment": 1, "neutral": 2}
_LABEL_TO_VERDICT = {"contradiction": "contradicted", "neutral": "unverifiable", "entailment": "supported"}


class _FakeNLI:
    """Stands in for the loaded model: a `.config` and a call that returns fixed logits."""

    def __init__(self, logits: list[float]) -> None:
        self.config = SimpleNamespace(label2id=_MODEL_ORDER)
        self._logits = logits

    def __call__(self, **inputs):
        return SimpleNamespace(logits=torch.tensor([self._logits]))


@pytest.mark.parametrize("winner", sorted(_LABEL_TO_VERDICT))
def test_the_verdict_agrees_with_the_label_the_nli_step_produces(monkeypatch, winner):
    """Same scoring code as production, on a fake model: the verdict names the same class as `label`."""
    probs = {"contradiction": 0.1, "entailment": 0.1, "neutral": 0.1}
    probs[winner] = 0.8
    logits = [0.0, 0.0, 0.0]
    for name, prob in probs.items():
        logits[_MODEL_ORDER[name]] = math.log(prob)
    model = _FakeNLI(logits)
    monkeypatch.setattr(grounding, "_nli_model", model)
    monkeypatch.setattr(grounding, "_nli_tokenizer", lambda *a, **k: {"input_ids": [1, 2, 3]})
    monkeypatch.setattr(grounding, "_nli_label_index", grounding._read_nli_label_index(model))

    result = grounding.compute_nli_grounding("premise", "claim")

    assert result is not None and result.label == winner
    assert grounding_verdict(result.entailment_prob, result.contradiction_prob, result.neutral_prob) == (
        _LABEL_TO_VERDICT[winner]
    )


# ---- nli_breakdown ------------------------------------------------------------------------------


def _row(stage="stage2", version="v1.2", probs=(0.1, 0.2, 0.7)):
    entailment, contradiction, neutral = probs
    return SimpleNamespace(
        evaluation_stage=stage, model_version=version,
        entailment_prob=entailment, contradiction_prob=contradiction, neutral_prob=neutral,
    )


def test_a_real_nli_row_gives_its_probabilities_and_a_verdict():
    assert nli_breakdown(_row(probs=(0.1, 0.2, 0.7))) == {
        "entailment_prob": 0.1, "contradiction_prob": 0.2, "neutral_prob": 0.7,
        "grounding_verdict": "unverifiable",
    }
    # v1.1 rows have the right labels too (only the weight differs), so they get a verdict.
    assert nli_breakdown(_row(version="v1.1", probs=(0.9, 0.05, 0.05)))["grounding_verdict"] == "supported"


@pytest.mark.parametrize(
    "row",
    [
        None,                                    # a span the worker has not scored yet
        _row(stage="stage1"),                    # similarity-only: the *_prob columns are not NLI output
        _row(stage="skipped"),
        _row(stage=None),
        _row(version="v1.0"),                    # entailment_prob and neutral_prob are swapped
        _row(probs=(None, None, None)),          # a stage2 row cannot lack them, but must not crash
    ],
)
def test_a_row_that_is_not_a_real_nli_result_gives_none_for_all_four(row):
    assert nli_breakdown(row) == {name: None for name in NEW_FIELDS}


# ---- the API ------------------------------------------------------------------------------------

REAL_TRACE = "t-verdict-real"
SIM_TRACE = "t-verdict-sim"


def _eval(span_id, trace_id, probs, *, stage="stage2", version="v1.2", grounding_score=0.3, label="low_risk",
          overall=0.3, tool=None):
    entailment, contradiction, neutral = probs
    return Evaluation(
        span_id=span_id, trace_id=trace_id, evaluation_stage=stage, model_version=version,
        entailment_prob=entailment, contradiction_prob=contradiction, neutral_prob=neutral,
        grounding_score=grounding_score, tool_claim_score=tool, overall_risk_score=overall, label=label,
    )


def _seed(trace_id: str, service: str) -> list:
    spans = ["neutral", "contradicted", "supported", "stage1", "skipped", "legacy", "unscored"]
    return [
        Trace(trace_id=trace_id, service_name=service, pipeline_id="p", status="completed", total_spans=len(spans)),
        *[Span(span_id=f"{trace_id}-{name}", trace_id=trace_id, agent_id="agent", input_summary="evidence",
               output_summary="answer") for name in spans],
        # The score is contradiction + 0.3 * neutral, so a neutral-only output scores 0.3 and is low_risk.
        _eval(f"{trace_id}-neutral", trace_id, (0.03, 0.02, 0.95), grounding_score=0.305, overall=0.305),
        _eval(f"{trace_id}-contradicted", trace_id, (0.01, 0.96, 0.03), grounding_score=0.969, overall=0.969,
              label="high_risk"),
        _eval(f"{trace_id}-supported", trace_id, (0.97, 0.01, 0.02), grounding_score=0.016, overall=0.016,
              tool=0.0),
        # The similarity-only fallback stores rough numbers in the same columns; they are not NLI output.
        _eval(f"{trace_id}-stage1", trace_id, (0.2, 0.1, 0.7), stage="stage1", grounding_score=0.3),
        Evaluation(span_id=f"{trace_id}-skipped", trace_id=trace_id, evaluation_stage="skipped"),
        # A v1.0 row: entailment_prob and neutral_prob are swapped, so no verdict can be read from it.
        _eval(f"{trace_id}-legacy", trace_id, (0.95, 0.02, 0.03), version="v1.0", grounding_score=0.035,
              overall=0.035),
    ]


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "verdict.db"
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
            session.add_all(_seed(REAL_TRACE, "pytest_service"))
            session.add_all(_seed(SIM_TRACE, SIMULATION_SERVICE))

    asyncio.run(build())
    monkeypatch.setattr(routers, "get_session", factory)
    monkeypatch.setattr(ingest, "get_session", factory)
    transport = httpx.ASGITransport(app=create_app())
    yield httpx.AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key})
    asyncio.run(engine.dispose())


def _by_name(spans: list[dict], trace_id: str) -> dict[str, dict]:
    return {s["span_id"].removeprefix(f"{trace_id}-"): s for s in spans}


def test_the_trace_endpoint_adds_the_probabilities_and_the_verdict(client):
    async def run():
        async with client:
            return (await client.get(f"/v1/traces/{REAL_TRACE}")).json()

    spans = _by_name(asyncio.run(run())["spans"], REAL_TRACE)
    evaluation = {name: s["evaluation"] for name, s in spans.items()}

    assert evaluation["neutral"]["grounding_verdict"] == "unverifiable"
    assert (evaluation["neutral"]["entailment_prob"], evaluation["neutral"]["contradiction_prob"],
            evaluation["neutral"]["neutral_prob"]) == (0.03, 0.02, 0.95)
    assert evaluation["contradicted"]["grounding_verdict"] == "contradicted"
    assert evaluation["supported"]["grounding_verdict"] == "supported"
    # Not a real NLI result: no probabilities and no verdict, rather than a guess.
    for name in ("stage1", "skipped", "legacy"):
        assert {k: evaluation[name][k] for k in NEW_FIELDS} == {k: None for k in NEW_FIELDS}, name
    # A span the worker has not scored yet still has no evaluation object at all.
    assert spans["unscored"]["evaluation"] is None


def test_the_trace_endpoint_keeps_every_existing_field_and_the_scores(client):
    async def run():
        async with client:
            return (await client.get(f"/v1/traces/{REAL_TRACE}")).json()

    body = asyncio.run(run())
    spans = _by_name(body["spans"], REAL_TRACE)

    # The span object: the same keys as before, in the same order, with nothing added.
    assert list(spans["neutral"]) == [
        "span_id", "parent_span_id", "agent_id", "agent_role", "event_type", "span_kind", "latency_ms",
        "status", "error_message", "model", "tokens_in", "tokens_out", "tool_name", "tool_args",
        "tool_result_summary", "input_summary", "output_summary", "start_time", "evaluation",
    ]
    # The evaluation object: the five existing fields come first, unchanged, then the four new ones.
    assert list(spans["neutral"]["evaluation"]) == [*OLD_EVALUATION_FIELDS, *NEW_FIELDS]
    # The stored scores come back exactly as stored: a neutral-only output is still 0.305, low_risk.
    assert {k: spans["neutral"]["evaluation"][k] for k in OLD_EVALUATION_FIELDS} == {
        "grounding_score": 0.305, "tool_claim_score": None, "overall_risk_score": 0.305,
        "label": "low_risk", "evaluation_stage": "stage2",
    }
    assert {k: spans["contradicted"]["evaluation"][k] for k in OLD_EVALUATION_FIELDS} == {
        "grounding_score": 0.969, "tool_claim_score": None, "overall_risk_score": 0.969,
        "label": "high_risk", "evaluation_stage": "stage2",
    }
    assert spans["supported"]["evaluation"]["tool_claim_score"] == 0.0
    # Rows that are not a real NLI result still report their own stage and scores.
    assert spans["stage1"]["evaluation"]["evaluation_stage"] == "stage1"
    assert spans["stage1"]["evaluation"]["grounding_score"] == 0.3
    assert spans["skipped"]["evaluation"]["evaluation_stage"] == "skipped"
    assert set(body) == {"trace", "spans", "alerts"}


def test_the_simulate_endpoint_adds_the_same_fields_and_keeps_the_old_ones(client):
    async def run():
        async with client:
            return (await client.get(f"/v1/simulate/{SIM_TRACE}")).json()

    body = asyncio.run(run())
    spans = _by_name(body["spans"], SIM_TRACE)

    assert list(spans["neutral"]) == [
        "span_id", "agent_id", "evaluated", "grounding_score", "tool_claim_score", "disagreement_score",
        "overall_risk_score", *NEW_FIELDS, "window_centroid_distance",
    ]
    assert spans["neutral"]["evaluated"] is True
    assert (spans["neutral"]["grounding_score"], spans["neutral"]["overall_risk_score"]) == (0.305, 0.305)
    assert spans["neutral"]["grounding_verdict"] == "unverifiable"
    assert spans["neutral"]["neutral_prob"] == 0.95
    assert spans["contradicted"]["grounding_verdict"] == "contradicted"
    assert spans["supported"]["grounding_verdict"] == "supported"
    for name in ("stage1", "skipped", "legacy"):
        assert {k: spans[name][k] for k in NEW_FIELDS} == {k: None for k in NEW_FIELDS}, name
    # Not scored yet: evaluated is false and the new fields read null, never a default.
    assert spans["unscored"]["evaluated"] is False
    assert {k: spans["unscored"][k] for k in NEW_FIELDS} == {k: None for k in NEW_FIELDS}
    assert set(body) == {"trace_id", "spans", "alerts"}
