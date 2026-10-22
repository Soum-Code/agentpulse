"""Re-score every evaluation row that was not written by the current scoring code.

    python -m app.rescore_cli                         # dry run: report only, writes nothing
    python -m app.rescore_cli --csv /tmp/rescore.csv  # dry run, plus every old -> new value in a file
    python -m app.rescore_cli --apply                 # write the new values, in one transaction

A row is picked up when its model_version is not the current one (EvaluationResult's default in
services/evaluator.py). Rows at "v1.0" were scored before two fixes: the NLI model's labels were
read in the wrong order (entailment and neutral swapped, so grounding_score was wrong), and
overall_risk_score averaged in a tool check that had no claim to check. Rows at "v1.1" have the
right labels but the old neutral weight of 0.5; the current "v1.2" uses 0.3 (see the comments on
EvaluationResult in services/evaluator.py and on NEUTRAL_RISK_WEIGHT in services/grounding.py).
The text those rows were scored from is still in the spans table, so each row is scored again by
the same functions the worker calls. A row already at the current version is left alone, so a
second run finds nothing.

Like retention_cli this is a separate entry point that an operator runs on purpose and reads the
output of, and it starts as a dry run. Unlike the API container it needs the models, which only
the worker loads, so run it in the worker:  docker compose exec -T worker python -m app.rescore_cli
"""

# WHAT THIS FILE IS FOR
# A command-line program that fixes old evaluation rows in place. For each row whose model_version
# is not the current one it recomputes grounding, the tool-claim result, overall_risk_score and the
# label, keeps the stored disagreement_score, and stamps the current model_version and
# config_version. Each write is guarded by the model_version that was read for that row. It also
# recomputes the two numbers that are built from those scores (agent_records.avg_risk_score and
# traces.overall_risk_score), and lists the alerts whose triggering score is now different. It
# never changes alerts, drift_records or baselines.
#
# HOW IT FITS IN
# Run it by hand. It calls evaluate_grounding and evaluate_tool_claims (the worker's own checks),
# and _aggregate_risk and _classify_risk from services/evaluator.py. Nothing else starts it.

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import update
from sqlmodel import select

from app.config import settings
from app.database import get_session
from app.models import AgentRecord, Alert, Evaluation, Span, Trace
from app.services.alerting import AlertEngine
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline, EvaluationResult
from app.services.grounding import (
    GroundingResult,
    backend_info,
    evaluate_grounding,
    load_models,
    models_loaded,
)
from app.services.tool_claim import ToolCallRecord, evaluate_tool_claims, extract_result_count

logger = logging.getLogger("agentpulse.rescore.cli")

# The version labels the worker stamps on a new row (EvaluationResult's defaults). The rows this
# program picks up are those whose model_version differs from CURRENT.model_version. After a row is
# rescored it carries the current version, so a second run finds nothing: that is what makes
# --apply safe to repeat.
CURRENT = EvaluationResult()

# Every column of an evaluation row that this program can write, in the order the CSV shows them.
# disagreement_score, evaluation_stage, evaluated_at and the other version labels are left alone.
VALUE_FIELDS = (
    "grounding_score", "entailment_prob", "contradiction_prob", "neutral_prob",
    "grounding_input_truncated", "grounding_input_tokens",
    "tool_claim_score", "tool_claims_found",
    "overall_risk_score", "label",
)
FIELDS = VALUE_FIELDS + ("model_version", "config_version")
# The part of VALUE_FIELDS a person reads on the dashboard. A row where none of these moves, but
# the NLI probabilities or the audit columns do, is counted apart in the summary.
SCORE_FIELDS = ("grounding_score", "tool_claim_score", "overall_risk_score", "label")

# Which evaluation column holds the value an alert fired on (the alert's condition_field).
ALERT_COLUMN = {
    "grounding_score": "grounding_score",
    "risk_score": "overall_risk_score",
    "tool_claim_score": "tool_claim_score",
}


class Unscorable(Exception):
    """A row that cannot be scored again. It is left as it is, and reported."""


@dataclass
class RowChange:
    """One evaluation row: what it holds now (old) and what it would hold after rescoring (new)."""

    evaluation_id: int
    span_id: str
    trace_id: str
    agent_id: Optional[str]
    old: dict[str, Any]
    new: dict[str, Any]

    def changed(self, fields: tuple[str, ...]) -> bool:
        return any(differs(self.old[f], self.new[f]) for f in fields)


def differs(a: Any, b: Any) -> bool:
    """True when two stored values are not the same. Scores are rounded to 4 decimals."""
    if a is None or b is None:
        return a is not b
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) > 1e-9
    return a != b


def rescore_row(ev: Evaluation, span: Optional[Span], pipeline: EvaluationPipeline) -> dict[str, Any]:
    """The new values for one row, worked out the way EvaluationPipeline.evaluate_span does.

    Raises Unscorable when the row cannot be reproduced, so it is never half-changed.
    """
    if span is None:
        raise Unscorable("its span row no longer exists")
    new = {f: getattr(ev, f) for f in VALUE_FIELDS}
    result = EvaluationResult()

    if ev.evaluation_stage == "stage2":
        # The NLI result is the one that was wrong, so it is computed again from the stored text.
        # A stage2 row must come out as stage2: a similarity-only answer (the NLI model failed)
        # would replace an NLI score with a weaker kind of score.
        grounding = evaluate_grounding(span.input_summary, span.output_summary)
        if grounding is None or grounding.evaluation_stage != "stage2":
            raise Unscorable("the NLI model gave no result for its stored input and output")
        result.grounding = grounding
        new.update(
            grounding_score=grounding.grounding_score,
            entailment_prob=grounding.entailment_prob,
            contradiction_prob=grounding.contradiction_prob,
            neutral_prob=grounding.neutral_prob,
            grounding_input_truncated=grounding.input_truncated,
            grounding_input_tokens=grounding.input_tokens,
        )
    elif ev.grounding_score is not None:
        # A similarity-only (stage1) row did not use the NLI order, so its grounding stays. It
        # still goes into the risk average below. A "skipped" row has no grounding at all.
        result.grounding = GroundingResult(
            grounding_score=ev.grounding_score,
            entailment_prob=ev.entailment_prob or 0.0,
            contradiction_prob=ev.contradiction_prob or 0.0,
            neutral_prob=ev.neutral_prob or 0.0,
            label="",
            evaluation_stage=ev.evaluation_stage or "",
            latency_ms=0.0,
        )

    # The tool-claim result of old rows is ambiguous (score 0.0 and tool_claims_found NULL), so it
    # is derived again. The arguments are those run_evaluation_sync builds from the job payload,
    # which is the span as it was ingested.
    if span.output_summary and span.tool_name:
        result.tool_claim = evaluate_tool_claims(
            span.output_summary,
            [ToolCallRecord(
                tool_name=span.tool_name,
                result_summary=span.tool_result_summary,
                result_count=extract_result_count(span.tool_result_summary),
                status=span.status,
            )],
        )
    new["tool_claim_score"] = result.tool_claim.tool_claim_score if result.tool_claim else None
    new["tool_claims_found"] = result.tool_claim.total_claims if result.tool_claim else None

    new["overall_risk_score"] = pipeline._aggregate_risk(result)
    new["label"] = pipeline._classify_risk(new["overall_risk_score"])
    new["model_version"] = CURRENT.model_version
    new["config_version"] = CURRENT.config_version
    return new


async def load_stale(session_factory) -> list[tuple[Evaluation, Optional[Span]]]:
    """Every row not at the current model_version with its span, oldest first. The session is
    closed on return."""
    async with session_factory() as session:
        rows = await session.execute(
            select(Evaluation, Span)
            .join(Span, Span.span_id == Evaluation.span_id, isouter=True)
            .where(Evaluation.model_version != CURRENT.model_version)
            .order_by(Evaluation.id)
        )
        return [(ev, span) for ev, span in rows.all()]


def rescore_rows(
    stale: list[tuple[Evaluation, Optional[Span]]], pipeline: EvaluationPipeline
) -> tuple[list[RowChange], list[tuple[int, str]]]:
    """Score every row again. Returns the changes, and (evaluation id, reason) for rows that failed."""
    changes: list[RowChange] = []
    skipped: list[tuple[int, str]] = []
    for ev, span in stale:
        try:
            new = rescore_row(ev, span, pipeline)
        except Unscorable as exc:
            skipped.append((ev.id, str(exc)))
            continue
        changes.append(RowChange(
            evaluation_id=ev.id,
            span_id=ev.span_id,
            trace_id=ev.trace_id,
            agent_id=span.agent_id if span else None,
            old={f: getattr(ev, f) for f in FIELDS},
            new=new,
        ))
    return changes, skipped


def running_average(scores: list[Optional[float]]) -> Optional[float]:
    """agent_records.avg_risk_score as persist_results builds it: the first score as it is, then
    95% of the old average plus 5% of each new score. A span with no score does not count."""
    avg = None
    for score in scores:
        if score is None:
            continue
        avg = score if avg is None else avg * 0.95 + score * 0.05
    return avg




async def plan_derived(session, changes: list[RowChange]) -> dict[str, Any]:
    """The numbers that are built from the risk scores, as they would be with the new scores.

    agent_records.avg_risk_score and traces.overall_risk_score are not read from the evaluations
    table by anything: persist_results keeps them up to date as it goes. So they are built again
    here, and only for the agents and traces where a risk score moved. Reads only, so it serves
    the dry run as well as --apply (the table holds the old scores in one case and the new in the
    other; each score is replaced by the one wanted, so the answer is the same).
    """
    moved = [c for c in changes if c.changed(("overall_risk_score",))]
    old = {c.evaluation_id: c.old["overall_risk_score"] for c in changes}
    new = {c.evaluation_id: c.new["overall_risk_score"] for c in changes}
    plan: dict[str, Any] = {"agents": [], "agents_left_alone": [], "traces": []}

    for agent_id in sorted({c.agent_id for c in moved if c.agent_id}):
        agent = await session.get(AgentRecord, agent_id)
        if agent is None:
            continue
        rows = (await session.execute(
            select(Evaluation.id, Evaluation.overall_risk_score)
            .join(Span, Span.span_id == Evaluation.span_id)
            .where(Span.agent_id == agent_id)
            .order_by(Evaluation.id)
        )).all()
        # The average only follows from the rows if the rows are the whole history. So the same
        # calculation on the OLD scores must give the stored value before it is overwritten; if
        # it does not (for example old rows were deleted), the agent is left as it is.
        if differs(running_average([old.get(i, s) for i, s in rows]), agent.avg_risk_score):
            plan["agents_left_alone"].append(agent_id)
            continue
        plan["agents"].append(
            (agent_id, agent.avg_risk_score, running_average([new.get(i, s) for i, s in rows]))
        )

    for trace_id in sorted({c.trace_id for c in moved}):
        rows = (await session.execute(
            select(Evaluation.id, Evaluation.overall_risk_score).where(Evaluation.trace_id == trace_id)
        )).all()
        scores = [new.get(i, s) for i, s in rows if new.get(i, s) is not None]
        if scores:
            plan["traces"].append((trace_id, round(max(scores), 4)))
    return plan


async def apply_rescore(session_factory, changes: list[RowChange]) -> dict[str, Any]:
    """Write the new values, and the numbers built from them, in ONE transaction.

    The first statement is an UPDATE, so SQLite takes the write lock before anything is read: the
    averages are worked out from the table as it is while the lock is held, not from a copy taken
    earlier while the worker may still have been writing.
    """
    if not changes:
        return {"rows_written": 0, "agents": [], "agents_left_alone": [], "traces": []}

    async with session_factory() as session:
        written = []
        for change in changes:
            # The model_version test is also the guard against a second copy of this program: it
            # is the version this row had when it was read, so a row somebody else has rescored
            # since (or whose version changed in any other way) no longer matches and is not
            # written twice.
            result = await session.execute(
                update(Evaluation)
                .where(Evaluation.id == change.evaluation_id,
                       Evaluation.model_version == change.old["model_version"])
                .values(**change.new)
            )
            if result.rowcount:
                written.append(change)

        plan = await plan_derived(session, written)
        for agent_id, _, average in plan["agents"]:
            await session.execute(
                update(AgentRecord).where(AgentRecord.agent_id == agent_id).values(avg_risk_score=average)
            )
        for trace_id, top in plan["traces"]:
            await session.execute(
                update(Trace).where(Trace.trace_id == trace_id).values(overall_risk_score=top)
            )
        await session.commit()
    return {"rows_written": len(written), **plan}


async def affected_alerts(session_factory, changes: list[RowChange]) -> list[dict[str, Any]]:
    """Alerts whose triggering score is now different. Read only: no alert is changed."""
    by_span = {c.span_id: c for c in changes}
    async with session_factory() as session:
        alerts = (await session.execute(select(Alert).order_by(Alert.id))).scalars().all()

    found = []
    for alert in alerts:
        change = by_span.get(alert.span_id)
        if change is None:
            continue
        details = json.loads(alert.details_json or "{}")
        field = details.get("condition_field")
        entry = {
            "id": alert.id, "type": alert.alert_type, "severity": alert.severity,
            "agent_id": alert.agent_id, "span_id": alert.span_id, "field": field,
            "was": details.get("value"), "now": None, "threshold": details.get("threshold"),
            "acknowledged": alert.acknowledged, "resolved": alert.resolved, "note": "",
        }
        if field in ALERT_COLUMN:
            entry["now"] = change.new[ALERT_COLUMN[field]]
            if not differs(entry["was"], entry["now"]):
                continue
        elif field == "stability_index" and change.changed(("grounding_score",)):
            # The ASI is 30% quality_drift, which is built from the grounding scores of the agent's
            # recent spans. It was computed from the old ones, is stored in drift_records, and
            # cannot be recomputed from the database (the history it used lived in worker memory).
            entry["note"] = "ASI includes quality_drift, which came from the old grounding scores; not recomputed"
        else:
            continue
        found.append(entry)
    return found


def summarize(changes: list[RowChange], skipped: list[tuple[int, str]]) -> dict[str, Any]:
    """The counts the report prints."""
    label_moves = Counter(
        (c.old["label"], c.new["label"]) for c in changes if differs(c.old["label"], c.new["label"])
    )
    versions_read = Counter(c.old["model_version"] for c in changes)
    return {
        "rows_not_current": len(changes) + len(skipped),
        "rows_rescored": len(changes),
        "rows_skipped": len(skipped),
        "versions_read": dict(sorted(versions_read.items())),
        "score_or_label_changes": sum(c.changed(SCORE_FIELDS) for c in changes),
        "only_probabilities_or_audit_columns": sum(
            c.changed(VALUE_FIELDS) and not c.changed(SCORE_FIELDS) for c in changes
        ),
        "label_changes": sum(label_moves.values()),
        "label_moves": {f"{a} -> {b}": n for (a, b), n in sorted(label_moves.items(), key=str)},
        # contradiction_prob is in the same place in the old and the new label order, so it should
        # not move. If it does, the stored text or the model is not what scored the row.
        "max_contradiction_prob_shift": max(
            (abs(c.new["contradiction_prob"] - c.old["contradiction_prob"]) for c in changes
             if c.old["contradiction_prob"] is not None and c.new["contradiction_prob"] is not None),
            default=0.0,
        ),
    }


def write_csv(path: str, changes: list[RowChange]) -> None:
    """Every field of every row, old and new side by side."""
    columns = ["evaluation_id", "span_id", "trace_id", "agent_id", "score_or_label_changed"]
    columns += [f"{f}_{side}" for f in FIELDS for side in ("old", "new")]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for c in changes:
            row = [c.evaluation_id, c.span_id, c.trace_id, c.agent_id, c.changed(SCORE_FIELDS)]
            for f in FIELDS:
                row += [c.old[f], c.new[f]]
            writer.writerow(["" if v is None else v for v in row])


def _fmt(value: Any) -> str:
    if value is None:
        return "-"
    return f"{value:.4f}" if isinstance(value, float) else str(value)


def _pair(old: Any, new: Any) -> str:
    return f"{_fmt(old)} -> {_fmt(new)}"


def format_report(
    summary: dict[str, Any], changes: list[RowChange], skipped: list[tuple[int, str]],
    alerts: list[dict[str, Any]], derived: dict[str, Any], applied: bool, seconds: float,
) -> str:
    """The text the operator reads."""
    lines = [
        "APPLIED: the values below were written." if applied
        else "DRY RUN: nothing was written. Re-run with --apply to write.",
        "",
        f"Rows not at model_version '{CURRENT.model_version}': {summary['rows_not_current']}"
        f"  (rescored {summary['rows_rescored']}, skipped {summary['rows_skipped']})",
        "  rescored rows, by the model_version they had: "
        + (", ".join(f"{v}: {n}" for v, n in summary["versions_read"].items()) or "-"),
        f"  score or label changes:                  {summary['score_or_label_changes']}",
        f"  only NLI probabilities / audit columns:  {summary['only_probabilities_or_audit_columns']}",
        f"  risk label changes:                      {summary['label_changes']}",
    ]
    lines += [f"    {move}: {n}" for move, n in summary["label_moves"].items()]
    info = backend_info()
    lines += [
        f"Largest change in contradiction_prob: {summary['max_contradiction_prob_shift']:.4f} (expected ~0)",
        f"NLI backend: {info['nli_backend']}   scoring took {seconds:.1f} s",
        "",
    ]

    shown = [c for c in changes if c.changed(SCORE_FIELDS)]
    if shown:
        lines.append("Before / after (rows whose score or label changes; every row is in the CSV)")
        lines.append(f"{'id':>5} {'span_id':<14} {'agent':<20} {'grounding':<20} {'tool_claim':<20} "
                     f"{'risk':<20} label")
        for c in shown:
            lines.append(
                f"{c.evaluation_id:>5} {c.span_id[:14]:<14} {(c.agent_id or '-')[:20]:<20} "
                f"{_pair(c.old['grounding_score'], c.new['grounding_score']):<20} "
                f"{_pair(c.old['tool_claim_score'], c.new['tool_claim_score']):<20} "
                f"{_pair(c.old['overall_risk_score'], c.new['overall_risk_score']):<20} "
                f"{c.old['label'] or '-'} -> {c.new['label'] or '-'}"
            )
        lines.append("")

    verb = "Recomputed" if applied else "Would recompute"
    lines.append(f"{verb} from the new scores (nothing else outside evaluations is touched):")
    for agent_id, before, after in derived["agents"]:
        lines.append(f"  agent_records.avg_risk_score  {agent_id}: {_pair(before, after)}")
    for agent_id in derived["agents_left_alone"]:
        lines.append(f"  agent_records.avg_risk_score  {agent_id}: LEFT ALONE, the stored value is "
                     "not what the evaluation rows give, so it cannot be rebuilt from them")
    lines.append(f"  traces.overall_risk_score: {len(derived['traces'])} trace(s)")
    lines.append("")

    lines.append("Alerts whose triggering score is now different (NOT changed; the owner decides): "
                 f"{len(alerts)}")
    for a in alerts:
        state = "resolved" if a["resolved"] else "acknowledged" if a["acknowledged"] else "open"
        head = f"  #{a['id']} {a['type']} ({state}) agent {a['agent_id']} span {a['span_id']}: "
        if a["note"]:
            lines.append(head + a["note"])
        else:
            fires = "still above" if a["now"] is not None and a["now"] > a["threshold"] else "no longer above"
            lines.append(head + f"{a['field']} {_pair(a['was'], a['now'])}, {fires} threshold {a['threshold']}")
    if applied and derived["rows_written"] < len(changes):
        lines += ["", f"NOT WRITTEN: {len(changes) - derived['rows_written']} row(s) changed model_version "
                  "after they were read (another run, or the worker). They are left as that run "
                  "wrote them; run again to pick up any that are still not current."]
    if skipped:
        lines += ["", f"SKIPPED, left at their stored model_version (fix the cause and run again): {len(skipped)}"]
        lines += [f"  evaluation {eid}: {reason}" for eid, reason in skipped]
    return "\n".join(lines)


async def run(
    session_factory, stale: list[tuple[Evaluation, Optional[Span]]], pipeline: EvaluationPipeline,
    *, apply: bool, csv_path: Optional[str],
) -> int:
    """Score the rows again, report, and write only when `apply` is True. Returns the exit code."""
    started = time.perf_counter()
    changes, skipped = rescore_rows(stale, pipeline)
    seconds = time.perf_counter() - started
    alerts = await affected_alerts(session_factory, changes)
    if apply:
        derived = await apply_rescore(session_factory, changes)
    else:
        async with session_factory() as session:
            derived = await plan_derived(session, changes)
    if csv_path:
        write_csv(csv_path, changes)
    print(format_report(summarize(changes, skipped), changes, skipped, alerts, derived, apply, seconds))
    # Not 0 when a row could not be rescored, so a script running this does not read it as done.
    return 1 if skipped else 0


async def _amain(apply: bool, csv_path: Optional[str]) -> int:
    """Load the models, then run. Stops before scoring a row if the models are not all loaded."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.info("Database: %s", settings.database_url)

    stale = await load_stale(get_session)
    if not stale:
        print(f"No evaluation rows with a model_version other than '{CURRENT.model_version}'. Nothing to do.")
        return 0

    # The same load as the worker. Without the NLI model evaluate_grounding falls back to a
    # similarity-only score, which must never be written over an NLI score.
    load_models(
        nli_model_name=settings.nli_model,
        embedding_model_name=settings.embedding_model,
        cache_dir=settings.model_cache_dir,
        use_onnx=settings.use_onnx,
        sync=True,
    )
    loaded = models_loaded()
    if not all(loaded.values()):
        raise SystemExit(f"ABORT: models not fully loaded ({loaded}); nothing was changed.")

    # Only _aggregate_risk and _classify_risk of the pipeline are used; neither reads its state.
    pipeline = EvaluationPipeline(DriftDetector(), AlertEngine())
    return await run(get_session, stale, pipeline, apply=apply, csv_path=csv_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Re-score evaluation rows whose model_version is not the current one"
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="write the new values (without it nothing is written)",
    )
    parser.add_argument(
        "--csv", metavar="PATH", default=None,
        help="also write every row's old and new values to this CSV file",
    )
    return parser


def main() -> None:
    """Read the command-line options, run once, and exit."""
    args = build_parser().parse_args()
    raise SystemExit(asyncio.run(_amain(args.apply, args.csv)))


if __name__ == "__main__":
    main()
