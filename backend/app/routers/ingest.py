"""Ingest router — receives spans from the SDK and triggers evaluation."""

# WHAT THIS FILE IS FOR
# The "write side" of the API. POST /v1/ingest receives a batch of spans from the SDK and
# saves them (a span = one recorded step of an agent). For every span it also adds a job to
# a durable queue (rows in a database table), so a separate worker process can score the span
# later. This file never scores anything itself. POST /v1/simulate builds a fake 5-agent run
# and sends it through the same ingest code, so the dashboard can show demo failures.
#
# HOW IT FITS IN
# main.py adds `router`. It uses job_queue.enqueue_job, runtime_metrics.COUNTERS, the Trace /
# Span / AgentRecord tables, and the WebSocket manager (routers/websocket.py) to push live
# updates. The worker (`python -m app.worker`) reads the queue and does the scoring.

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

# FastAPI: APIRouter groups URLs; Request gives access to the incoming request (and to
# request.app.state). BackgroundTasks is still a parameter below but nothing uses it now.
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
# select() builds a SQL query.
from sqlmodel import select

from app.database import get_session
from app.models import (
    AgentRecord,
    Span,
    Trace,
)
# enqueue_job adds one evaluation job (one row in a database table) for a span.
from app.services.job_queue import enqueue_job
# COUNTERS = in-memory counters (spans accepted, failed, duplicate...) that /v1/platform shows.
from app.services.runtime_metrics import COUNTERS

# In short: this file only saves spans and queues work. Scoring happens in the worker.
# Evaluation no longer runs in this process. Ingest persists spans, enqueues a
# durable job per span, and returns; a separate worker process
# (`python -m app.worker`) drains the queue.
#
# What this replaced: `background_tasks.add_task(_evaluate_spans_background, …)`
# held pending evaluations in a list inside the API process. Measured on that
# design, a SIGKILL mid-batch lost every un-started evaluation with no record
# that it had been owed, and a failing evaluation was caught, logged and
# dropped. See experiments/results/durability_measurements.json.
#
# The evaluation orchestration itself moved verbatim to
# app/services/evaluation_runner.py so the worker can call it without importing
# this router. Evaluator logic is unchanged.

logger = logging.getLogger("agentpulse.router.ingest")
# All routes in this file start with /v1 (the full paths are /v1/ingest and /v1/simulate).
router = APIRouter(prefix="/v1", tags=["ingest"])


# Pydantic models for request/response (imported from SDK schemas)
# pydantic models describe the shape of JSON data. FastAPI uses them to check what arrives
# and answers 422 on its own if a required field is missing or has the wrong type.
from pydantic import BaseModel, Field
from typing import Any, Optional


# One span as the SDK sends it in the request body. A span = one recorded step of an agent.
# Only trace_id, span_id and agent_id are required; everything else has a default.
class SpanInput(BaseModel):
    # trace_id ties together all the spans of one run. span_id names this step.
    trace_id: str
    span_id: str
    # The span this step hangs under; None for a top-level step.
    parent_span_id: Optional[str] = None
    # Which agent did this step, a free-text description of its job, and its workflow name.
    agent_id: str
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None
    # Labels for the kind of step. The defaults are used when the SDK sends nothing.
    event_type: str = "agent_execution"
    span_kind: str = "AGENT"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    # How long the step took, in milliseconds.
    latency_ms: Optional[float] = None
    # "success" means fine. Any other value counts as an error for the agent's error count.
    status: str = "success"
    error_message: Optional[str] = None
    # input_summary = the evidence the agent saw; output_summary = what it said.
    input_summary: Optional[str] = None
    output_summary: Optional[str] = None
    # Hashes (fingerprints) of the input and output text, set by the SDK.
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None
    # LLM details: the model name and the number of tokens in the prompt and in the answer.
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    # Tool details. tool_result_summary is what the tool really returned; the tool-claim check
    # compares the agent's words against it.
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result_summary: Optional[str] = None
    # Any extra key/value data; saved as JSON text. default_factory=dict gives each span its
    # own new empty dict.
    metadata: dict[str, Any] = Field(default_factory=dict)


# The whole request body of POST /v1/ingest: a batch of spans plus who sent them.
class IngestPayload(BaseModel):
    spans: list[SpanInput]
    sdk_version: str = "0.1.0"
    # Saved on the Trace row when a new trace is created.
    service_name: str = "default"


# The reply of POST /v1/ingest.
class IngestResponse(BaseModel):
    # Spans that were saved (this includes spans that were already known; see ingest_spans).
    accepted: int
    # Spans that raised an error while being saved.
    failed: int
    message: str = "OK"
    # One text per failed span: "Span <id>: " plus the error message cut to 100 characters.
    errors: list[str] = Field(default_factory=list)


# POST /v1/ingest -> the SDK sends a batch of spans here.
# status_code=202 means "Accepted": received, will be processed later (by the worker).
# response_model makes FastAPI check that the reply matches IngestResponse.
@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_spans(
    payload: IngestPayload,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Receive spans from the AgentPulse SDK.

    Persists spans, then enqueues one durable evaluation job per span. Returns
    202 Accepted; a separate worker process performs the evaluation, so nothing
    in this request path depends on evaluation succeeding or on this process
    staying alive.

    Re-submitting a span is a no-op rather than an error: the span is not
    re-inserted and the job is deduplicated by `job_key`.
    """
    # Step 1: counters for the reply. accepted = spans saved (or already known), failed = spans
    # that raised an error, duplicates = spans whose span_id was already stored, errors = short
    # error texts, enqueue_targets = the spans that should get an evaluation job.
    accepted = 0
    failed = 0
    duplicates = 0
    errors = []
    enqueue_targets: list[SpanInput] = []

    # Step 2: save the spans, one by one. Each span has its own try/except below, so one bad
    # span is counted as failed and does not stop the others.
    async with get_session() as session:
        for span_input in payload.spans:
            try:
                # Ensure trace exists
                # (_ensure_trace runs before the duplicate check below, so it adds 1 to the
                # trace's total_spans even for a span that is sent a second time.)
                await _ensure_trace(session, span_input, payload.service_name)

                # In short: if this span_id is already stored, do not insert it again (that
                # used to crash the whole batch), but still queue its job.
                # Idempotent re-submission. Previously a repeat POST of the same
                # span_id violated the primary key, and because the flush happens
                # at commit the WHOLE batch failed with HTTP 500 -- measured as
                # [202, 500, 500] across three identical submissions. A retrying
                # SDK could therefore destroy an entire batch of unrelated spans.
                # An already-known span is now simply not re-inserted; it still
                # gets an evaluation job, which the job_key UNIQUE constraint
                # deduplicates.
                # The query asks: is there a stored span with this span_id? first() gives the
                # first matching row, or None if there is none.
                existing = await session.execute(
                    select(Span.span_id).where(Span.span_id == span_input.span_id)
                )
                if existing.first() is not None:
                    duplicates += 1
                    accepted += 1
                    enqueue_targets.append(span_input)
                    continue

                # Create span record
                # Copy the request fields into a new Span row. Times are stored without a
                # timezone label (the SDK sends UTC). replace(tzinfo=None) only removes the
                # label and does not convert, so another offset keeps its clock value as
                # sent. A missing start_time becomes "now".
                span = Span(
                    span_id=span_input.span_id,
                    trace_id=span_input.trace_id,
                    parent_span_id=span_input.parent_span_id,
                    agent_id=span_input.agent_id,
                    agent_role=span_input.agent_role,
                    pipeline_id=span_input.pipeline_id,
                    span_kind=span_input.span_kind,
                    event_type=span_input.event_type,
                    input_summary=span_input.input_summary,
                    output_summary=span_input.output_summary,
                    input_hash=span_input.input_hash,
                    output_hash=span_input.output_hash,
                    model=span_input.model,
                    tokens_in=span_input.tokens_in,
                    tokens_out=span_input.tokens_out,
                    tool_name=span_input.tool_name,
                    tool_args=span_input.tool_args,
                    tool_result_summary=span_input.tool_result_summary,
                    latency_ms=span_input.latency_ms,
                    start_time=span_input.start_time.replace(tzinfo=None) if span_input.start_time else datetime.now(timezone.utc).replace(tzinfo=None),
                    end_time=span_input.end_time.replace(tzinfo=None) if span_input.end_time else None,
                    status=span_input.status,
                    error_message=span_input.error_message,
                    # Extra data is saved as JSON text; an empty dict is saved as None.
                    metadata_json=json.dumps(span_input.metadata) if span_input.metadata else None,
                )
                # add() only stages the row in the session; it becomes permanent at commit.
                session.add(span)

                # Update agent registry
                await _update_agent_record(session, span_input)

                accepted += 1
                enqueue_targets.append(span_input)

            # Any error on one span is counted. Only the first 100 characters of the message go
            # back to the caller, and the loop moves on to the next span.
            except Exception as exc:
                failed += 1
                errors.append(f"Span {span_input.span_id}: {str(exc)[:100]}")
                logger.warning("Failed to ingest span %s: %s", span_input.span_id, exc)

        # commit = save all the new rows of this batch to the database in one go.
        await session.commit()

    # Step 3: queue one evaluation job per span.
    # In short: this is a second, separate save. If it fails we only log it and still reply 202.
    # Enqueue durable evaluation jobs. This is a SEPARATE transaction from the
    # span writes above, and deliberately so: spans are the record of what
    # happened and must persist even if enqueueing fails. The reverse ordering
    # would risk a job referencing a span that was never committed.
    #
    # A failure here is logged but does not fail the request -- the spans are
    # safely stored, and the job can be re-created by re-submitting. Losing the
    # 202 would make an SDK retry the whole batch, which is worse.
    queued = 0
    if enqueue_targets:
        try:
            async with get_session() as session:
                for span_input in enqueue_targets:
                    # payload = the whole span as plain JSON data; the worker reads it later.
                    # enqueue_job returns False when a job for this span already exists.
                    created = await enqueue_job(
                        session,
                        trace_id=span_input.trace_id,
                        span_id=span_input.span_id,
                        agent_id=span_input.agent_id,
                        payload=span_input.model_dump(mode="json"),
                    )
                    if created:
                        queued += 1
                await session.commit()
        # Caught on purpose: the spans are already saved, so a queue failure must not turn
        # the reply into an error. exc_info=True puts the full traceback in the log.
        except Exception as exc:
            logger.error("Failed to enqueue evaluation jobs: %s", exc, exc_info=True)

    # Step 4: update the in-memory counters. enqueue_failed is True when there were spans to
    # queue, at least one span was accepted, but no new job was created (queued == 0). That is
    # also the case when every span was a duplicate whose job already existed.
    # Recorded in process memory rather than written to a table: this runs on
    # every ingest, and a row per request would make monitoring the most
    # expensive thing in the request path.
    COUNTERS.record_ingest(
        accepted=accepted, failed=failed, duplicates=duplicates,
        queued=queued, enqueue_failed=bool(enqueue_targets) and queued == 0 and accepted > 0,
    )

    if duplicates:
        logger.info(
            "Ingest saw %d already-known span(s); re-insertion skipped and "
            "evaluation jobs deduplicated by job_key", duplicates,
        )

    # Notify WebSocket clients
    # Step 5: if at least one span was accepted, push one small "new_span" message per span to
    # every connected dashboard. main.py puts the manager on app.state at startup; hasattr
    # keeps this safe if it is not there. The loop uses every span in the request, including
    # any that failed to save.
    if accepted > 0 and hasattr(request.app.state, "ws_manager"):
        for span_input in payload.spans:
            await request.app.state.ws_manager.broadcast({
                "type": "new_span",
                "trace_id": span_input.trace_id,
                "span_id": span_input.span_id,
                "agent_id": span_input.agent_id,
                "status": span_input.status,
                "latency_ms": span_input.latency_ms,
            })

    # Step 6: reply with the counts. The message only says whether at least one span was accepted.
    return IngestResponse(
        accepted=accepted,
        failed=failed,
        message="Spans accepted for evaluation" if accepted > 0 else "No spans accepted",
        errors=errors,
    )


# The request body of POST /v1/simulate. scenario picks which fake run to build; query is the
# topic text that is put into the first span.
class SimulateRequest(BaseModel):
    scenario: str = "clean"  # "clean", "hallucination", "tool_mismatch", "drift"
    query: str = "Advances in multimodal foundation models"


# POST /v1/simulate -> build five made-up spans and ingest them like a real SDK batch.
# Used for demos. The route calls ingest_spans() directly, so the spans are saved, queued
# and pushed to WebSocket clients exactly like real ones. The worker must still score them.
@router.post("/simulate")
async def simulate_pipeline(
    req: SimulateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Simulate a 5-agent LangGraph workflow with configurable failure scenarios."""
    # Note: the docstring says "LangGraph", but no LangGraph code runs here. The five spans are
    # written out by hand below.
    import uuid
    # Step 1: make new random ids. trace_id is 32 hex characters. span_base is the first 8
    # characters of a second random id; the five span ids are span_base plus "01" ... "05".
    trace_id = uuid.uuid4().hex
    span_base = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Step 2: choose the failure to fake. "hallucination" and "drift" give the same spans here
    # (the code treats them alike). "tool_mismatch" changes only the retriever span. Any other
    # scenario text gives the clean run.
    is_hallucination = req.scenario in ("hallucination", "drift")
    is_mismatch = req.scenario == "tool_mismatch"

    # Step 3: five spans, one per agent. Each span after the first has the span before it as
    # its parent, so they form a chain: researcher -> retriever -> verifier -> analyst -> writer.
    spans = [
        # Span 1: the planner turns the user's request into sub-queries.
        SpanInput(
            trace_id=trace_id,
            span_id=f"{span_base}01",
            agent_id="researcher",
            agent_role="Query Planner",
            pipeline_id="research_pipeline_v1",
            latency_ms=18.4,
            input_summary=f"User request: {req.query}",
            output_summary=f"Generated 3 sub-queries for literature review on {req.query}",
            status="success",
        ),
        # Span 2: the retriever. The tool really "found 3 papers" (tool_result_summary). In the
        # tool_mismatch scenario the agent claims 10, which the tool-claim check should catch.
        SpanInput(
            trace_id=trace_id,
            span_id=f"{span_base}02",
            parent_span_id=f"{span_base}01",
            agent_id="retriever",
            agent_role="Paper Indexer",
            pipeline_id="research_pipeline_v1",
            latency_ms=45.2,
            tool_name="academic_search_api",
            tool_result_summary="Found 3 papers: Vaswani (2017), Devlin (2019), Brown (2020)",
            input_summary="Query: transformer architectures",
            # COUNT_PATTERNS needs the noun adjacent to the number, so the
            # count claim is phrased "retrieved N papers" with no adjective
            # between them. Clean matches the tool's 3; tool_mismatch claims 10.
            output_summary=(
                "Retrieved 3 papers from the academic database"
                if not is_mismatch
                else "Retrieved 10 papers from the academic database"
            ),
            status="success",
        ),
        # Span 3: the verifier. With the hallucination scenario its output says verification
        # failed instead of "all 3 papers support...".
        SpanInput(
            trace_id=trace_id,
            span_id=f"{span_base}03",
            parent_span_id=f"{span_base}02",
            agent_id="verifier",
            agent_role="Claim Verifier",
            pipeline_id="research_pipeline_v1",
            latency_ms=92.1,
            tool_name="verify_claim",
            tool_result_summary="Verified 3 of 3 claims against retrieved abstracts",
            input_summary="Papers: Vaswani (2017), Devlin (2019), Brown (2020)",
            output_summary=(
                "Claims verified: All 3 retrieved papers support foundational transformer mechanisms."
                if not is_hallucination
                else "Claims failed: Injected discrepancy against retrieved corpus."
            ),
            status="success",
        ),
        # Span 4: the analyst. With the hallucination scenario its output is an unrelated claim
        # that its input (the verified claims) does not support.
        SpanInput(
            trace_id=trace_id,
            span_id=f"{span_base}04",
            parent_span_id=f"{span_base}03",
            agent_id="analyst",
            agent_role="Synthesis Engine",
            pipeline_id="research_pipeline_v1",
            latency_ms=84.5,
            input_summary="Verified claims from literature search",
            output_summary=(
                "Evidence synthesis: The papers consistently demonstrate scaling benefits in deep language models."
                if not is_hallucination
                else "Unrelated claim: Zhang et al. (2024) proven that quantum consciousness arises in sub-atomic LLM parameters."
            ),
            status="success",
        ),
        # Span 5: the writer. With the hallucination scenario the report says "14 studies"
        # although only 3 papers were retrieved.
        SpanInput(
            trace_id=trace_id,
            span_id=f"{span_base}05",
            parent_span_id=f"{span_base}04",
            agent_id="writer",
            agent_role="Report Author",
            pipeline_id="research_pipeline_v1",
            latency_ms=28.0,
            input_summary="Synthesized analysis and literature evidence",
            output_summary=(
                "# Research Report\n\nBased on 3 retrieved papers, transformer architectures exhibit strong scaling laws."
                if not is_hallucination
                else "# Research Report\n\nBased on 14 studies (Zhang 2024, Smith 2025), quantum consciousness is fully verified."
            ),
            status="success",
        ),
    ]

    # Step 4: wrap the spans like an SDK request would and run the normal ingest code. The
    # reply is ingest_spans' own IngestResponse (accepted / failed counts). `now` above is not
    # used again.
    payload = IngestPayload(spans=spans, service_name="simulation_studio")
    return await ingest_spans(payload, background_tasks, request)


# Called once per incoming span (before the duplicate check). Makes sure a Trace row exists
# for the span's trace_id and keeps its span count and end time up to date. Nothing is
# returned; the row is changed inside the caller's session.
async def _ensure_trace(
    session: AsyncSession,
    span: SpanInput,
    service_name: str,
) -> None:
    """Create or update the trace record."""
    # Step 1: look for an existing Trace row with this trace_id (None if there is none).
    result = await session.execute(
        select(Trace).where(Trace.trace_id == span.trace_id)
    )
    trace = result.scalar_one_or_none()

    # Step 2: times without a timezone label (see the note in ingest_spans). A missing
    # start_time becomes "now"; a missing end_time stays None.
    span_start = span.start_time.replace(tzinfo=None) if span.start_time else datetime.now(timezone.utc).replace(tzinfo=None)
    span_end = span.end_time.replace(tzinfo=None) if span.end_time else None

    # Step 3a: the first span of this run -> create the Trace row. Its status starts as
    # "running" and total_spans as 1.
    if trace is None:
        trace = Trace(
            trace_id=span.trace_id,
            pipeline_id=span.pipeline_id,
            start_time=span_start,
            end_time=span_end,
            status="running",
            total_spans=1,
            service_name=service_name,
        )
        session.add(trace)
    # Step 3b: a known trace -> add 1 to its span count, and move end_time forward if this
    # span has an end time that is later than the stored one (or none is stored yet).
    else:
        trace.total_spans += 1
        if span_end and (trace.end_time is None or span_end > trace.end_time.replace(tzinfo=None)):
            trace.end_time = span_end


# Called once per NEW span (not for a re-sent span). Keeps one AgentRecord row per agent_id:
# creates it the first time the agent is seen, and later updates its counts and average
# latency. Nothing is returned; the row is changed inside the caller's session.
async def _update_agent_record(
    session: AsyncSession,
    span: SpanInput,
) -> None:
    """Update agent registry with latest span info."""
    # Step 1: look for this agent's row (None if the agent is new).
    result = await session.execute(
        select(AgentRecord).where(AgentRecord.agent_id == span.agent_id)
    )
    agent = result.scalar_one_or_none()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Step 2a: a new agent -> create its row. total_errors starts at 1 if this first span's
    # status is anything other than "success", otherwise 0.
    if agent is None:
        agent = AgentRecord(
            agent_id=span.agent_id,
            agent_role=span.agent_role,
            pipeline_id=span.pipeline_id,
            first_seen=now,
            last_seen=now,
            total_spans=1,
            total_errors=1 if span.status != "success" else 0,
            avg_latency_ms=span.latency_ms,
        )
        session.add(agent)
    # Step 2b: a known agent -> bump last_seen, the span count and (for a non-success status)
    # the error count.
    else:
        agent.last_seen = now
        agent.total_spans += 1
        if span.status != "success":
            agent.total_errors += 1
        if span.latency_ms is not None:
            if agent.avg_latency_ms is not None:
                # Running average
                # New average = 95% of the old average + 5% of this span's latency, so recent
                # spans count a little and old ones fade out slowly. (An "exponential moving
                # average".) The first latency seen is stored as it is (the else below).
                agent.avg_latency_ms = (
                    agent.avg_latency_ms * 0.95 + span.latency_ms * 0.05
                )
            else:
                agent.avg_latency_ms = span.latency_ms


# In short: the scoring code is not in this file any more. It lives in
# app/services/evaluation_runner.py, which the worker calls.
# _fetch_prior_agent_outputs, _evaluate_spans_background and
# _persist_drift_baselines moved to app/services/evaluation_runner.py so the
# worker process can run them without importing this router. Their logic is
# unchanged; only their home moved.
