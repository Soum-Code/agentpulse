"""Query routers for traces, agents, drift, alerts, and metrics."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func, col

from app.database import get_session
from app.models import (
    AgentRecord,
    Alert,
    DriftRecord,
    Evaluation,
    Span,
    Trace,
)


# ─── Traces Router ────────────────────────────────────────────────────

traces_router = APIRouter(prefix="/v1/traces", tags=["traces"])


@traces_router.get("")
async def list_traces(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    pipeline_id: Optional[str] = None,
):
    """List traces with optional filtering."""
    async with get_session() as session:
        query = select(Trace).order_by(col(Trace.start_time).desc())
        if status:
            query = query.where(Trace.status == status)
        if pipeline_id:
            query = query.where(Trace.pipeline_id == pipeline_id)
        query = query.offset(offset).limit(limit)

        result = await session.execute(query)
        traces = result.scalars().all()

        # Get total count
        count_query = select(func.count(Trace.trace_id))
        total = (await session.execute(count_query)).scalar() or 0

        return {
            "traces": [
                {
                    "trace_id": t.trace_id,
                    "pipeline_id": t.pipeline_id,
                    "start_time": t.start_time.isoformat() if t.start_time else None,
                    "end_time": t.end_time.isoformat() if t.end_time else None,
                    "status": t.status,
                    "total_spans": t.total_spans,
                    "overall_risk_score": t.overall_risk_score,
                    "service_name": t.service_name,
                }
                for t in traces
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


@traces_router.get("/{trace_id}")
async def get_trace(trace_id: str):
    """Get a complete trace with all spans and evaluations."""
    async with get_session() as session:
        # Get trace
        result = await session.execute(
            select(Trace).where(Trace.trace_id == trace_id)
        )
        trace = result.scalar_one_or_none()
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Get spans
        spans_result = await session.execute(
            select(Span)
            .where(Span.trace_id == trace_id)
            .order_by(col(Span.start_time))
        )
        spans = spans_result.scalars().all()

        # Get evaluations for these spans
        span_ids = [s.span_id for s in spans]
        evals_result = await session.execute(
            select(Evaluation).where(col(Evaluation.span_id).in_(span_ids))
        )
        evaluations = {e.span_id: e for e in evals_result.scalars().all()}

        # Get alerts for this trace
        alerts_result = await session.execute(
            select(Alert).where(Alert.trace_id == trace_id)
        )
        alerts = alerts_result.scalars().all()

        return {
            "trace": {
                "trace_id": trace.trace_id,
                "pipeline_id": trace.pipeline_id,
                "start_time": trace.start_time.isoformat() if trace.start_time else None,
                "end_time": trace.end_time.isoformat() if trace.end_time else None,
                "status": trace.status,
                "total_spans": trace.total_spans,
                "overall_risk_score": trace.overall_risk_score,
            },
            "spans": [
                {
                    "span_id": s.span_id,
                    "parent_span_id": s.parent_span_id,
                    "agent_id": s.agent_id,
                    "agent_role": s.agent_role,
                    "event_type": s.event_type,
                    "span_kind": s.span_kind,
                    "latency_ms": s.latency_ms,
                    "status": s.status,
                    "error_message": s.error_message,
                    "model": s.model,
                    "tokens_in": s.tokens_in,
                    "tokens_out": s.tokens_out,
                    "tool_name": s.tool_name,
                    "start_time": s.start_time.isoformat() if s.start_time else None,
                    "evaluation": (
                        {
                            "grounding_score": evaluations[s.span_id].grounding_score,
                            "tool_claim_score": evaluations[s.span_id].tool_claim_score,
                            "overall_risk_score": evaluations[s.span_id].overall_risk_score,
                            "label": evaluations[s.span_id].label,
                            "evaluation_stage": evaluations[s.span_id].evaluation_stage,
                        }
                        if s.span_id in evaluations
                        else None
                    ),
                }
                for s in spans
            ],
            "alerts": [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "message": a.message,
                    "agent_id": a.agent_id,
                    "created_at": a.created_at.isoformat(),
                    "acknowledged": a.acknowledged,
                }
                for a in alerts
            ],
        }


# ─── Agents Router ────────────────────────────────────────────────────

agents_router = APIRouter(prefix="/v1/agents", tags=["agents"])


@agents_router.get("")
async def list_agents():
    """List all known agents."""
    async with get_session() as session:
        result = await session.execute(
            select(AgentRecord).order_by(col(AgentRecord.last_seen).desc())
        )
        agents = result.scalars().all()
        return {
            "agents": [
                {
                    "agent_id": a.agent_id,
                    "agent_role": a.agent_role,
                    "pipeline_id": a.pipeline_id,
                    "first_seen": a.first_seen.isoformat() if a.first_seen else None,
                    "last_seen": a.last_seen.isoformat() if a.last_seen else None,
                    "total_spans": a.total_spans,
                    "total_errors": a.total_errors,
                    "error_rate": (
                        round(a.total_errors / max(a.total_spans, 1), 4)
                    ),
                    "avg_latency_ms": round(a.avg_latency_ms, 1) if a.avg_latency_ms else None,
                    "avg_risk_score": round(a.avg_risk_score, 4) if a.avg_risk_score else None,
                    "current_asi": round(a.current_asi, 1) if a.current_asi else None,
                }
                for a in agents
            ]
        }


@agents_router.get("/{agent_id}/health")
async def get_agent_health(agent_id: str):
    """Get detailed health metrics for an agent."""
    async with get_session() as session:
        # Agent record
        result = await session.execute(
            select(AgentRecord).where(AgentRecord.agent_id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Recent evaluations
        evals = await session.execute(
            select(Evaluation)
            .join(Span, Span.span_id == Evaluation.span_id)
            .where(Span.agent_id == agent_id)
            .order_by(col(Evaluation.evaluated_at).desc())
            .limit(50)
        )
        recent_evals = evals.scalars().all()

        # Recent drift
        drift = await session.execute(
            select(DriftRecord)
            .where(DriftRecord.agent_id == agent_id)
            .order_by(col(DriftRecord.recorded_at).desc())
            .limit(50)
        )
        recent_drift = drift.scalars().all()

        return {
            "agent": {
                "agent_id": agent.agent_id,
                "agent_role": agent.agent_role,
                "total_spans": agent.total_spans,
                "error_rate": round(agent.total_errors / max(agent.total_spans, 1), 4),
                "avg_latency_ms": round(agent.avg_latency_ms, 1) if agent.avg_latency_ms else None,
                "avg_risk_score": round(agent.avg_risk_score, 4) if agent.avg_risk_score else None,
                "current_asi": round(agent.current_asi, 1) if agent.current_asi else None,
            },
            "risk_trend": [
                {
                    "timestamp": e.evaluated_at.isoformat(),
                    "risk_score": e.overall_risk_score,
                    "grounding_score": e.grounding_score,
                }
                for e in recent_evals if e.overall_risk_score is not None
            ],
            "drift_trend": [
                {
                    "timestamp": d.recorded_at.isoformat(),
                    "centroid_distance": d.centroid_distance,
                    "stability_index": d.stability_index,
                }
                for d in recent_drift
            ],
        }


# ─── Drift Router ─────────────────────────────────────────────────────

drift_router = APIRouter(prefix="/v1/drift", tags=["drift"])


@drift_router.get("")
async def get_drift_overview():
    """Get drift overview for all agents."""
    async with get_session() as session:
        # Latest drift per agent
        agents_result = await session.execute(select(AgentRecord))
        agents = agents_result.scalars().all()

        overview = []
        for agent in agents:
            latest_drift = await session.execute(
                select(DriftRecord)
                .where(DriftRecord.agent_id == agent.agent_id)
                .order_by(col(DriftRecord.recorded_at).desc())
                .limit(1)
            )
            drift = latest_drift.scalar_one_or_none()

            overview.append({
                "agent_id": agent.agent_id,
                "current_asi": agent.current_asi,
                "latest_centroid_distance": drift.centroid_distance if drift else None,
                "latest_tool_drift": drift.tool_drift if drift else None,
                "baseline_size": drift.baseline_size if drift else 0,
            })

        return {"agents": overview}


# ─── Alerts Router ────────────────────────────────────────────────────

alerts_router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


@alerts_router.get("")
async def list_alerts(
    limit: int = Query(50, le=200),
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    acknowledged: Optional[bool] = None,
):
    """List alerts with optional filtering."""
    async with get_session() as session:
        query = select(Alert).order_by(col(Alert.created_at).desc())
        if severity:
            query = query.where(Alert.severity == severity)
        if alert_type:
            query = query.where(Alert.alert_type == alert_type)
        if acknowledged is not None:
            query = query.where(Alert.acknowledged == acknowledged)
        query = query.limit(limit)

        result = await session.execute(query)
        alerts = result.scalars().all()

        return {
            "alerts": [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "message": a.message,
                    "agent_id": a.agent_id,
                    "trace_id": a.trace_id,
                    "span_id": a.span_id,
                    "acknowledged": a.acknowledged,
                    "resolved": a.resolved,
                    "created_at": a.created_at.isoformat(),
                    "details": json.loads(a.details_json) if a.details_json else None,
                }
                for a in alerts
            ]
        }


class AlertUpdate(BaseModel):
    acknowledged: Optional[bool] = None
    resolved: Optional[bool] = None


@alerts_router.patch("/{alert_id}")
async def update_alert(alert_id: int, update: AlertUpdate):
    """Acknowledge or resolve an alert."""
    async with get_session() as session:
        result = await session.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        now = datetime.now(timezone.utc)
        if update.acknowledged is not None:
            alert.acknowledged = update.acknowledged
            if update.acknowledged:
                alert.acknowledged_at = now
        if update.resolved is not None:
            alert.resolved = update.resolved
            if update.resolved:
                alert.resolved_at = now

        await session.commit()
        return {"status": "updated", "alert_id": alert_id}


# ─── Metrics Router ───────────────────────────────────────────────────

metrics_router = APIRouter(prefix="/v1", tags=["metrics"])


@metrics_router.get("/metrics")
async def get_metrics():
    """System-wide metrics overview."""
    async with get_session() as session:
        total_traces = (await session.execute(
            select(func.count(Trace.trace_id))
        )).scalar() or 0

        total_spans = (await session.execute(
            select(func.count(Span.span_id))
        )).scalar() or 0

        total_agents = (await session.execute(
            select(func.count(AgentRecord.agent_id))
        )).scalar() or 0

        total_alerts = (await session.execute(
            select(func.count(Alert.id)).where(Alert.acknowledged == False)
        )).scalar() or 0

        avg_risk = (await session.execute(
            select(func.avg(Evaluation.overall_risk_score))
            .where(Evaluation.overall_risk_score.isnot(None))
        )).scalar()

        avg_latency = (await session.execute(
            select(func.avg(Span.latency_ms))
            .where(Span.latency_ms.isnot(None))
        )).scalar()

        error_count = (await session.execute(
            select(func.count(Span.span_id)).where(Span.status != "success")
        )).scalar() or 0

        return {
            "total_traces": total_traces,
            "total_spans": total_spans,
            "total_agents": total_agents,
            "unacknowledged_alerts": total_alerts,
            "avg_risk_score": round(avg_risk, 4) if avg_risk else None,
            "avg_latency_ms": round(avg_latency, 1) if avg_latency else None,
            "error_rate": round(error_count / max(total_spans, 1), 4),
            "total_errors": error_count,
        }


@metrics_router.get("/health")
async def health_check():
    """Backend health check."""
    from app.services.grounding import models_loaded
    return {
        "status": "healthy",
        "models": models_loaded(),
        "version": "0.1.0",
    }
