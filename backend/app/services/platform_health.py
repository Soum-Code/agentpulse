"""Operational state of AgentPulse itself, assembled from real runtime signals.

The acceptance question this exists to answer: can an operator tell whether the
platform is **healthy, backlogged, degraded, or failing** without inferring it
from an HTTP status code?

FIVE DISTINCT THINGS, DELIBERATELY NOT COLLAPSED

    process alive          the API answered this request at all
    API healthy            it is serving without server errors
    models loaded          the API's own models finished loading
    worker alive           an evaluator process has heartbeat recently
    worker processing      that evaluator is actually completing jobs

They are genuinely different states, and the system has already demonstrated why
conflating them is wrong: `/v1/health` returned 200 while models were still
loading on a background thread, and a probe that trusted it measured "60 spans
evaluated in 1.5 seconds" because nothing was being evaluated.

A fully-loaded API with no worker running is *process alive + API healthy +
models loaded* and still **not evaluating anything**. That combination is exactly
what this module makes visible.

WORKER BACKEND IS READ FROM THE WORKER, NOT THE API. Both load models
independently, and evaluation happens in the worker, so the API's own backend
says nothing about what actually evaluated a span. Reading it from the heartbeat
is what makes a dependency regression that silently reverts the evaluator to the
slow PyTorch path detectable instead of invisible.

COST. Queue depth and job aggregates are computed from a small number of grouped
queries against indexed columns, on demand when the endpoint is called — not per
ingest request. High-frequency signals (request rates, API latency) come from
in-process counters instead, so the observability path does not become the
expensive part of the request path.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EvaluationJob, RetentionRun, WorkerHeartbeat

# A worker that has not written a heartbeat in this long is presumed gone.
# Comfortably above the heartbeat interval so a slow beat is not read as death.
WORKER_STALE_AFTER_SECONDS = 90

# Queue depth above which the platform is described as backlogged. Chosen
# relative to measured throughput (~12 spans/sec at 4 workers), so this is
# roughly a minute of work outstanding, not an arbitrary round number.
BACKLOG_THRESHOLD = 750

ALL_JOB_STATUSES = ("queued", "running", "succeeded", "failed", "dead_letter")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def job_state_counts(session: AsyncSession) -> dict[str, int]:
    """Counts by job status. One grouped query on an indexed column."""
    rows = (
        await session.execute(
            select(EvaluationJob.status, func.count(EvaluationJob.id))
            .group_by(EvaluationJob.status)
        )
    ).all()
    counts = {status: 0 for status in ALL_JOB_STATUSES}
    for status, count in rows:
        counts[status] = count
    return counts


async def evaluation_timing(session: AsyncSession, sample: int = 500) -> dict[str, Any]:
    """Latency percentiles over the most recently completed jobs.

    Bounded to a recent sample rather than the whole table: the useful question
    is "how is it performing now", and a lifetime average would be dominated by
    history and would get slower to compute as the table grows.
    """
    rows = (
        await session.execute(
            select(EvaluationJob.created_at, EvaluationJob.started_at,
                   EvaluationJob.completed_at)
            .where(EvaluationJob.status == "succeeded")
            .where(EvaluationJob.completed_at.is_not(None))
            .order_by(EvaluationJob.completed_at.desc())
            .limit(sample)
        )
    ).all()

    queue_wait: list[float] = []
    evaluation: list[float] = []
    end_to_end: list[float] = []
    for created, started, completed in rows:
        if created and started:
            queue_wait.append((started - created).total_seconds() * 1000)
        if started and completed:
            evaluation.append((completed - started).total_seconds() * 1000)
        if created and completed:
            end_to_end.append((completed - created).total_seconds() * 1000)

    def pct(values: list[float], p: float) -> Optional[float]:
        if not values:
            return None
        ordered = sorted(values)
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k], 1)

    return {
        "sample_size": len(rows),
        "queue_wait_ms": {"p50": pct(queue_wait, 50), "p95": pct(queue_wait, 95)},
        "evaluation_ms": {"p50": pct(evaluation, 50), "p95": pct(evaluation, 95)},
        "end_to_end_ms": {"p50": pct(end_to_end, 50), "p95": pct(end_to_end, 95)},
    }


async def retry_and_failure_stats(session: AsyncSession) -> dict[str, Any]:
    total_jobs = (
        await session.execute(select(func.count(EvaluationJob.id)))
    ).scalar_one() or 0
    total_attempts = (
        await session.execute(select(func.coalesce(func.sum(EvaluationJob.attempts), 0)))
    ).scalar_one() or 0
    terminal_failures = (
        await session.execute(
            select(func.count(EvaluationJob.id))
            .where(EvaluationJob.status.in_(("failed", "dead_letter")))
        )
    ).scalar_one() or 0
    completed = (
        await session.execute(
            select(func.count(EvaluationJob.id))
            .where(EvaluationJob.status.in_(("succeeded", "failed", "dead_letter")))
        )
    ).scalar_one() or 0

    # An attempt beyond the first is a retry, by definition of the queue's
    # claim logic (attempts increments on claim).
    retries = max(0, int(total_attempts) - int(total_jobs))
    return {
        "jobs_total": int(total_jobs),
        "jobs_completed": int(completed),
        "terminal_failures": int(terminal_failures),
        "failure_rate": round(terminal_failures / completed, 4) if completed else None,
        "retry_count": retries,
    }


async def worker_fleet(session: AsyncSession) -> dict[str, Any]:
    """Which evaluator processes exist, and what each is running on."""
    rows = (await session.execute(select(WorkerHeartbeat))).scalars().all()
    now = _now()
    stale_cutoff = now - timedelta(seconds=WORKER_STALE_AFTER_SECONDS)

    workers = []
    alive = 0
    degraded_workers = 0
    backends: dict[str, int] = {}

    for w in rows:
        is_alive = w.last_heartbeat_at >= stale_cutoff and w.status == "running"
        if is_alive:
            alive += 1
            backends[w.nli_backend or "unknown"] = backends.get(w.nli_backend or "unknown", 0) + 1
            if w.backend_degraded:
                degraded_workers += 1
        workers.append({
            "worker_id": w.worker_id,
            "hostname": w.hostname,
            "pid": w.pid,
            "status": w.status,
            "alive": is_alive,
            "seconds_since_heartbeat": round((now - w.last_heartbeat_at).total_seconds(), 1),
            "jobs_processed": w.jobs_processed,
            "jobs_failed": w.jobs_failed,
            "nli_backend": w.nli_backend,
            "embedding_backend": w.embedding_backend,
            "backend_degraded": w.backend_degraded,
            "fallback_reason": w.fallback_reason,
        })

    workers.sort(key=lambda w: (not w["alive"], w["worker_id"]))
    return {
        "registered": len(rows),
        "alive": alive,
        "stale": len(rows) - alive,
        "stale_after_seconds": WORKER_STALE_AFTER_SECONDS,
        "degraded_backends": degraded_workers,
        "backend_distribution": backends,
        "workers": workers,
    }


async def last_retention_run(session: AsyncSession) -> Optional[dict[str, Any]]:
    row = (
        await session.execute(
            select(RetentionRun).order_by(RetentionRun.started_at.desc()).limit(1)
        )
    ).scalars().first()
    if row is None:
        return None
    return {
        "started_at": row.started_at.isoformat(),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "cutoff": row.cutoff.isoformat(),
        "retention_days": row.retention_days,
        "dry_run": row.dry_run,
        "batches": row.batches,
        "total_rows_deleted": row.total_rows_deleted,
        "rows_deleted": json.loads(row.rows_deleted_json) if row.rows_deleted_json else {},
        "error": row.error,
    }


def derive_state(*, models_ready: bool, api_degraded: bool, workers: dict,
                 queue_depth: int) -> dict[str, Any]:
    """Reduce the signals to a single operator-facing verdict, with reasons.

    The verdict never replaces the underlying numbers; it exists so an operator
    is not required to interpret six fields correctly under pressure. Reasons
    are returned alongside so the verdict can be checked rather than trusted.
    """
    reasons: list[str] = []

    if not models_ready:
        reasons.append("API models are not fully loaded")
    if api_degraded:
        reasons.append("API inference backend is degraded")
    if workers["alive"] == 0:
        reasons.append("no evaluation worker is alive; nothing is being evaluated")
    if workers["degraded_backends"]:
        reasons.append(
            f"{workers['degraded_backends']} worker(s) running a degraded "
            f"inference backend"
        )
    if queue_depth > BACKLOG_THRESHOLD:
        reasons.append(f"evaluation queue depth {queue_depth} exceeds {BACKLOG_THRESHOLD}")

    if workers["alive"] == 0:
        state = "failing"          # accepting work that will never be evaluated
    elif not models_ready:
        state = "starting"
    elif queue_depth > BACKLOG_THRESHOLD:
        state = "backlogged"
    elif workers["degraded_backends"] or api_degraded:
        state = "degraded"
    else:
        state = "healthy"

    return {"state": state, "reasons": reasons}


async def collect_platform_health(session: AsyncSession) -> dict[str, Any]:
    """The full self-monitoring picture."""
    from app.services.grounding import backend_info, models_loaded
    from app.services.runtime_metrics import COUNTERS

    loaded = models_loaded()
    api_backend = backend_info()
    counts = await job_state_counts(session)
    fleet = await worker_fleet(session)
    queue_depth = counts["queued"] + counts["running"]

    verdict = derive_state(
        models_ready=all(loaded.values()),
        api_degraded=bool(api_backend.get("degraded")),
        workers=fleet,
        queue_depth=queue_depth,
    )

    return {
        **verdict,
        "checked_at": _now().isoformat(),
        "api": {
            "process_alive": True,   # true by construction: this response exists
            "models_loaded": loaded,
            "models_ready": all(loaded.values()),
            "inference_backend": api_backend,
        },
        "evaluation_queue": {
            "depth": queue_depth,
            "backlog_threshold": BACKLOG_THRESHOLD,
            "by_status": counts,
        },
        "evaluation_timing": await evaluation_timing(session),
        "reliability": await retry_and_failure_stats(session),
        "workers": fleet,
        "retention": {"last_run": await last_retention_run(session)},
        "runtime_counters": COUNTERS.snapshot(),
    }
