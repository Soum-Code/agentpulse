"""Ingest router — receives spans from the SDK and triggers evaluation."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import (
    AgentRecord,
    Span,
    Trace,
)
from app.services.job_queue import enqueue_job
from app.services.runtime_metrics import COUNTERS

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
router = APIRouter(prefix="/v1", tags=["ingest"])


# Pydantic models for request/response (imported from SDK schemas)
from pydantic import BaseModel, Field
from typing import Any, Optional


class SpanInput(BaseModel):
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    agent_id: str
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None
    event_type: str = "agent_execution"
    span_kind: str = "AGENT"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    latency_ms: Optional[float] = None
    status: str = "success"
    error_message: Optional[str] = None
    input_summary: Optional[str] = None
    output_summary: Optional[str] = None
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result_summary: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestPayload(BaseModel):
    spans: list[SpanInput]
    sdk_version: str = "0.1.0"
    service_name: str = "default"


class IngestResponse(BaseModel):
    accepted: int
    failed: int
    message: str = "OK"
    errors: list[str] = Field(default_factory=list)


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
    accepted = 0
    failed = 0
    duplicates = 0
    errors = []
    enqueue_targets: list[SpanInput] = []

    async with get_session() as session:
        for span_input in payload.spans:
            try:
                # Ensure trace exists
                await _ensure_trace(session, span_input, payload.service_name)

                # Idempotent re-submission. Previously a repeat POST of the same
                # span_id violated the primary key, and because the flush happens
                # at commit the WHOLE batch failed with HTTP 500 -- measured as
                # [202, 500, 500] across three identical submissions. A retrying
                # SDK could therefore destroy an entire batch of unrelated spans.
                # An already-known span is now simply not re-inserted; it still
                # gets an evaluation job, which the job_key UNIQUE constraint
                # deduplicates.
                existing = await session.execute(
                    select(Span.span_id).where(Span.span_id == span_input.span_id)
                )
                if existing.first() is not None:
                    duplicates += 1
                    accepted += 1
                    enqueue_targets.append(span_input)
                    continue

                # Create span record
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
                    metadata_json=json.dumps(span_input.metadata) if span_input.metadata else None,
                )
                session.add(span)

                # Update agent registry
                await _update_agent_record(session, span_input)

                accepted += 1
                enqueue_targets.append(span_input)

            except Exception as exc:
                failed += 1
                errors.append(f"Span {span_input.span_id}: {str(exc)[:100]}")
                logger.warning("Failed to ingest span %s: %s", span_input.span_id, exc)

        await session.commit()

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
        except Exception as exc:
            logger.error("Failed to enqueue evaluation jobs: %s", exc, exc_info=True)

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

    return IngestResponse(
        accepted=accepted,
        failed=failed,
        message="Spans accepted for evaluation" if accepted > 0 else "No spans accepted",
        errors=errors,
    )


class SimulateRequest(BaseModel):
    scenario: str = "clean"  # "clean", "hallucination", "tool_mismatch", "drift"
    query: str = "Advances in multimodal foundation models"


@router.post("/simulate")
async def simulate_pipeline(
    req: SimulateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Simulate a 5-agent LangGraph workflow with configurable failure scenarios."""
    import uuid
    trace_id = uuid.uuid4().hex
    span_base = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    is_hallucination = req.scenario in ("hallucination", "drift")
    is_mismatch = req.scenario == "tool_mismatch"

    spans = [
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
            output_summary="Retrieved 3 foundational papers from academic database",
            status="success",
        ),
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

    payload = IngestPayload(spans=spans, service_name="simulation_studio")
    return await ingest_spans(payload, background_tasks, request)


async def _ensure_trace(
    session: AsyncSession,
    span: SpanInput,
    service_name: str,
) -> None:
    """Create or update the trace record."""
    result = await session.execute(
        select(Trace).where(Trace.trace_id == span.trace_id)
    )
    trace = result.scalar_one_or_none()

    span_start = span.start_time.replace(tzinfo=None) if span.start_time else datetime.now(timezone.utc).replace(tzinfo=None)
    span_end = span.end_time.replace(tzinfo=None) if span.end_time else None

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
    else:
        trace.total_spans += 1
        if span_end and (trace.end_time is None or span_end > trace.end_time.replace(tzinfo=None)):
            trace.end_time = span_end


async def _update_agent_record(
    session: AsyncSession,
    span: SpanInput,
) -> None:
    """Update agent registry with latest span info."""
    result = await session.execute(
        select(AgentRecord).where(AgentRecord.agent_id == span.agent_id)
    )
    agent = result.scalar_one_or_none()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
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
    else:
        agent.last_seen = now
        agent.total_spans += 1
        if span.status != "success":
            agent.total_errors += 1
        if span.latency_ms is not None:
            if agent.avg_latency_ms is not None:
                # Running average
                agent.avg_latency_ms = (
                    agent.avg_latency_ms * 0.95 + span.latency_ms * 0.05
                )
            else:
                agent.avg_latency_ms = span.latency_ms


# _fetch_prior_agent_outputs, _evaluate_spans_background and
# _persist_drift_baselines moved to app/services/evaluation_runner.py so the
# worker process can run them without importing this router. Their logic is
# unchanged; only their home moved.
