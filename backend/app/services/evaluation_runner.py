"""Run one evaluation job and persist its results, idempotently.

This is the evaluation orchestration that previously lived inside
`routers/ingest.py` as `_evaluate_spans_background`. It was moved so that a
worker process can execute it without importing the API router, which is what
"separate the worker from the API" actually requires. **The evaluator's own
logic is untouched** -- grounding, drift, disagreement and tool-claim are called
exactly as before, with the same arguments in the same order.

WHY IDEMPOTENCE IS THE LOAD-BEARING PART

A durable queue gives at-least-once delivery, not exactly-once. A worker can
finish an evaluation, write the results, and be killed before it marks the job
succeeded; the lease then expires and another worker runs the same job. Without
a guard, that produces a second Evaluation row for the same span -- the queue
would have traded silent loss for silent duplication, which is not an
improvement.

`persist_results` therefore checks for an existing Evaluation for the span and
skips if one is present. Combined with at-least-once delivery, the *effect* of a
job is exactly-once even though its *execution* may not be. That is the property
worth claiming, and it is what the crash test verifies.

Malformed payloads raise `MalformedJobError`, which the worker treats as
permanent: a payload missing its span_id is still missing it on attempt three,
so retrying only occupies a worker and delays real work.
"""

from __future__ import annotations

import functools
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import literal_column
from sqlmodel import select

from app.database import get_session
from app.models import (
    AgentRecord,
    Alert,
    Baseline,
    DriftRecord,
    Evaluation,
    Span,
)

logger = logging.getLogger("agentpulse.evaluation_runner")


class MalformedJobError(ValueError):
    """Payload cannot yield an evaluation, and never will. Do not retry."""


REQUIRED_FIELDS = ("span_id", "trace_id", "agent_id")


def parse_payload(payload_json: str) -> dict[str, Any]:
    try:
        payload = json.loads(payload_json)
    except (TypeError, ValueError) as exc:
        raise MalformedJobError(f"payload is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise MalformedJobError(f"payload is {type(payload).__name__}, expected object")
    missing = [f for f in REQUIRED_FIELDS if not payload.get(f)]
    if missing:
        raise MalformedJobError(f"payload missing required field(s): {', '.join(missing)}")
    return payload


async def fetch_prior_agent_outputs(
    trace_id: str,
    span_id: str,
    limit: int = 12,
) -> list[tuple[str, str]]:
    """Earlier agents of this span's trace, for cross-agent comparison.

    Moved verbatim from routers/ingest.py; the ordering rationale below is the
    original and still applies.

    Scoped to the trace and restricted to spans ordering *before* this one. Trace
    scoping is what makes the comparison meaningful -- the SDK batches a flat
    buffer with no trace grouping, so an unscoped comparison could pair agents
    from different traces. The before-only restriction stops each pair being
    evaluated twice, once from each side.

    Ordering is (start_time, rowid). start_time is the trace's real order but can
    tie, since clock granularity groups fast spans and some producers stamp a
    whole trace once. span_id is random hex, so using it as tiebreak would order
    tied spans arbitrarily. SQLite's rowid is insertion order, which for a trace
    is the order the SDK emitted its spans.
    """
    async with get_session() as session:
        rows = await session.execute(
            select(Span.span_id, Span.agent_id, Span.output_summary)
            .where(Span.trace_id == trace_id)
            .order_by(Span.start_time, literal_column("rowid"))
        )
        ordered = rows.all()

    position = next(
        (i for i, (sid, _, _) in enumerate(ordered) if sid == span_id),
        len(ordered),
    )
    priors = [
        (agent_id, output_summary)
        for _, agent_id, output_summary in ordered[:position]
        if output_summary
    ]
    return priors[-limit:]


async def evaluation_exists(span_id: str) -> bool:
    """Has this span already been evaluated?

    The idempotency guard. Checked before persisting so a redelivered job does
    not write a second result.
    """
    async with get_session() as session:
        row = await session.execute(
            select(Evaluation.id).where(Evaluation.span_id == span_id).limit(1)
        )
        return row.first() is not None


def run_evaluation_sync(evaluator, payload: dict[str, Any],
                        prior_agent_outputs: list[tuple[str, str]]):
    """Call the evaluator. Synchronous and CPU-bound; the caller offloads it.

    Argument construction is identical to the previous in-router version.
    """
    tool_name = payload.get("tool_name")
    return evaluator.evaluate_span(
        span_id=payload["span_id"],
        trace_id=payload["trace_id"],
        agent_id=payload["agent_id"],
        input_text=payload.get("input_summary"),
        output_text=payload.get("output_summary"),
        upstream_agent_id=prior_agent_outputs[-1][0] if prior_agent_outputs else None,
        upstream_output=prior_agent_outputs[-1][1] if prior_agent_outputs else None,
        prior_agent_outputs=prior_agent_outputs or None,
        tool_calls=(
            [{"tool_name": tool_name,
              "result_summary": payload.get("tool_result_summary")}]
            if tool_name else None
        ),
        status=payload.get("status", "success"),
    )


async def persist_results(payload: dict[str, Any], result) -> bool:
    """Write evaluation, drift record, alerts and agent risk. Idempotent.

    Returns True if results were written, False if an evaluation for this span
    already existed and the call was a no-op.
    """
    span_id = payload["span_id"]

    if await evaluation_exists(span_id):
        logger.info(
            "Evaluation already exists for span %s; skipping duplicate persist", span_id
        )
        return False

    async with get_session() as session:
        evaluation = Evaluation(
            span_id=span_id,
            trace_id=payload["trace_id"],
            grounding_score=result.grounding.grounding_score if result.grounding else None,
            entailment_prob=result.grounding.entailment_prob if result.grounding else None,
            contradiction_prob=(
                result.grounding.contradiction_prob if result.grounding else None
            ),
            neutral_prob=result.grounding.neutral_prob if result.grounding else None,
            tool_claim_score=(
                result.tool_claim.tool_claim_score if result.tool_claim else None
            ),
            disagreement_score=(
                result.disagreement.disagreement_score if result.disagreement else None
            ),
            overall_risk_score=result.overall_risk_score,
            label=result.risk_label,
            evaluation_stage=(
                result.grounding.evaluation_stage if result.grounding else "skipped"
            ),
            evaluator_name=result.evaluator_name,
            model_name=result.model_name,
            model_version=result.model_version,
            config_version=result.config_version,
            threshold_version=result.threshold_version,
        )
        session.add(evaluation)

        if result.drift:
            session.add(DriftRecord(
                agent_id=payload["agent_id"],
                node_name=payload["agent_id"],
                span_id=span_id,
                centroid_distance=result.drift.centroid_distance,
                tool_drift=result.drift.tool_drift,
                quality_drift=result.drift.quality_drift,
                error_rate_delta=result.drift.error_rate_delta,
                stability_index=result.drift.stability_index,
                baseline_size=result.drift.baseline_size,
            ))

        for alert in result.alerts:
            session.add(Alert(
                trace_id=alert.trace_id,
                span_id=alert.span_id,
                agent_id=alert.agent_id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                message=alert.message,
                details_json=json.dumps(alert.details),
            ))

        if result.overall_risk_score is not None:
            agent_result = await session.execute(
                select(AgentRecord).where(AgentRecord.agent_id == payload["agent_id"])
            )
            agent = agent_result.scalar_one_or_none()
            if agent:
                if agent.avg_risk_score is not None:
                    agent.avg_risk_score = (
                        agent.avg_risk_score * 0.95 + result.overall_risk_score * 0.05
                    )
                else:
                    agent.avg_risk_score = result.overall_risk_score
                if result.drift and result.drift.stability_index is not None:
                    agent.current_asi = result.drift.stability_index

        await session.commit()
    return True


async def persist_drift_baselines(drift_detector, agent_ids: set[str]) -> None:
    """Upsert embedding-centroid baselines. Moved verbatim from ingest.py."""
    agent_ids = drift_detector.touched_agent_ids(agent_ids)
    if not agent_ids:
        return

    async with get_session() as session:
        for agent_id in agent_ids:
            data = drift_detector.serialize_centroid(agent_id)
            if data is None:
                continue
            info = drift_detector.get_baseline_info(agent_id)

            result = await session.execute(
                select(Baseline).where(
                    Baseline.agent_id == agent_id,
                    Baseline.baseline_type == "embedding_centroid",
                )
            )
            baseline = result.scalar_one_or_none()
            if baseline is None:
                session.add(Baseline(
                    agent_id=agent_id,
                    baseline_type="embedding_centroid",
                    data=data,
                    sample_count=info["sample_count"],
                ))
            else:
                baseline.data = data
                baseline.sample_count = info["sample_count"]
                baseline.updated_at = datetime.now(timezone.utc)

        await session.commit()


async def execute_job(evaluator, payload_json: str, loop, executor) -> bool:
    """Run one job end to end. Raises on failure so the worker can classify it.

    Returns whether results were newly written (False means the idempotency
    guard suppressed a duplicate).
    """
    payload = parse_payload(payload_json)
    priors = await fetch_prior_agent_outputs(payload["trace_id"], payload["span_id"])

    result = await loop.run_in_executor(
        executor,
        functools.partial(run_evaluation_sync, evaluator, payload, priors),
    )

    written = await persist_results(payload, result)
    await persist_drift_baselines(evaluator.drift_detector, {payload["agent_id"]})
    return written
