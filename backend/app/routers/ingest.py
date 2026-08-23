"""Ingest router — receives spans from the SDK and triggers evaluation."""

from __future__ import annotations

import asyncio
import functools
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import (
    Alert,
    AgentRecord,
    Baseline,
    DriftRecord,
    Evaluation,
    Span,
    Trace,
)

# Dedicated thread pool for the synchronous, CPU-bound evaluation pipeline
# (DeBERTa NLI + MiniLM embedding forward passes, ~90-190ms/span). Moving it
# off the event loop is what stops evaluation from blocking REST/WebSocket
# traffic — but empirically, MORE worker threads made throughput *worse*, not
# better: this workload's small-model inference spends much of its time in
# Python-level tokenization/tensor-prep, not GIL-released C compute, so extra
# threads just add GIL-contention overhead. Measured on a 16-core machine:
# 1 worker ~95 req/s, 4 workers ~63 req/s, 8 workers ~39 req/s. A single
# worker serializes evaluation (a backlog queues rather than executing
# concurrently) but keeps ingest itself fast and non-blocking either way.
_eval_executor = ThreadPoolExecutor(
    max_workers=1,
    thread_name_prefix="agentpulse-eval",
)

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
    
    Persists spans immediately, then queues evaluation as a background task.
    Returns 202 Accepted so the SDK doesn't wait for evaluation.
    """
    accepted = 0
    failed = 0
    errors = []

    async with get_session() as session:
        for span_input in payload.spans:
            try:
                # Ensure trace exists
                await _ensure_trace(session, span_input, payload.service_name)

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

            except Exception as exc:
                failed += 1
                errors.append(f"Span {span_input.span_id}: {str(exc)[:100]}")
                logger.warning("Failed to ingest span %s: %s", span_input.span_id, exc)

        await session.commit()

    # Queue background evaluation for all accepted spans
    if accepted > 0 and hasattr(request.app.state, "evaluator"):
        background_tasks.add_task(
            _evaluate_spans_background,
            [s for s in payload.spans],
            request.app.state.evaluator,
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


async def _evaluate_spans_background(
    spans: list[SpanInput],
    evaluator,
) -> None:
    """Background task: evaluate spans and persist results.

    `evaluator.evaluate_span` is synchronous and CPU-bound (NLI + embedding
    inference), so it's dispatched to `_eval_executor` instead of being
    called directly on the event loop — otherwise a single evaluation would
    stall every other request this worker is serving for its full duration.
    """
    prev_span: SpanInput | None = None
    loop = asyncio.get_running_loop()
    touched_agent_ids: set[str] = set()

    for span in spans:
        try:
            result = await loop.run_in_executor(
                _eval_executor,
                functools.partial(
                    evaluator.evaluate_span,
                    span_id=span.span_id,
                    trace_id=span.trace_id,
                    agent_id=span.agent_id,
                    input_text=span.input_summary,
                    output_text=span.output_summary,
                    upstream_agent_id=prev_span.agent_id if prev_span else None,
                    upstream_output=prev_span.output_summary if prev_span else None,
                    tool_calls=(
                        [{"tool_name": span.tool_name, "result_summary": span.tool_result_summary}]
                        if span.tool_name
                        else None
                    ),
                    status=span.status,
                ),
            )
            prev_span = span
            touched_agent_ids.add(span.agent_id)

            # Persist evaluation
            async with get_session() as session:
                evaluation = Evaluation(
                    span_id=span.span_id,
                    trace_id=span.trace_id,
                    grounding_score=(
                        result.grounding.grounding_score if result.grounding else None
                    ),
                    entailment_prob=(
                        result.grounding.entailment_prob if result.grounding else None
                    ),
                    contradiction_prob=(
                        result.grounding.contradiction_prob if result.grounding else None
                    ),
                    neutral_prob=(
                        result.grounding.neutral_prob if result.grounding else None
                    ),
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

                # Persist drift record
                if result.drift:
                    drift_record = DriftRecord(
                        agent_id=span.agent_id,
                        node_name=span.agent_id,
                        span_id=span.span_id,
                        centroid_distance=result.drift.centroid_distance,
                        tool_drift=result.drift.tool_drift,
                        quality_drift=result.drift.quality_drift,
                        error_rate_delta=result.drift.error_rate_delta,
                        stability_index=result.drift.stability_index,
                        baseline_size=result.drift.baseline_size,
                    )
                    session.add(drift_record)

                # Persist alerts
                for alert in result.alerts:
                    alert_record = Alert(
                        trace_id=alert.trace_id,
                        span_id=alert.span_id,
                        agent_id=alert.agent_id,
                        alert_type=alert.alert_type,
                        severity=alert.severity,
                        message=alert.message,
                        details_json=json.dumps(alert.details),
                    )
                    session.add(alert_record)

                # Update agent risk score
                if result.overall_risk_score is not None:
                    agent_result = await session.execute(
                        select(AgentRecord).where(AgentRecord.agent_id == span.agent_id)
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

        except Exception as exc:
            logger.error(
                "Background evaluation failed for span %s: %s",
                span.span_id, exc, exc_info=True,
            )

    if touched_agent_ids:
        await _persist_drift_baselines(evaluator.drift_detector, touched_agent_ids)


async def _persist_drift_baselines(drift_detector, agent_ids: set[str]) -> None:
    """Upsert embedding-centroid baselines for agents evaluated in this batch.

    Runs once per ingest batch (not per span) so write volume scales with
    distinct agents, not request volume. Serialization/dict access is cheap
    (numpy .tobytes()), so no thread offload needed here.
    """
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
                baseline = Baseline(
                    agent_id=agent_id,
                    baseline_type="embedding_centroid",
                    data=data,
                    sample_count=info["sample_count"],
                )
                session.add(baseline)
            else:
                baseline.data = data
                baseline.sample_count = info["sample_count"]
                baseline.updated_at = datetime.now(timezone.utc)

        await session.commit()
