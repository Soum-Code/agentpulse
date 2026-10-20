"""Query routers for traces, agents, drift, alerts, and metrics."""

# WHAT THIS FILE IS FOR
# The "read side" of the API. It builds six FastAPI routers (a router is a bundle of URLs
# that share one prefix): traces (/v1/traces), agents (/v1/agents), drift (/v1/drift),
# alerts (/v1/alerts), keys (/v1/keys) and metrics (/v1/metrics, /v1/platform, /v1/health*).
# Almost every route only reads the database and returns JSON. The ones that write are the
# alert update (acknowledge / resolve) and API-key create / revoke.
#
# HOW IT FITS IN
# main.py adds each router with app.include_router(...). Spans arrive through
# routers/ingest.py and are scored by the worker; the routes here show the stored results.

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Optional

# FastAPI: APIRouter groups URLs, Query reads ?options from the URL, HTTPException sends errors.
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
# sqlmodel: select() builds a SQL query, func gives SQL functions (count, avg), and col()
# wraps a model field so methods like .desc() and .in_() can be used on it.
from sqlmodel import select, func, col

from app.config import settings
# get_session() opens a database session; use it as `async with get_session() as session:`.
from app.database import get_session

# The table classes (see models.py). One class = one database table.
from app.models import (
    AgentRecord,
    Alert,
    DriftRecord,
    Evaluation,
    Span,
    Trace,
)


# Traces Router

# Every URL in this router starts with /v1/traces. `tags` only groups them in the /docs page.
traces_router = APIRouter(prefix="/v1/traces", tags=["traces"])


# GET /v1/traces -> one page of traces, newest first.
# Options in the URL: limit (page size, at most 200), offset (how many rows to skip, for
# paging), and the optional filters status and pipeline_id.
@traces_router.get("")
async def list_traces(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    pipeline_id: Optional[str] = None,
):
    """List traces with optional filtering."""
    async with get_session() as session:
        # Step 1: start from all traces, newest first (largest start_time first). A filter is
        # added below only when the caller sent that option.
        query = select(Trace).order_by(col(Trace.start_time).desc())
        if status:
            query = query.where(Trace.status == status)
        if pipeline_id:
            query = query.where(Trace.pipeline_id == pipeline_id)
        # Step 2: paging. Skip `offset` rows, then take at most `limit` rows.
        query = query.offset(offset).limit(limit)

        # Step 3: run the query. scalars().all() gives the Trace rows as a list.
        result = await session.execute(query)
        traces = result.scalars().all()

        # Get total count
        # Step 4: count the traces for the "total" field. This query has no filters, so it
        # counts ALL traces, not only the ones that match status / pipeline_id above.
        count_query = select(func.count(Trace.trace_id))
        total = (await session.execute(count_query)).scalar() or 0

        # Step 5: build the JSON reply. Dates become ISO text (like 2026-01-31T12:00:00)
        # because JSON has no date type; a missing date stays None.
        # status starts as "running" (set in ingest.py). The worker sets "completed" as soon
        # as one span has a risk score, so it does not mean every span is done.
        # overall_risk_score is the highest span risk so far.
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


# GET /v1/traces/{trace_id} -> one trace with all its spans, the scores of each span, and the
# alerts raised for it. Answers 404 if the trace id is unknown.
@traces_router.get("/{trace_id}")
async def get_trace(trace_id: str):
    """Get a complete trace with all spans and evaluations."""
    async with get_session() as session:
        # Get trace
        # Step 1: load the trace row. scalar_one_or_none() gives the row, or None if the id
        # does not exist (then we answer 404).
        result = await session.execute(
            select(Trace).where(Trace.trace_id == trace_id)
        )
        trace = result.scalar_one_or_none()
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Get spans
        # Step 2: every span of this trace, oldest first (ordered by start_time).
        spans_result = await session.execute(
            select(Span)
            .where(Span.trace_id == trace_id)
            .order_by(col(Span.start_time))
        )
        spans = spans_result.scalars().all()

        # Get evaluations for these spans
        # Step 3: the scores for those spans, fetched in one query (span_id IN the list).
        # The dict maps span_id -> its Evaluation so each span can find its scores quickly.
        # The worker saves at most one evaluation per span.
        span_ids = [s.span_id for s in spans]
        evals_result = await session.execute(
            select(Evaluation).where(col(Evaluation.span_id).in_(span_ids))
        )
        evaluations = {e.span_id: e for e in evals_result.scalars().all()}

        # Get alerts for this trace
        # Step 4: every alert that was raised on this trace.
        alerts_result = await session.execute(
            select(Alert).where(Alert.trace_id == trace_id)
        )
        alerts = alerts_result.scalars().all()

        # Step 5: build the JSON reply: a trace summary, the spans (each with its scores)
        # and the alerts.
        return {
            "trace": {
                "trace_id": trace.trace_id,
                "pipeline_id": trace.pipeline_id,
                "service_name": trace.service_name,
                "start_time": trace.start_time.isoformat() if trace.start_time else None,
                "end_time": trace.end_time.isoformat() if trace.end_time else None,
                "status": trace.status,
                "total_spans": trace.total_spans,
                "overall_risk_score": trace.overall_risk_score,
            },
            # Span fields: input_summary is the evidence the agent saw, output_summary is
            # what it said. tool_* describe the tool call, if there was one. latency_ms is
            # how long the step took.
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
                    "tool_args": s.tool_args,
                    "tool_result_summary": s.tool_result_summary,
                    "input_summary": s.input_summary,
                    "output_summary": s.output_summary,
                    "start_time": s.start_time.isoformat() if s.start_time else None,
                    # The span's scores, or None if there is no evaluation row for this span
                    # (for example the worker has not scored it yet). Every score runs from
                    # 0.0 (safe) to 1.0 (risky). grounding_score: how far the output is from
                    # being backed by the evidence. tool_claim_score: the share of the agent's
                    # claims about a tool that do not match what the tool really returned.
                    # overall_risk_score: a weighted average of the grounding, tool-claim and
                    # disagreement scores that exist. label: "high_risk" above 0.7,
                    # "medium_risk" above 0.4, otherwise "low_risk".
                    # evaluation_stage: "stage2" = the NLI model made the grounding score
                    # (NLI = a model that says if one sentence follows from another),
                    # "stage1" = similarity-only fallback, "skipped" = no grounding result.
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
            # "details" is the extra JSON saved with the alert (details_json), parsed back
            # into an object. It is None when the alert has no details.
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
            ],
        }


# Agents Router

# Every URL in this router starts with /v1/agents.
agents_router = APIRouter(prefix="/v1/agents", tags=["agents"])


# GET /v1/agents -> every agent AgentPulse has seen, most recently active first.
# Each row comes from the agent_records table (one row per agent).
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
                    # error_rate = failed spans / all spans. max(total_spans, 1) avoids
                    # dividing by zero.
                    "error_rate": (
                        round(a.total_errors / max(a.total_spans, 1), 4)
                    ),
                    # avg_latency_ms, avg_risk_score: moving averages (each new value counts
                    # 5%, the old average keeps 95%). current_asi: the latest Agent Stability
                    # Index, 0-100. Note: `if value else None` also turns an exact 0 into None.
                    "avg_latency_ms": round(a.avg_latency_ms, 1) if a.avg_latency_ms else None,
                    "avg_risk_score": round(a.avg_risk_score, 4) if a.avg_risk_score else None,
                    "current_asi": round(a.current_asi, 1) if a.current_asi else None,
                }
                for a in agents
            ]
        }


# GET /v1/agents/{agent_id}/health -> a summary of one agent plus its recent risk and drift
# history (up to 50 points each, newest first). Answers 404 if the agent is unknown.
@agents_router.get("/{agent_id}/health")
async def get_agent_health(agent_id: str):
    """Get detailed health metrics for an agent."""
    async with get_session() as session:
        # Agent record
        # Step 1: the agent's summary row (404 if we have never seen this agent).
        result = await session.execute(
            select(AgentRecord).where(AgentRecord.agent_id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Recent evaluations
        # Step 2: the 50 newest evaluations for this agent's spans. An Evaluation row has no
        # agent_id, so we JOIN to Span (match rows by span_id) and filter on Span.agent_id.
        evals = await session.execute(
            select(Evaluation)
            .join(Span, Span.span_id == Evaluation.span_id)
            .where(Span.agent_id == agent_id)
            .order_by(col(Evaluation.evaluated_at).desc())
            .limit(50)
        )
        recent_evals = evals.scalars().all()

        # Recent drift
        # Step 3: the 50 newest drift records for this agent (drift = the pattern of its
        # outputs changing over time compared with its own baseline).
        drift = await session.execute(
            select(DriftRecord)
            .where(DriftRecord.agent_id == agent_id)
            .order_by(col(DriftRecord.recorded_at).desc())
            .limit(50)
        )
        recent_drift = drift.scalars().all()

        # Step 4: build the reply: the agent summary, then two lists for charts.
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
            # risk_trend: one point per evaluation that has an overall risk score (higher
            # means riskier). Evaluations without a score are left out.
            "risk_trend": [
                {
                    "timestamp": e.evaluated_at.isoformat(),
                    "risk_score": e.overall_risk_score,
                    "grounding_score": e.grounding_score,
                }
                for e in recent_evals if e.overall_risk_score is not None
            ],
            # drift_trend: centroid_distance is how far one output's meaning (its embedding, a
            # list of numbers) is from the agent's running average. stability_index is the
            # ASI (Agent Stability Index): 100 = steady, 0 = very unstable.
            "drift_trend": [
                {
                    "timestamp": d.recorded_at.isoformat(),
                    "centroid_distance": d.centroid_distance,
                    "stability_index": d.stability_index,
                }
                for d in recent_drift
            ],
        }


# Drift Router

# Every URL in this router starts with /v1/drift.
drift_router = APIRouter(prefix="/v1/drift", tags=["drift"])


# GET /v1/drift -> for every known agent, its newest drift numbers in one list.
@drift_router.get("")
async def get_drift_overview():
    """Get drift overview for all agents."""
    async with get_session() as session:
        # Latest drift per agent
        # Step 1: load every known agent.
        agents_result = await session.execute(select(AgentRecord))
        agents = agents_result.scalars().all()

        overview = []
        for agent in agents:
            # Step 2: fetch this agent's single newest drift record (one query per agent).
            # `drift` is None when the agent has no drift record yet.
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
                # Two distinct signals, deliberately both exposed. The spike
                # metric fires on ordinary step-to-step variation; the windowed
                # one is what DRIFT_DETECTED alerts actually read. A null
                # windowed value means the baseline and current windows have not
                # both filled yet -- absent, not zero.
                "latest_centroid_distance": drift.centroid_distance if drift else None,
                "latest_window_centroid_distance": (
                    drift.window_centroid_distance if drift else None
                ),
                # tool_drift: how evenly the agent spreads its calls over different tools
                # (0 = always the same tool, 1 = all its tools equally). baseline_size: how
                # many of the agent's spans had been analyzed before this record.
                "latest_tool_drift": drift.tool_drift if drift else None,
                "baseline_size": drift.baseline_size if drift else 0,
            })

        return {"agents": overview}


# Alerts Router

# Two routers are created together here. Alerts live under /v1/alerts. The API-key routes
# (/v1/keys) are defined near the end of this file.
alerts_router = APIRouter(prefix="/v1/alerts", tags=["alerts"])
keys_router = APIRouter(prefix="/v1/keys", tags=["keys"])


# GET /v1/alerts -> alerts, newest first. Optional filters: severity, alert_type and
# acknowledged (true or false). limit is at most 200. An alert = a warning raised when a
# score crossed a threshold. alert_type is one of HIGH_HALLUCINATION_RISK,
# GROUNDING_FAILURE, TOOL_CLAIM_MISMATCH, DRIFT_DETECTED, ASI_DROP, ERROR_RATE_SPIKE;
# severity is HIGH or MEDIUM.
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
        # Compare with None (not just "if acknowledged") so that acknowledged=false, which
        # is a real filter, is still applied.
        if acknowledged is not None:
            query = query.where(Alert.acknowledged == acknowledged)
        query = query.limit(limit)

        result = await session.execute(query)
        alerts = result.scalars().all()

        # "details" is the extra JSON saved with the alert (details_json), parsed back into
        # an object. It is None when the alert has no details.
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


# Body of PATCH /v1/alerts/{alert_id}. Send only the fields you want to change. A field that
# is left out stays None and is ignored.
class AlertUpdate(BaseModel):
    acknowledged: Optional[bool] = None
    resolved: Optional[bool] = None


# PATCH /v1/alerts/{alert_id} -> mark one alert as acknowledged and / or resolved. Answers 404
# if the alert id does not exist.
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

        # Apply only the fields that were sent. Each time a flag is sent as true, its time is
        # set to now (replacing an older one). Sending false does not clear the old time.
        now = datetime.now(timezone.utc)
        if update.acknowledged is not None:
            alert.acknowledged = update.acknowledged
            if update.acknowledged:
                alert.acknowledged_at = now
        if update.resolved is not None:
            alert.resolved = update.resolved
            if update.resolved:
                alert.resolved_at = now

        # commit = save the changes to the database.
        await session.commit()
        return {"status": "updated", "alert_id": alert_id}


# Metrics Router

# The prefix is only /v1 because this router mixes several paths: /v1/metrics, /v1/platform
# and the /v1/health* probes.
metrics_router = APIRouter(prefix="/v1", tags=["metrics"])


# GET /v1/metrics -> system-wide totals (traces, spans, agents, alerts, averages, errors).
# Each number comes from its own small SQL query.
@metrics_router.get("/metrics")
async def get_metrics():
    """System-wide metrics overview."""
    async with get_session() as session:
        # func.count counts rows; func.avg averages a column. .scalar() returns the single
        # value of the result, and `or 0` turns None into 0.
        total_traces = (await session.execute(
            select(func.count(Trace.trace_id))
        )).scalar() or 0

        total_spans = (await session.execute(
            select(func.count(Span.span_id))
        )).scalar() or 0

        total_agents = (await session.execute(
            select(func.count(AgentRecord.agent_id))
        )).scalar() or 0

        # Despite its name, this counts only alerts nobody has acknowledged yet. `== False` is
        # on purpose: SQLAlchemy turns it into SQL (Python's `is False` would not work).
        total_alerts = (await session.execute(
            select(func.count(Alert.id)).where(Alert.acknowledged == False)
        )).scalar() or 0

        # Average overall risk over the evaluations that have a score. Rows with no score
        # (NULL) are skipped. The result is None when there is nothing to average.
        avg_risk = (await session.execute(
            select(func.avg(Evaluation.overall_risk_score))
            .where(Evaluation.overall_risk_score.isnot(None))
        )).scalar()

        avg_latency = (await session.execute(
            select(func.avg(Span.latency_ms))
            .where(Span.latency_ms.isnot(None))
        )).scalar()

        # A span counts as an error when its status is anything other than "success".
        error_count = (await session.execute(
            select(func.count(Span.span_id)).where(Span.status != "success")
        )).scalar() or 0

        # error_rate = error spans / all spans (max(total_spans, 1) avoids dividing by zero).
        # Note: an average of exactly 0 (risk or latency) also becomes None, because of the `if`.
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


# GET /v1/platform -> a detailed self-report about AgentPulse itself (not the agents it
# watches). The body is whatever collect_platform_health() in services/platform_health.py
# builds: an overall state, API checks, evaluation queue size, worker list, timing and
# failure numbers.
@metrics_router.get("/platform")
async def platform_health():
    """Operational state of AgentPulse ITSELF, from measured runtime signals.

    Distinct from `/v1/metrics`, which reports what the monitored agents are
    doing. This answers whether the platform is healthy, backlogged, degraded or
    failing — and does so without requiring the reader to infer it from an HTTP
    status code.

    Specifically it separates five states that a 200 response cannot
    distinguish: process alive, API healthy, models loaded, an evaluation worker
    alive, and that worker actually completing jobs. A fully-loaded API with no
    worker running returns 200 here and reports `state: failing`, because it is
    accepting work that nothing will ever evaluate.

    The final readiness/liveness API contract is deliberately left to the
    health/readiness phase; this endpoint reports state without redefining what
    `/v1/health` means.
    """
    # Imported here, when the route runs, and not at the top of the file. The other health
    # and API-key routes below do the same.
    from app.services.platform_health import collect_platform_health

    async with get_session() as session:
        return await collect_platform_health(session)


# GET /v1/health/live -> "is this process running?". Orchestrators (for example Kubernetes)
# call it. It needs no API key (it is listed in PUBLIC_EXACT in middleware.py).
@metrics_router.get("/health/live")
async def liveness_probe():
    """Liveness: is this process running?

    Consults nothing. A liveness probe that touched the database would restart a
    perfectly healthy process during a database blip, turning a small outage
    into a large one. Always 200 if the process can answer at all — which is
    precisely what "alive" means.
    """
    from app.services.readiness import liveness

    # liveness() returns alive=True, the process id, and how long the process has been up.
    return liveness()


# GET /v1/health/ready -> "can this API process serve requests?". The only thing it checks
# is that the database answers (a trivial `SELECT 1` query). No API key needed.
@metrics_router.get("/health/ready")
async def readiness_probe(request: Request, response: Response):
    """Readiness: can THIS process serve requests?

    Checks the database and nothing else. Models are deliberately excluded: the
    API performs no inference since evaluation moved to the worker, so gating
    readiness on model state would hold an API out of a load balancer over a
    capability it never uses.

    Returns 503 when not ready, so an orchestrator's readiness probe behaves
    correctly, while the body carries the explicit reason.
    """
    from app.services.readiness import api_readiness

    async with get_session() as session:
        result = await api_readiness(session)
    # Not ready -> reply with HTTP status 503 (Service Unavailable). `response` is the reply
    # being built; setting its status_code changes the HTTP status that is sent.
    if not result["ready"]:
        response.status_code = 503

    # In short: only a caller who sent the server's own API key (or a local-dev GET, see
    # middleware.py) gets the full result. Everyone else gets just {"ready": true/false}.
    # An unauthenticated caller gets the verdict, not the diagnosis. `checks`
    # carries the raw database exception string, which on failure can name a
    # file path or connection target -- fine for an operator holding the key,
    # not something to hand to anyone who can reach the port.
    if not getattr(request.state, "authenticated", False):
        return {"ready": result["ready"]}
    return result


# GET /v1/health/evaluator -> "is any worker alive that can score spans?". It reads worker
# heartbeats (rows each worker keeps refreshing in the database). Unlike the two probes
# above, it is not in PUBLIC_EXACT, so it needs an API key (a GET in local dev mode is let
# through without one). Replies 503 when no worker has a fresh heartbeat.
@metrics_router.get("/health/evaluator")
async def evaluator_probe(response: Response):
    """Evaluator readiness: can anything evaluate a span right now?

    A property of the worker fleet, not of this process. The API is never
    counted as an evaluator however many models it has loaded, because it does
    not claim jobs — counting it would advertise an evaluation capability that
    does not exist.

    503 when no worker is alive: spans will still be accepted and durably
    queued, but nothing will process them, and that is worth surfacing.
    """
    from app.services.readiness import evaluator_readiness

    async with get_session() as session:
        result = await evaluator_readiness(session)
    if not result["ready"]:
        response.status_code = 503
    return result


# GET /v1/health -> one summary of everything. No API key needed. It keeps the old fields
# (status, models, version) and adds "state": "healthy", "degraded" or "failing", with the
# reasons. "degraded" = working, but on a slower backend than was configured.
@metrics_router.get("/health")
async def health_check():
    """Aggregate health. Backward compatible, extended additively.

    `status`, `models` and `version` are preserved with their original types
    because `dashboard/src/lib/api.ts` declares that shape.

    IMPORTANT CHANGE IN MEANING: `models` reports the models loaded by *this
    process*. The API no longer loads them by default (see
    `settings.api_load_models`), so these are normally all false, and that is
    correct rather than alarming — the API does not evaluate. Evaluator model
    state lives under `readiness.evaluator`, sourced from worker heartbeats.

    The four states a single status code cannot separate are each reported
    explicitly: liveness, API readiness, evaluator readiness, and degradation.
    """
    from app.services.grounding import backend_info, models_loaded
    from app.services.readiness import (
        api_readiness,
        evaluator_readiness,
        liveness,
        overall_state,
    )

    # Step 1: ask which inference backend (the library that runs the models) this process
    # really uses, and whether it fell back to a slower one ("degraded"). With no model
    # loaded (the API default) it reports "not degraded".
    backend = backend_info()

    # Step 2: check the database (API readiness) and the worker heartbeats (evaluator
    # readiness).
    async with get_session() as session:
        api = await api_readiness(session)
        evaluator = await evaluator_readiness(session)

    # Step 3: combine them into one verdict. It is "failing" if the database does not answer
    # or no worker is alive, "degraded" if a slower backend is in use, otherwise "healthy".
    verdict = overall_state(api, evaluator, bool(backend["degraded"]))

    # Step 4: build the reply. Note that "status" is the fixed text "healthy" whatever the
    # verdict is. The real verdict is in "state".
    return {
        # preserved contract
        "status": "healthy",
        # models_loaded(): which models (NLI model, its tokenizer, embedding model) are in
        # memory in THIS process. All false for the API unless AGENTPULSE_API_LOAD_MODELS is
        # true; the worker loads them.
        "models": models_loaded(),
        "version": "0.1.0",
        # explicit, machine-readable state
        "state": verdict["state"],
        "reasons": verdict["reasons"],
        "liveness": liveness(),
        "readiness": {"api": api, "evaluator": evaluator},
        "inference_backend": backend,
        "degraded": bool(backend["degraded"]) or evaluator["degraded"],
        "models_required_by_api": settings.api_load_models,
        "models_note": (
            "`models` describes THIS process. The API performs no inference; "
            "evaluator model state is under readiness.evaluator."
        ),
    }


# ── API keys ─────────────────────────────────────────────────────────────────
#
# These endpoints are themselves authenticated, which means a caller needs a
# working key to mint another one. That is deliberate: the alternative is an
# unauthenticated endpoint that issues credentials, and the first key has to come
# from somewhere a stranger cannot reach -- the environment, set by whoever
# deployed the instance.


# Body of POST /v1/keys. owner_id says who the key is for. label is a free-text name; if it
# is empty, the saved label becomes "unnamed" (see services/api_keys.py).
class CreateKeyRequest(BaseModel):
    owner_id: str
    label: str = ""


# POST /v1/keys -> make a new API key. Status 201 means "Created". The full key text is in
# this reply only; the database keeps just a hash of it and a short prefix.
@keys_router.post("", status_code=201)
async def create_api_key(payload: CreateKeyRequest):
    """Issue a key and return it once.

    The plaintext appears in this response and nowhere else -- not in the
    database, not in a log. A caller that loses it revokes the key and issues
    another; there is no recovery path, by design.
    """
    from app.services.api_keys import create_key, redact

    async with get_session() as session:
        full_key, record = await create_key(
            session, owner_id=payload.owner_id, label=payload.label
        )

    # redact(record) is the saved row without its hash (id, prefix, label, owner, dates,
    # active). `**` copies those entries into this reply next to "key" and "warning".
    return {
        "key": full_key,
        "warning": "Store this now. It is not recoverable and will not be shown again.",
        **redact(record),
    }


# GET /v1/keys?owner_id=... -> the keys that belong to one owner, newest first. Hashes and
# full key texts are never included.
@keys_router.get("")
async def list_api_keys(owner_id: str = Query(..., description="Whose keys to list")):
    """Keys belonging to one owner, without their hashes."""
    from app.services.api_keys import list_keys, redact

    async with get_session() as session:
        rows = await list_keys(session, owner_id)
    return {"keys": [redact(r) for r in rows], "total": len(rows)}


# DELETE /v1/keys/{key_id}?owner_id=... -> revoke one key. Answers 404 when no key with that
# id belongs to that owner (a wrong owner looks the same as a missing key).
@keys_router.delete("/{key_id}")
async def revoke_api_key(
    key_id: int,
    owner_id: str = Query(..., description="Owner the key must belong to"),
):
    """Revoke a key.

    Scoped to the owner so an authenticated caller cannot revoke somebody
    else's key by guessing its id. Revocation marks a timestamp rather than
    deleting the row, so the key stays auditable afterwards.
    """
    from app.services.api_keys import revoke_key

    async with get_session() as session:
        ok = await revoke_key(session, owner_id, key_id)
    # ok is False when no key with this id belongs to this owner.
    if not ok:
        raise HTTPException(status_code=404, detail="Key not found for this owner")
    return {"revoked": True, "id": key_id}

