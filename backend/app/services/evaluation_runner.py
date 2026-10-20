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

# ---- What this file is for ---------------------------------------------------
# This file runs ONE evaluation job from start to finish, inside the worker process.
# It reads the span data from the job, fetches the outputs of earlier agents in the same
# trace, runs the evaluator (the scoring), and then saves the scores, the drift record,
# the alerts and the updated risk numbers in the database. Saving is "idempotent":
# doing it twice leaves the same result as doing it once.
#
# How it fits in: app/worker.py calls `execute_job` for each job it claims from
# services/job_queue.py. This file calls EvaluationPipeline.evaluate_span
# (services/evaluator.py) and reads and writes tables from app/models.py through
# get_session (app/database.py).
# ------------------------------------------------------------------------------

from __future__ import annotations

# functools.partial packs a function together with its arguments (used in execute_job).
import functools
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

# literal_column lets a query use a raw SQL column name, here SQLite's hidden `rowid`.
from sqlalchemy import literal_column
from sqlmodel import select

# get_session gives a database session that commits on success and rolls back on error.
from app.database import get_session
from app.models import (
    AgentRecord,
    Alert,
    Baseline,
    DriftRecord,
    Evaluation,
    Span,
    Trace,
)
# extract_result_count reads a number such as "3" out of a tool's result text.
from app.services.tool_claim import extract_result_count

logger = logging.getLogger("agentpulse.evaluation_runner")


# Raised for a job that can never work. app/worker.py catches it and marks the job
# `failed` straight away, with no retry.
class MalformedJobError(ValueError):
    """Payload cannot yield an evaluation, and never will. Do not retry."""


# Every job payload must contain these three fields, non-empty (see parse_payload).
REQUIRED_FIELDS = ("span_id", "trace_id", "agent_id")

# In short: a flag that makes the "no text captured" warning appear only once per process.
# Grounding is skipped, silently and by design, when a span carries no captured
# text. That is the single most confusing state this system can be in: the
# worker is healthy, jobs succeed, and the column the whole project is about
# stays empty. Logged once per process rather than per span, because at one line
# per evaluation it would be noise and get filtered out -- which is how it
# stayed invisible in the first place.
_warned_no_text = False

# In short: the same kind of once-only flag, for the "evidence was cut off" warning.
# Same treatment for premise truncation. DeBERTa sees at most 512 tokens, so a
# long retrieved context can have the passage that supports the claim cut off --
# and the score still comes back looking ordinary. Reported once per process for
# the same reason: per span it would be noise.
_warned_truncated = False


def _warn_if_no_text_once(payload: dict[str, Any]) -> None:
    """Log a warning the first time a span arrives with no input text or no output text.

    Grounding needs both texts, so without them that score is left empty. After the first
    warning, later calls do nothing.
    """
    # `global` means we change the module-level flag, not a local copy of it.
    global _warned_no_text
    # Already warned once in this process: stay quiet.
    if _warned_no_text:
        return
    # Both texts are present: nothing is wrong, so there is nothing to warn about.
    if payload.get("input_summary") and payload.get("output_summary"):
        return
    # At least one text is missing (or empty). Remember that we warned, then warn.
    _warned_no_text = True
    logger.warning(
        "Span %s carries no captured input/output text, so grounding was not "
        "evaluated. The SDK omits this text unless AGENTPULSE_CAPTURE_INPUTS and "
        "AGENTPULSE_CAPTURE_OUTPUTS are true; both default to false. Evaluations "
        "will keep succeeding with no grounding score until that changes. "
        "Reported once per worker process; see signal_coverage in /v1/platform "
        "for the ongoing rate.",
        payload.get("span_id"),
    )


def parse_payload(payload_json: str) -> dict[str, Any]:
    """Turn the job's JSON text into a dict and check it has what we need.

    Returns the dict. Raises MalformedJobError if the text is not valid JSON, is not a
    JSON object, or lacks one of REQUIRED_FIELDS.
    """
    # Step 1: read the JSON text. TypeError covers a missing payload (None), and
    # ValueError covers text that is not valid JSON.
    try:
        payload = json.loads(payload_json)
    except (TypeError, ValueError) as exc:
        raise MalformedJobError(f"payload is not valid JSON: {exc}") from exc
    # Step 2: a JSON list or number is valid JSON but is not what we expect.
    if not isinstance(payload, dict):
        raise MalformedJobError(f"payload is {type(payload).__name__}, expected object")
    # Step 3: collect the required fields that are absent or empty (None, "" and 0 all
    # count as missing).
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
    # Step 1: read every span of this trace, in trace order. SQL meaning: take span id,
    # agent id and output text of all spans with this trace id, sorted by start_time and
    # then by SQLite's hidden insertion number (`rowid`) to break ties.
    async with get_session() as session:
        rows = await session.execute(
            select(Span.span_id, Span.agent_id, Span.output_summary)
            .where(Span.trace_id == trace_id)
            .order_by(Span.start_time, literal_column("rowid"))
        )
        ordered = rows.all()

    # Step 2: find where the current span sits in that list. If it is not found, the
    # default (len(ordered)) makes every span in the list count as "earlier".
    position = next(
        (i for i, (sid, _, _) in enumerate(ordered) if sid == span_id),
        len(ordered),
    )
    # Step 3: keep only the spans before this one that have some output text, as
    # (agent_id, output_text) pairs.
    priors = [
        (agent_id, output_summary)
        for _, agent_id, output_summary in ordered[:position]
        if output_summary
    ]
    # Keep only the last `limit` pairs (12 by default), which are the most recent ones.
    return priors[-limit:]


async def evaluation_exists(span_id: str) -> bool:
    """Has this span already been evaluated?

    The idempotency guard. Checked before persisting so a redelivered job does
    not write a second result.
    """
    # Ask the database for the id of any Evaluation row with this span id. limit(1) stops
    # at the first match, and .first() gives None when no row matched.
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
    # A span carries at most one tool call, stored in these two payload fields.
    tool_name = payload.get("tool_name")
    tool_result_summary = payload.get("tool_result_summary")
    # Pass the span's fields to the evaluator. The "upstream" agent is the last pair in
    # the prior list (the agent of the nearest earlier span), or None when it is empty.
    # `prior_agent_outputs or None` turns an empty list into None.
    return evaluator.evaluate_span(
        span_id=payload["span_id"],
        trace_id=payload["trace_id"],
        agent_id=payload["agent_id"],
        input_text=payload.get("input_summary"),
        output_text=payload.get("output_summary"),
        upstream_agent_id=prior_agent_outputs[-1][0] if prior_agent_outputs else None,
        upstream_output=prior_agent_outputs[-1][1] if prior_agent_outputs else None,
        prior_agent_outputs=prior_agent_outputs or None,
        # With a tool name, send a one-item list describing the tool call. Without one,
        # send None, so the tool-claim check is skipped.
        tool_calls=(
            [{
                "tool_name": tool_name,
                "result_summary": tool_result_summary,
                # Without a result_count the WRONG_COUNT check returns early,
                # so the tool-claim signal could never fire on this path.
                "result_count": extract_result_count(tool_result_summary),
                "status": payload.get("status", "success"),
            }]
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

    # Step 1: the idempotency guard. If this span already has an evaluation (for example
    # the job was delivered a second time), write nothing.
    if await evaluation_exists(span_id):
        logger.info(
            "Evaluation already exists for span %s; skipping duplicate persist", span_id
        )
        return False

    # Everything below happens in one session, saved by a single commit at the end, so
    # the rows are stored together.
    async with get_session() as session:
        # Step 2: build the Evaluation row. Each `x if result.y else None` means: use the
        # score if that check ran, otherwise store None (empty). A check does not run
        # when its input is missing, for example grounding needs both input and output
        # text. The evaluator, model, version and config fields are fixed labels copied
        # from EvaluationResult, not read from settings. evaluation_stage is "skipped"
        # when there was no grounding result.
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
            tool_claims_found=(
                result.tool_claim.total_claims if result.tool_claim else None
            ),
            grounding_input_truncated=(
                result.grounding.input_truncated if result.grounding else None
            ),
            grounding_input_tokens=(
                result.grounding.input_tokens if result.grounding else None
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

        # Step 3: if drift was computed, save one DriftRecord with this span's drift numbers:
        # two distances from the agent's normal (centroid_distance for this one output,
        # window_centroid_distance for its latest outputs against its first ones),
        # tool_drift, quality_drift, error_rate_delta, and the ASI (Agent Stability Index,
        # a 0 to 100 stability number). node_name is set to the agent id here.
        if result.drift:
            session.add(DriftRecord(
                agent_id=payload["agent_id"],
                node_name=payload["agent_id"],
                span_id=span_id,
                centroid_distance=result.drift.centroid_distance,
                window_centroid_distance=result.drift.window_centroid_distance,
                tool_drift=result.drift.tool_drift,
                quality_drift=result.drift.quality_drift,
                error_rate_delta=result.drift.error_rate_delta,
                stability_index=result.drift.stability_index,
                baseline_size=result.drift.baseline_size,
            ))

        # Step 4: save one Alert row for each alert the alert engine raised. The extra
        # details (a dict) are stored as JSON text.
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

        # Step 5: update the agent and the trace, but only when this span got a risk
        # score. If the agent or trace row does not exist, that update is skipped.
        if result.overall_risk_score is not None:
            agent_result = await session.execute(
                select(AgentRecord).where(AgentRecord.agent_id == payload["agent_id"])
            )
            agent = agent_result.scalar_one_or_none()
            if agent:
                # The agent's average risk is a running average that favours history:
                # new average = 95% of the old average + 5% of this span's score. So one
                # span moves it only a little. The first score is stored as it is.
                if agent.avg_risk_score is not None:
                    agent.avg_risk_score = (
                        agent.avg_risk_score * 0.95 + result.overall_risk_score * 0.05
                    )
                else:
                    agent.avg_risk_score = result.overall_risk_score
                # Keep the latest stability number (ASI) when drift produced one.
                if result.drift and result.drift.stability_index is not None:
                    agent.current_asi = result.drift.stability_index

            # Update trace status and overall risk
            # The trace keeps the HIGHEST risk score of any of its spans so far (rounded
            # to 4 decimals). Its status is set to "completed" as soon as any span of the
            # trace has been scored.
            trace_result = await session.execute(
                select(Trace).where(Trace.trace_id == payload["trace_id"])
            )
            trace = trace_result.scalar_one_or_none()
            if trace:
                if trace.overall_risk_score is not None:
                    trace.overall_risk_score = round(max(trace.overall_risk_score, result.overall_risk_score), 4)
                else:
                    trace.overall_risk_score = round(result.overall_risk_score, 4)
                trace.status = "completed"

        # Save everything added above in one commit.
        await session.commit()
    return True


async def persist_drift_baselines(drift_detector, agent_ids: set[str]) -> None:
    """Upsert embedding-centroid baselines. Moved verbatim from ingest.py."""
    # What this does: the drift detector remembers each agent's "normal" in memory (a
    # centroid = a running average of the embeddings of its outputs). Here we copy it into the
    # `baselines` table, so a worker restart can load it back (app/worker.py does this at
    # startup). "Upsert" = update the row if it exists, otherwise insert a new one.
    #
    # Step 1: keep only agents the detector actually holds a centroid for.
    agent_ids = drift_detector.touched_agent_ids(agent_ids)
    if not agent_ids:
        return

    async with get_session() as session:
        for agent_id in agent_ids:
            # Step 2: turn the in-memory centroid into bytes for storage. No centroid
            # means nothing to save for this agent. `info` gives the sample count.
            data = drift_detector.serialize_centroid(agent_id)
            if data is None:
                continue
            info = drift_detector.get_baseline_info(agent_id)

            # Step 3: look for an existing "embedding_centroid" row for this agent.
            result = await session.execute(
                select(Baseline).where(
                    Baseline.agent_id == agent_id,
                    Baseline.baseline_type == "embedding_centroid",
                )
            )
            baseline = result.scalar_one_or_none()
            # No row yet: insert one. Otherwise: overwrite the data, sample count and time.
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

            # The window-drift baseline pool is a separate structure from the EMA
            # centroid and has to be persisted separately, or the sustained-shift
            # metric restarts cold every time even though the centroid survives.
            # Step 4: same upsert pattern for the second baseline type,
            # "window_baseline_pool". It comes back as (bytes, sample count) or None.
            window = drift_detector.serialize_window_baseline(agent_id)
            if window is not None:
                window_data, window_count = window
                window_result = await session.execute(
                    select(Baseline).where(
                        Baseline.agent_id == agent_id,
                        Baseline.baseline_type == "window_baseline_pool",
                    )
                )
                window_baseline = window_result.scalar_one_or_none()
                if window_baseline is None:
                    session.add(Baseline(
                        agent_id=agent_id,
                        baseline_type="window_baseline_pool",
                        data=window_data,
                        sample_count=window_count,
                    ))
                else:
                    window_baseline.data = window_data
                    window_baseline.sample_count = window_count
                    window_baseline.updated_at = datetime.now(timezone.utc)

        # Save all the baseline rows of every agent in one commit.
        await session.commit()


async def execute_job(evaluator, payload_json: str, loop, executor) -> bool:
    """Run one job end to end. Raises on failure so the worker can classify it.

    Returns whether results were newly written (False means the idempotency
    guard suppressed a duplicate).
    """
    # Step 1: read and check the job's data. Raises MalformedJobError if it is broken.
    payload = parse_payload(payload_json)
    # Step 2: warn once per process if the span has no input or output text.
    _warn_if_no_text_once(payload)
    # Step 3: get the earlier agents' outputs from the same trace (for disagreement).
    priors = await fetch_prior_agent_outputs(payload["trace_id"], payload["span_id"])

    # Step 4: run the evaluator. It is slow, CPU-heavy model work, so it runs in the
    # executor (a thread pool) instead of on the async event loop. Otherwise the loop
    # would be blocked while the models run. functools.partial packs the function and
    # its arguments so the executor can call it with no arguments.
    result = await loop.run_in_executor(
        executor,
        functools.partial(run_evaluation_sync, evaluator, payload, priors),
    )

    # Step 5: warn once per process if the evidence was too long for the NLI model.
    _warn_if_truncated_once(result)
    # Step 6: save the scores. `written` is False if this span was already evaluated.
    written = await persist_results(payload, result)
    # Step 7: save the agent's drift baselines. This runs even when step 6 skipped a
    # duplicate: the evaluator already changed its in-memory baseline in step 4.
    await persist_drift_baselines(evaluator.drift_detector, {payload["agent_id"]})
    return written


def _warn_if_truncated_once(result) -> None:
    """Log a warning the first time the NLI model was given more text than it can read.

    Does nothing when grounding did not run, or when the text fit. After the first
    warning, later calls do nothing.
    """
    global _warned_truncated
    # Already warned, or there is no grounding result to look at.
    if _warned_truncated or result.grounding is None:
        return
    # getattr with a default reads the field safely; the text fit if it is False.
    if not getattr(result.grounding, "input_truncated", False):
        return
    _warned_truncated = True
    logger.warning(
        "Grounding premise exceeded the NLI model's 512-token window (%s tokens) "
        "and was truncated. Evidence past that point was not read, so the score "
        "reflects only the part the model saw. Long retrieved contexts are the "
        "usual cause. Reported once per worker process.",
        getattr(result.grounding, "input_tokens", "unknown"),
    )
