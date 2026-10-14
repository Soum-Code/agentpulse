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

# WHAT THIS FILE IS FOR
# Builds the big "how is AgentPulse itself doing?" report. It reads the database (how many
# evaluation jobs are in each state, how long they take, how often they fail, which workers
# are alive, the last retention run, how often each score is really filled in) and the
# in-memory counters. Then it reduces all of that to one word: healthy, starting, degraded,
# backlogged or failing, plus the reasons for it.
#
# HOW IT FITS IN
# The GET /v1/platform route in routers/__init__.py calls collect_platform_health. This file
# uses the tables in models.py, api_readiness from readiness.py, COUNTERS from
# runtime_metrics.py, and the model/backend info from grounding.py. readiness.py imports
# WORKER_STALE_AFTER_SECONDS from here.

from __future__ import annotations

# json is used to turn the saved retention counts (JSON text) back into a dictionary.
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# func = SQL functions such as COUNT and SUM. select = builds a SELECT query.
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Evaluation, EvaluationJob, RetentionRun, WorkerHeartbeat

# A worker that has not written a heartbeat in this long is presumed gone.
# Comfortably above the heartbeat interval so a slow beat is not read as death.
# (An idle worker writes a heartbeat every 15 seconds, a busy one more often; see worker.py.)
WORKER_STALE_AFTER_SECONDS = 90

# Queue depth above which the platform is described as backlogged. Chosen
# relative to measured throughput (~12 spans/sec at 4 workers), so this is
# roughly a minute of work outstanding, not an arbitrary round number.
# "Queue depth" here means jobs that are queued plus jobs that are running.
BACKLOG_THRESHOLD = 750

# Every status an evaluation job can have (see services/job_queue.py). Used so that a status
# with no jobs still shows up with a count of 0.
ALL_JOB_STATUSES = ("queued", "running", "succeeded", "failed", "dead_letter")


# The current UTC time without a timezone label ("naive"). The worker heartbeat and job times
# in the database are stored in this style (see models.py), so they can be compared with it.
def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def job_state_counts(session: AsyncSession) -> dict[str, int]:
    """Counts by job status. One grouped query on an indexed column."""
    # SQL: SELECT status, COUNT(id) FROM evaluation_jobs GROUP BY status.
    # That gives one row per status that has at least one job.
    rows = (
        await session.execute(
            select(EvaluationJob.status, func.count(EvaluationJob.id))
            .group_by(EvaluationJob.status)
        )
    ).all()
    # Start every known status at 0, then fill in the counts. A status with no jobs stays 0.
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
    # Step 1: ask for the three timestamps of the newest `sample` jobs (default 500) that
    # succeeded. "Newest" means the latest completed_at first.
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

    # Step 2: for each job, work out three durations in milliseconds:
    #   queue_wait = started - created   (time waiting for a worker)
    #   evaluation = completed - started (time spent being scored)
    #   end_to_end = completed - created (the whole time)
    # started_at is overwritten at every claim, so for a retried job it holds the LAST claim.
    # That makes queue_wait include the earlier tries and the retry delays as well.
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

    # pct = the p-th percentile: sort the values and pick the one p% of the way along (the
    # position is rounded to the nearest place). p50 is the middle value. p95 is a value that
    # about 95 out of 100 jobs stayed under. No values at all gives None.
    def pct(values: list[float], p: float) -> Optional[float]:
        if not values:
            return None
        ordered = sorted(values)
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k], 1)

    # Step 3: report how many jobs were sampled, and p50 / p95 of each duration.
    return {
        "sample_size": len(rows),
        "queue_wait_ms": {"p50": pct(queue_wait, 50), "p95": pct(queue_wait, 95)},
        "evaluation_ms": {"p50": pct(evaluation, 50), "p95": pct(evaluation, 95)},
        "end_to_end_ms": {"p50": pct(end_to_end, 50), "p95": pct(end_to_end, 95)},
    }


# How often jobs fail and how often they are retried, over ALL jobs in the table.
# Four counts come from the database, and the numbers in the reply are worked out from them.
async def retry_and_failure_stats(session: AsyncSession) -> dict[str, Any]:
    # Number of jobs in the table, whatever their status.
    total_jobs = (
        await session.execute(select(func.count(EvaluationJob.id)))
    ).scalar_one() or 0
    # Sum of the `attempts` column. coalesce(..., 0) gives 0 instead of NULL on an empty table.
    total_attempts = (
        await session.execute(select(func.coalesce(func.sum(EvaluationJob.attempts), 0)))
    ).scalar_one() or 0
    # Jobs that ended badly: "failed" (cannot work) or "dead_letter" (ran out of attempts).
    terminal_failures = (
        await session.execute(
            select(func.count(EvaluationJob.id))
            .where(EvaluationJob.status.in_(("failed", "dead_letter")))
        )
    ).scalar_one() or 0
    # Jobs that are finished, good or bad (not queued and not running).
    completed = (
        await session.execute(
            select(func.count(EvaluationJob.id))
            .where(EvaluationJob.status.in_(("succeeded", "failed", "dead_letter")))
        )
    ).scalar_one() or 0

    # An attempt beyond the first is a retry, by definition of the queue's
    # claim logic (attempts increments on claim).
    # Note: a job nobody has claimed yet has attempts = 0, so each one lowers this result
    # by 1. With many queued jobs, the retry count can read too low (never below 0).
    retries = max(0, int(total_attempts) - int(total_jobs))
    # failure_rate = terminal failures / finished jobs, or None if no job has finished yet.
    return {
        "jobs_total": int(total_jobs),
        "jobs_completed": int(completed),
        "terminal_failures": int(terminal_failures),
        "failure_rate": round(terminal_failures / completed, 4) if completed else None,
        "retry_count": retries,
    }


async def worker_fleet(session: AsyncSession) -> dict[str, Any]:
    """Which evaluator processes exist, and what each is running on."""
    # Step 1: load every heartbeat row (one row per worker process). Unlike readiness.py,
    # this also loads stale and stopping workers, so they can be listed in the report.
    rows = (await session.execute(select(WorkerHeartbeat))).scalars().all()
    now = _now()
    stale_cutoff = now - timedelta(seconds=WORKER_STALE_AFTER_SECONDS)

    workers = []
    alive = 0
    degraded_workers = 0
    backends: dict[str, int] = {}

    # Step 2: go through the workers. A worker is "alive" only if its last heartbeat is
    # recent enough AND its status is "running". The backend counts and the degraded count
    # include live workers only. Every worker, alive or not, gets an entry in the list.
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

    # Step 3: sort the list. The key (not alive, worker_id) puts live workers first
    # (False sorts before True), and then orders by worker_id.
    workers.sort(key=lambda w: (not w["alive"], w["worker_id"]))
    # Step 4: reply with the totals for the whole fleet (registered, alive, stale), the backend
    # counts from step 2 (live workers only), then the list. "stale" means every registered
    # worker that is not alive, which includes workers that said "stopping".
    return {
        "registered": len(rows),
        "alive": alive,
        "stale": len(rows) - alive,
        "stale_after_seconds": WORKER_STALE_AFTER_SECONDS,
        "degraded_backends": degraded_workers,
        "backend_distribution": backends,
        "workers": workers,
    }


# The most recent real retention run (the one with the newest started_at), or None if
# retention has never run. Dry runs are not saved, so they never show up here.
# The deleted-row counts are stored as JSON text, so json.loads turns them back into a dict.
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


# Inputs (all keyword-only, from collect_platform_health below):
#   api_ready       True when the database answers.
#   api_degraded    True when the API process's own inference backend fell back to a slower one.
#   workers         the dictionary that worker_fleet returned.
#   queue_depth     jobs that are queued plus jobs that are running.
#   models_pending  True when this deployment asked the API to load models and some are not
#                   loaded yet.
# Output: {"state": one word, "reasons": a list of plain-English texts}.
def derive_state(*, api_ready: bool, api_degraded: bool, workers: dict,
                 queue_depth: int, models_pending: bool = False) -> dict[str, Any]:
    """Reduce the signals to a single operator-facing verdict, with reasons.

    The verdict never replaces the underlying numbers; it exists so an operator
    is not required to interpret six fields correctly under pressure. Reasons
    are returned alongside so the verdict can be checked rather than trusted.

    `api_ready` is the DATABASE, not the API's models. An earlier version took
    `models_ready` and reported `starting` whenever the API had no models
    loaded — which became permanent once the API stopped loading them, since it
    performs no inference. Model state only participates via `models_pending`,
    and only for deployments that opt into API-side model loading.
    """
    # Step 1: collect a reason text for EVERY problem found. Several can be true at once,
    # and all of them are listed even though only one state is chosen in step 2.
    reasons: list[str] = []

    if not api_ready:
        reasons.append("API is not ready: its database dependency is unavailable")
    if models_pending:
        reasons.append("API models are still loading (api_load_models is enabled)")
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

    # Step 2: choose ONE state. The rules run from top to bottom and the first that fits
    # wins, so the order is the order of importance: failing, starting, backlogged,
    # degraded, healthy.
    if not api_ready:
        state = "failing"          # cannot serve at all
    elif workers["alive"] == 0:
        state = "failing"          # accepting work that will never be evaluated
    elif models_pending:
        state = "starting"
    elif queue_depth > BACKLOG_THRESHOLD:
        state = "backlogged"
    elif workers["degraded_backends"] or api_degraded:
        state = "degraded"
    else:
        state = "healthy"

    return {"state": state, "reasons": reasons}


async def signal_coverage(session: AsyncSession, sample: int = 200) -> dict[str, Any]:
    """How often each signal actually produced a value, over recent evaluations.

    A signal can be absent without anything being broken, and that is the
    failure mode this exists to make visible.

    Grounding compares a span's captured input against its captured output. The
    SDK's capture flags -- AGENTPULSE_CAPTURE_INPUTS and _CAPTURE_OUTPUTS --
    default to false, so a correctly installed deployment with a healthy worker
    can evaluate every span it receives and never produce a single grounding
    score. No exception is raised and nothing is logged; `evaluator.py` simply
    skips the step when either text is missing. From the outside that is
    indistinguishable from a broken evaluator.

    Coverage of 0.0 against a non-zero sample says "switched off", which is a
    different problem from "failing" and has a different fix.

    Tool-claim and disagreement are conditional by nature -- a span with no tool
    call cannot produce a tool-claim score -- so low coverage there is normal
    and is reported without comment.
    """
    # Step 1: load the three score columns of the newest `sample` evaluations (default 200),
    # newest first. A column holds None when that score was not produced for the span.
    rows = (
        await session.execute(
            select(
                Evaluation.grounding_score,
                Evaluation.tool_claim_score,
                Evaluation.disagreement_score,
            )
            .order_by(Evaluation.id.desc())
            .limit(sample)
        )
    ).all()

    # Step 2: with no evaluations at all there is nothing to measure. Return an empty result.
    total = len(rows)
    if total == 0:
        return {"sample_size": 0, "signals": {}, "notes": []}

    # ratio(i) = the share of rows where column i (0 = grounding, 1 = tool claim,
    # 2 = disagreement) is not None. 1.0 means every evaluation has that score and 0.0
    # means none does. The share is rounded to 4 decimal places.
    def ratio(index: int) -> float:
        return round(sum(1 for r in rows if r[index] is not None) / total, 4)

    # Step 3: only grounding gets an explanation. When it is exactly 0.0, add a note saying
    # grounding may be switched off, because the SDK was not told to capture the input and
    # output text (see the docstring).
    grounding = ratio(0)
    notes = []
    if grounding == 0.0:
        notes.append(
            "No grounding score in the last {n} evaluations. Grounding needs both "
            "input_summary and output_summary on the span, and the SDK does not "
            "capture either unless AGENTPULSE_CAPTURE_INPUTS and "
            "AGENTPULSE_CAPTURE_OUTPUTS are set to true. If that is deliberate "
            "(they default to false for privacy) this is expected; otherwise the "
            "grounding signal is switched off rather than failing.".format(n=total)
        )

    # Step 4: return the sample size, the three ratios and the notes.
    return {
        "sample_size": total,
        "signals": {
            "grounding": grounding,
            "tool_claim": ratio(1),
            "disagreement": ratio(2),
        },
        "notes": notes,
    }


async def collect_platform_health(session: AsyncSession) -> dict[str, Any]:
    """The full self-monitoring picture."""
    # These imports are inside the function, not at the top of the file. In particular,
    # readiness.py imports this file at its top, so importing it back at the top here
    # would make a circular import.
    from app.config import settings
    from app.services.grounding import backend_info, models_loaded
    from app.services.readiness import api_readiness
    from app.services.runtime_metrics import COUNTERS

    # Step 1: ask THIS process (the API) which models it has loaded and which inference
    # backend it uses. This says nothing about the workers; they report for themselves.
    loaded = models_loaded()
    api_backend = backend_info()
    # Step 2: read the job counts per status and the worker list from the database.
    # Queue depth = jobs waiting plus jobs being worked on right now.
    counts = await job_state_counts(session)
    fleet = await worker_fleet(session)
    queue_depth = counts["queued"] + counts["running"]
    # Step 3: check that the API itself can serve (that the database answers).
    api = await api_readiness(session)

    # Step 4: reduce all of this to one state word plus the reasons.
    verdict = derive_state(
        api_ready=api["ready"],
        api_degraded=bool(api_backend.get("degraded")),
        workers=fleet,
        queue_depth=queue_depth,
        # Only a meaningful state when this deployment asked the API to load
        # models; otherwise their absence is the intended configuration.
        models_pending=settings.api_load_models and not all(loaded.values()),
    )

    # Step 5: build the report. **verdict puts "state" and "reasons" at the top level. The
    # sections below hold the raw numbers behind the verdict, so it can be checked.
    return {
        **verdict,
        "checked_at": _now().isoformat(),
        "api": {
            "process_alive": True,   # true by construction: this response exists
            "ready": api["ready"],
            "checks": api["checks"],
            "models_loaded": loaded,
            "models_required": settings.api_load_models,
            "inference_backend": api_backend,
        },
        # The queue: how many jobs are outstanding, the limit for "backlogged", and the count
        # for each status.
        "evaluation_queue": {
            "depth": queue_depth,
            "backlog_threshold": BACKLOG_THRESHOLD,
            "by_status": counts,
        },
        # Four sections below (evaluation_timing, signal_coverage, reliability, retention) each
        # run their own database queries while the reply is built.
        # evaluation_timing: how long jobs waited and took (p50 / p95 over recent jobs).
        "evaluation_timing": await evaluation_timing(session),
        # How often each score was really produced in recent evaluations.
        "signal_coverage": await signal_coverage(session),
        # Retry and failure numbers over all jobs.
        "reliability": await retry_and_failure_stats(session),
        "workers": fleet,
        "retention": {"last_run": await last_retention_run(session)},
        # In-memory counters of this API process (see runtime_metrics.py). They reset when
        # the process restarts.
        "runtime_counters": COUNTERS.snapshot(),
    }
