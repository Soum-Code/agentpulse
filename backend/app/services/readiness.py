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

# WHAT THIS FILE IS FOR
# Small checks that answer "is AgentPulse up?" in separate ways. Is this process alive
# (liveness)? Can the API reach its database (API readiness)? Is any evaluation worker alive
# (evaluator readiness)? And one combined word for all of it: healthy, degraded or failing
# (overall_state). A worker is judged by its "heartbeat": a row it keeps rewriting in the
# database to say "I am still running".
#
# HOW IT FITS IN
# The /v1/health, /v1/health/live, /v1/health/ready and /v1/health/evaluator routes in
# routers/__init__.py call these functions. This file uses the WorkerHeartbeat table
# (models.py), WORKER_STALE_AFTER_SECONDS (platform_health.py) and the in-memory counters
# (runtime_metrics.py, for liveness). platform_health.py calls api_readiness too.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# func = SQL functions such as COUNT. select = builds a SELECT query.
# text = wraps a plain SQL string so it can be run.
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WorkerHeartbeat

# Shared with platform_health so a worker is never "alive" in one view and
# "stale" in the other.
from app.services.platform_health import WORKER_STALE_AFTER_SECONDS


# The current UTC time without a timezone label ("naive"). The worker heartbeat times are
# stored in this style (see models.py), so this value can be compared with them directly.
def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def check_database(session: AsyncSession) -> dict[str, Any]:
    """The API's only hard dependency.

    A trivial query rather than a table count: this runs on every readiness
    poll, and the question is "is the database answering", not "how much is in
    it".
    """
    try:
        # SELECT 1 just asks the database to send back the number 1. If it answers, the
        # database is reachable.
        await session.execute(text("SELECT 1"))
        return {"ok": True, "detail": None}
    except Exception as exc:  # noqa: BLE001 - report, do not raise, on a probe
        # Any error means "not ok". The error name and message go into "detail" instead of
        # being raised, so the caller can still build a reply with ready = false (the /ready
        # route adds a 503 status to it).
        return {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}


async def evaluator_readiness(session: AsyncSession) -> dict[str, Any]:
    """Is anything able to evaluate a span right now?

    Answered from worker heartbeats, never from this process's own model state.
    A worker refuses to start unless its models loaded, so a fresh heartbeat
    implies a usable evaluator; the API having models loaded implies nothing,
    because the API does not claim jobs.
    """
    # Step 1: the oldest heartbeat time that still counts as "alive". A heartbeat older than
    # this many seconds (WORKER_STALE_AFTER_SECONDS) means the worker is presumed gone.
    stale_cutoff = _now() - timedelta(seconds=WORKER_STALE_AFTER_SECONDS)

    # Step 2: load the live workers: rows whose status is "running" AND whose last heartbeat
    # is not older than the cutoff. A worker that wrote "stopping" is left out.
    rows = (
        await session.execute(
            select(WorkerHeartbeat)
            .where(WorkerHeartbeat.status == "running")
            .where(WorkerHeartbeat.last_heartbeat_at >= stale_cutoff)
        )
    ).scalars().all()

    # Step 3: count ALL registered workers (live or not), to report how many are stale.
    total_registered = (
        await session.execute(select(func.count(WorkerHeartbeat.worker_id)))
    ).scalar_one() or 0

    # Step 4: among the live workers, count how many use each NLI backend. NLI (natural
    # language inference) is the model that checks whether one text supports another; its
    # backend is the engine that runs it, such as "onnx" or "pytorch". Also count the workers
    # flagged degraded (running a slower backend than was asked for). A missing name is
    # counted as "unknown".
    backends: dict[str, int] = {}
    degraded = 0
    for w in rows:
        key = w.nli_backend or "unknown"
        backends[key] = backends.get(key, 0) + 1
        if w.backend_degraded:
            degraded += 1

    # Step 5: write the reasons in plain words: no live worker, and/or some degraded ones.
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

    # Step 6: build the reply. "ready" is true when at least one live worker exists.
    # "workers_stale" is registered minus alive, so it also counts workers that are
    # "stopping". max(0, ...) stops the number from going below zero.
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
    # Only one check exists so far (the database), so there is at most one reason text.
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

    # The start time and uptime come from the in-memory counters (runtime_metrics.py).
    # os.getpid() is the operating system's number for this running process.
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
    # Step 1: join the reasons from both checks into one list. Every reason is kept, even
    # if the state below is decided by only one of them.
    reasons = list(api["reasons"]) + list(evaluator["reasons"])

    # Step 2: pick the state. The first rule that fits wins. Unlike derive_state in
    # platform_health.py, this version has no "starting" or "backlogged" state, and it
    # does not look at the queue size. api_backend_degraded is True when this API
    # process itself fell back to a slower inference backend.
    if not api["ready"]:
        state = "failing"
    elif not evaluator["ready"]:
        state = "failing"
    elif evaluator["degraded"] or api_backend_degraded:
        state = "degraded"
    else:
        state = "healthy"

    return {"state": state, "reasons": reasons}
