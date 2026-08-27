"""Explicit liveness and readiness semantics.

Four questions that HTTP 200 cannot answer separately, and which this module
answers individually:

    LIVENESS            is this process running?
    API READINESS       can the API serve requests?
    EVALUATOR READINESS is anything able to evaluate a span?
    PLATFORM STATE      healthy / starting / degraded / backlogged / failing

DEFINITIONS, chosen so each check depends only on what it actually needs

**Liveness** depends on nothing. If the process can produce a response it is
alive. A liveness probe that touches the database would restart a healthy
process during a database blip, which is the classic way to turn a small
outage into a large one.

**API readiness** is "can this process serve its endpoints", and the answer is
the database — every route reads or writes it. It deliberately does **not**
include models: since evaluation moved to the worker, no API route performs
inference. Requiring models for API readiness would keep an API out of a load
balancer over a capability it never uses.

**Evaluator readiness** is a property of the *fleet*, not of this process. At
least one worker must have heartbeat recently. The API process is never counted
as an evaluator, however many models it happens to have loaded — it does not
claim jobs, so counting it would report an evaluation capability that does not
exist.

**Degraded** means running, correct, but not on the configured backend — ONNX
requested and PyTorch active. Results are identical; throughput roughly halves.
It is deliberately not "unhealthy": a degraded system serving correct results
should not be pulled from a load balancer.

WHY THESE ARE SEPARATE FROM `/v1/platform`. That endpoint is a rich operator
view. These are the machine-readable signals a deployment system polls, so they
stay cheap and single-purpose.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WorkerHeartbeat

# Shared with platform_health so a worker is never "alive" in one view and
# "stale" in the other.
from app.services.platform_health import WORKER_STALE_AFTER_SECONDS


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def check_database(session: AsyncSession) -> dict[str, Any]:
    """The API's only hard dependency.

    A trivial query rather than a table count: this runs on every readiness
    poll, and the question is "is the database answering", not "how much is in
    it".
    """
    try:
        await session.execute(text("SELECT 1"))
        return {"ok": True, "detail": None}
    except Exception as exc:  # noqa: BLE001 - report, do not raise, on a probe
        return {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}


async def evaluator_readiness(session: AsyncSession) -> dict[str, Any]:
    """Is anything able to evaluate a span right now?

    Answered from worker heartbeats, never from this process's own model state.
    A worker refuses to start unless its models loaded, so a fresh heartbeat
    implies a usable evaluator; the API having models loaded implies nothing,
    because the API does not claim jobs.
    """
    stale_cutoff = _now() - timedelta(seconds=WORKER_STALE_AFTER_SECONDS)

    rows = (
        await session.execute(
            select(WorkerHeartbeat)
            .where(WorkerHeartbeat.status == "running")
            .where(WorkerHeartbeat.last_heartbeat_at >= stale_cutoff)
        )
    ).scalars().all()

    total_registered = (
        await session.execute(select(func.count(WorkerHeartbeat.worker_id)))
    ).scalar_one() or 0

    backends: dict[str, int] = {}
    degraded = 0
    for w in rows:
        key = w.nli_backend or "unknown"
        backends[key] = backends.get(key, 0) + 1
        if w.backend_degraded:
            degraded += 1

    reasons: list[str] = []
    if not rows:
        reasons.append(
            "no evaluation worker has sent a heartbeat within "
            f"{WORKER_STALE_AFTER_SECONDS}s; spans will be queued but not evaluated"
        )
    if degraded:
        reasons.append(
            f"{degraded} of {len(rows)} live worker(s) running a degraded "
            f"inference backend"
        )

    return {
        "ready": bool(rows),
        "workers_alive": len(rows),
        "workers_registered": int(total_registered),
        "workers_stale": max(0, int(total_registered) - len(rows)),
        "stale_after_seconds": WORKER_STALE_AFTER_SECONDS,
        "backend_distribution": backends,
        "degraded_workers": degraded,
        "degraded": degraded > 0,
        "reasons": reasons,
    }


async def api_readiness(session: AsyncSession) -> dict[str, Any]:
    """Can this process serve its endpoints?

    Models are deliberately excluded: the API performs no inference, so gating
    its readiness on model state would hold it out of service over a capability
    it never uses.
    """
    database = await check_database(session)
    reasons = [] if database["ok"] else [f"database unavailable: {database['detail']}"]
    return {
        "ready": database["ok"],
        "checks": {"database": database},
        "reasons": reasons,
    }


def liveness() -> dict[str, Any]:
    """Alive means alive. No dependency is consulted, deliberately."""
    import os

    from app.services.runtime_metrics import COUNTERS

    snapshot = COUNTERS.snapshot()
    return {
        "alive": True,
        "pid": os.getpid(),
        "process_started_at": snapshot["process_started_at"],
        "uptime_seconds": snapshot["uptime_seconds"],
    }


def overall_state(api: dict[str, Any], evaluator: dict[str, Any],
                  api_backend_degraded: bool) -> dict[str, Any]:
    """One machine-readable verdict, with the reasons that produced it.

    Ordering is by operator consequence, not by severity of the word:

      failing   the API cannot serve, or nothing can evaluate. Work accepted now
                is work that will not be processed.
      degraded  serving and evaluating correctly, but not on the configured
                backend. Slower, not wrong -- explicitly NOT unhealthy.
      healthy   everything as configured.
    """
    reasons = list(api["reasons"]) + list(evaluator["reasons"])

    if not api["ready"]:
        state = "failing"
    elif not evaluator["ready"]:
        state = "failing"
    elif evaluator["degraded"] or api_backend_degraded:
        state = "degraded"
    else:
        state = "healthy"

    return {"state": state, "reasons": reasons}
