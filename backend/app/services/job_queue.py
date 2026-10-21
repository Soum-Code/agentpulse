"""Durable job queue for evaluation work.

Replaces FastAPI BackgroundTasks, which held pending evaluations in a list in
the API process's memory. Measured on that design: a SIGKILL during a 12-span
batch lost all 12 evaluations permanently, and a restart recovered none, because
nothing on disk recorded that the work had been owed.

Everything here operates on rows, so the queue survives process death by
construction rather than by careful shutdown handling.

THREE DESIGN CHOICES WORTH STATING

Claiming is a compare-and-swap, not a SELECT-then-UPDATE. `claim_next` reads a
candidate id, then updates it guarded by `status = 'queued'` and checks the
affected row count. If two workers pick the same candidate, exactly one
UPDATE matches and the loser simply tries the next row. A plain
SELECT-then-UPDATE would let both proceed and evaluate the same span twice.

Recovery is lease-based, not heartbeat-based. A killed worker cannot report its
own death, so liveness cannot be inferred from anything the worker does. Instead
a claim writes `lease_expires_at`; any job still `running` past that time is
assumed abandoned and returned to `queued`. The trade-off is explicit: a worker
that is merely slow (not dead) can have its job reclaimed, so the lease must
exceed the realistic worst-case evaluation time, and the *effects* of running a
job must be idempotent. Both are handled -- see `evaluation_runner`.

Backoff is stored, not slept. A failed job's next attempt time is written to
`available_at`. Sleeping in the worker would lose the delay on restart and would
block that worker from doing other work meanwhile.
"""

# ---- What this file is for ---------------------------------------------------
# This file is the to-do list for scoring spans. One job = one row in the
# `evaluation_jobs` table (the EvaluationJob model). The API adds a row for each new
# span. A separate worker process claims rows one by one, scores the span, and then
# marks the row as done or failed. The list lives in the database, so a crash of the
# API or the worker does not lose the work that is waiting.
#
# How it fits in: routers/ingest.py calls `enqueue_job`. app/worker.py calls
# `claim_next`, `mark_succeeded`, `mark_failed` and `recover_expired_leases`.
# This file only uses the EvaluationJob table from app/models.py.
# ------------------------------------------------------------------------------

from __future__ import annotations

# hashlib makes the SHA-256 fingerprint that is used as the job key (see job_key_for).
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# update() builds a SQL UPDATE statement. (select() comes from sqlmodel below.)
from sqlalchemy import update
# AsyncSession = a database session that is used with `await`.
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import EvaluationJob


# In short: a plain, read-only copy of one job row. frozen=True means its fields cannot
# be changed after it is created.
@dataclass(frozen=True)
class ClaimedJob:
    """A detached snapshot of a claimed job.

    Deliberately NOT the ORM instance. A worker holds a claimed job across the
    lifetime of a long evaluation, well after the claiming session has closed;
    touching an ORM attribute at that point triggers a lazy refresh on a dead
    session and raises `MissingGreenlet`. Returning plain data makes the job's
    lifetime independent of any session's, which is what a queue consumer needs.
    """

    # The fields copy the columns of the evaluation_jobs row. `payload_json` is the span's
    # data as JSON text. `attempts` counts claims so far, including this one.
    id: int
    job_key: str
    span_id: str
    trace_id: str
    agent_id: str
    payload_json: str
    attempts: int
    max_attempts: int

logger = logging.getLogger("agentpulse.job_queue")

# The five states a job can be in:
#   queued      = waiting for a worker to take it
#   running     = a worker holds it right now
#   succeeded   = done
#   failed      = can never work (for example a broken payload), so it is not retried
#   dead_letter = kept failing and used up all its attempts
# (The state diagram is in the EvaluationJob docstring in app/models.py.)
STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
STATUS_DEAD_LETTER = "dead_letter"

# The end states. No function in this file moves a job out of them. (Nothing in the
# repo reads this set at the moment.)
TERMINAL_STATUSES = {STATUS_SUCCEEDED, STATUS_FAILED, STATUS_DEAD_LETTER}

# How many attempts a job gets by default (stored on the row as max_attempts). When a
# retryable failure happens and attempts has reached it, mark_failed makes the job
# dead_letter. recover_expired_leases applies the same limit to a job whose worker died.
DEFAULT_MAX_ATTEMPTS = 3
# In short: a claim lasts 120 seconds. If the worker has not finished by then,
# recover_expired_leases puts the job back in the queue for another worker to claim.
# Must exceed realistic worst-case evaluation time. Evaluation is ~90-190ms per
# span for short text but runs to seconds on long agent outputs, and a batch is
# processed one span per job. 120s leaves a wide margin; too low and healthy
# work gets reclaimed and duplicated.
DEFAULT_LEASE_SECONDS = 120
# Retry delay: it starts at 2 seconds, doubles after each failed attempt, and is never
# more than 300 seconds (5 minutes). See compute_backoff_seconds.
BACKOFF_BASE_SECONDS = 2
BACKOFF_MAX_SECONDS = 300


def _now() -> datetime:
    """Naive UTC, matching how every other timestamp in this schema is stored."""
    # Get the current time in UTC, then remove the timezone label. A datetime without a
    # timezone label is called "naive".
    return datetime.now(timezone.utc).replace(tzinfo=None)


def job_key_for(trace_id: str, span_id: str) -> str:
    """Deterministic job identity.

    A span is the unit of evaluation, so the same span always maps to the same
    key. Combined with the UNIQUE constraint on `job_key`, re-submitting a span
    cannot create a second job -- deduplication is enforced by the database
    rather than by application code remembering to check.

    Hashed rather than concatenated so the column has a bounded length
    regardless of how long trace and span identifiers get.
    """
    # Join the two ids as "trace_id::span_id", turn the text into bytes, take its SHA-256
    # fingerprint, and return it as hex text (always 64 characters).
    return hashlib.sha256(f"{trace_id}::{span_id}".encode()).hexdigest()


def compute_backoff_seconds(attempts: int) -> int:
    """Exponential backoff, capped. `attempts` is the count already made."""
    # No attempt made yet means there is nothing to wait for.
    if attempts <= 0:
        return 0
    # The wait doubles with every attempt: 1st attempt -> 2 s, 2nd -> 4 s, 3rd -> 8 s, ...
    delay = BACKOFF_BASE_SECONDS * (2 ** (attempts - 1))
    # ...but it never goes above the cap (300 s).
    return int(min(delay, BACKOFF_MAX_SECONDS))


async def enqueue_job(
    session: AsyncSession,
    *,
    trace_id: str,
    span_id: str,
    agent_id: str,
    payload: dict[str, Any],
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> bool:
    """Enqueue evaluation for one span. Returns whether a job was created.

    `False` means an identical job already existed and this call was a no-op --
    the idempotent path for duplicate submission.

    Returns a bool rather than the ORM row for the same reason `claim_next`
    returns a snapshot: callers should not hold session-bound objects past the
    session.

    The caller owns the transaction; this does not commit.
    """
    # Step 1: work out the job's identity. The same span always gives the same key.
    key = job_key_for(trace_id, span_id)

    # Step 2: ask the database "is there already a job with this key?" We only need the
    # id, and .first() gives None when nothing matches. If one exists, do nothing.
    # (If two requests pass this check at the same moment, the UNIQUE rule on job_key makes
    # the database reject the second insert, so no duplicate job is created.)
    existing = (
        await session.execute(
            select(EvaluationJob.id).where(EvaluationJob.job_key == key)
        )
    ).first()
    if existing is not None:
        return False

    # Step 3: build the new row. The span's data is stored as JSON text; default=str
    # turns values JSON cannot handle (for example dates) into plain text instead of
    # raising an error. available_at = now means a worker may take it immediately.
    job = EvaluationJob(
        job_key=key,
        span_id=span_id,
        trace_id=trace_id,
        agent_id=agent_id,
        payload_json=json.dumps(payload, default=str),
        status=STATUS_QUEUED,
        max_attempts=max_attempts,
        available_at=_now(),
        created_at=_now(),
    )
    # Only add it to the session. Nothing is saved until the caller commits.
    session.add(job)
    return True


async def claim_next(
    session: AsyncSession,
    *,
    worker_id: str,
    lease_seconds: int = DEFAULT_LEASE_SECONDS,
    max_candidates: int = 10,
) -> Optional[ClaimedJob]:
    """Atomically claim one runnable job, or return None if there are none.

    The compare-and-swap is the whole point: the UPDATE is guarded on the row
    still being `queued`, so a race between two workers is resolved by the
    database and the loser moves on to another candidate.

    Returns a detached snapshot, not an ORM row -- see `ClaimedJob`.
    """
    # One fixed "now" for the whole call, so every time used below is consistent.
    now = _now()

    # Each pass of the loop tries one candidate job. We only go round again when another
    # worker took that candidate first. max_candidates (default 10) limits the retries.
    for _ in range(max_candidates):
        # Step 1: find the job that has waited longest. SQL meaning: status is 'queued',
        # available_at has already passed (so any retry delay is over), sorted by
        # available_at then id, take only the first one.
        candidate = (
            await session.execute(
                select(EvaluationJob)
                .where(EvaluationJob.status == STATUS_QUEUED)
                .where(EvaluationJob.available_at <= now)
                .order_by(EvaluationJob.available_at, EvaluationJob.id)
                .limit(1)
            )
        ).scalar_one_or_none()

        # Nothing to do: the queue is empty, or every queued job is still waiting out
        # its retry delay.
        if candidate is None:
            return None

        # Step 2: try to take the job. This is one UPDATE that says "set status to
        # running, but only where this row is STILL queued". If another worker changed
        # it a moment ago, no row matches and nothing changes. That is the guard.
        # `attempts + 1` is worked out by the database from the stored value, not from the
        # copy read in step 1. The lease runs for lease_seconds from now.
        result = await session.execute(
            update(EvaluationJob)
            .where(EvaluationJob.id == candidate.id)
            .where(EvaluationJob.status == STATUS_QUEUED)  # the guard
            .values(
                status=STATUS_RUNNING,
                worker_id=worker_id,
                attempts=EvaluationJob.attempts + 1,
                started_at=now,
                lease_expires_at=now + timedelta(seconds=lease_seconds),
            )
        )
        # Save now, so the claim is stored and other workers can see it.
        await session.commit()

        # rowcount = how many rows the UPDATE changed. 1 means we won the race.
        if result.rowcount == 1:
            # Re-read as a plain row so the snapshot reflects the post-claim
            # state (attempts incremented) without carrying ORM identity.
            row = (
                await session.execute(
                    select(
                        EvaluationJob.id,
                        EvaluationJob.job_key,
                        EvaluationJob.span_id,
                        EvaluationJob.trace_id,
                        EvaluationJob.agent_id,
                        EvaluationJob.payload_json,
                        EvaluationJob.attempts,
                        EvaluationJob.max_attempts,
                    ).where(EvaluationJob.id == candidate.id)
                )
            ).one()
            # The selected columns are in the same order as the ClaimedJob fields, so
            # `*row` fills them one by one.
            return ClaimedJob(*row)

        # Lost the race; another worker took it. Try the next candidate.
        logger.debug("claim race lost on job %s, retrying", candidate.id)

    # We lost the race max_candidates times in a row, so give up for now.
    return None


async def mark_succeeded(session: AsyncSession, job_id: int) -> None:
    """Mark a job as done. Also clears its lease, its worker and any old error text.

    The worker calls this after the evaluation finished. It saves (commits) at once.
    """
    await session.execute(
        update(EvaluationJob)
        .where(EvaluationJob.id == job_id)
        .values(
            status=STATUS_SUCCEEDED,
            completed_at=_now(),
            lease_expires_at=None,
            worker_id=None,
            last_error=None,
        )
    )
    await session.commit()


async def mark_failed(
    session: AsyncSession,
    job_id: int,
    *,
    error: str,
    retryable: bool = True,
) -> str:
    """Record a failure and decide what happens next. Returns the new status.

    `retryable=False` sends the job straight to `failed` without consuming
    further attempts -- a malformed payload is still malformed on attempt three,
    so retrying it only wastes a worker and delays the queue.
    """
    # Step 1: load the job row, because we need its attempts and max_attempts.
    # If the row is gone there is nothing to update, so warn and report "failed".
    job = (
        await session.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        logger.warning("mark_failed called for missing job %s", job_id)
        return STATUS_FAILED

    # Keep at most the first 2000 characters of the error text. `error or ""` turns a
    # missing error (None) into empty text first.
    trimmed = (error or "")[:2000]

    # Step 2: choose the next state. There are three cases. Each case builds `values`,
    # the columns to change. All three clear the lease and the worker id.
    # Case A: the job can never succeed -> `failed`, no more retries.
    if not retryable:
        new_status, values = STATUS_FAILED, {
            "status": STATUS_FAILED,
            "completed_at": _now(),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }
    # Case B: it may be retried, but all attempts are used up -> `dead_letter` (given up).
    elif job.attempts >= job.max_attempts:
        new_status, values = STATUS_DEAD_LETTER, {
            "status": STATUS_DEAD_LETTER,
            "completed_at": _now(),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }
    # Case C: it may be retried and attempts are left -> back to `queued`, but not before
    # a delay. The delay is saved in available_at. `attempts` is not changed here, because
    # claim_next already added 1 when a worker took the job.
    else:
        delay = compute_backoff_seconds(job.attempts)
        new_status, values = STATUS_QUEUED, {
            "status": STATUS_QUEUED,
            "available_at": _now() + timedelta(seconds=delay),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }

    # Step 3: write the chosen columns (`**values` spreads the dict into keyword
    # arguments), save, and tell the caller which state the job ended up in.
    await session.execute(
        update(EvaluationJob).where(EvaluationJob.id == job_id).values(**values)
    )
    await session.commit()
    return new_status


async def recover_expired_leases(session: AsyncSession) -> int:
    """Return abandoned `running` jobs to `queued`. Returns how many were requeued.

    This is what makes a killed worker survivable. It is deliberately driven by
    wall-clock lease expiry rather than by any signal from the worker, because a
    process that was SIGKILLed emits no signal at all.

    Note that `attempts` is not decremented: a job whose worker died has
    genuinely consumed an attempt, and pretending otherwise would let a job that
    reliably kills its worker retry forever. A worker that dies never calls
    `mark_failed`, so the limit is enforced here too: an abandoned job with no
    attempts left goes to `dead_letter` instead of back to `queued`.
    """
    now = _now()
    # The rows both UPDATEs below look at: `running`, with a lease time that is already in
    # the past.
    abandoned = (
        EvaluationJob.status == STATUS_RUNNING,
        EvaluationJob.lease_expires_at.is_not(None),
        EvaluationJob.lease_expires_at < now,
    )
    # First UPDATE: abandoned jobs that have used all their attempts are given up
    # (`dead_letter`), the same end state mark_failed gives a job that keeps failing.
    given_up = await session.execute(
        update(EvaluationJob)
        .where(*abandoned)
        .where(EvaluationJob.attempts >= EvaluationJob.max_attempts)
        .values(
            status=STATUS_DEAD_LETTER,
            completed_at=now,
            lease_expires_at=None,
            worker_id=None,
            last_error="worker died on every attempt",
        )
    )
    # Second UPDATE: every abandoned job still running (so with attempts left) goes back to
    # `queued` and can be claimed again at once (available_at = now). The last_error text
    # records why, so someone looking at the table can tell.
    result = await session.execute(
        update(EvaluationJob)
        .where(*abandoned)
        .values(
            status=STATUS_QUEUED,
            available_at=now,
            lease_expires_at=None,
            worker_id=None,
            last_error="reclaimed after lease expiry (worker presumed dead)",
        )
    )
    await session.commit()
    # rowcount = how many rows the UPDATE changed. `or 0` turns a missing value into 0.
    if given_up.rowcount:
        logger.error(
            "Dead-lettered %d job(s) whose worker died on every attempt", given_up.rowcount
        )
    count = result.rowcount or 0
    if count:
        logger.warning("Recovered %d job(s) abandoned by a dead worker", count)
    return count


# Note: no code in the repo calls queue_stats at the moment. The docstring below says
# the worker's logging uses it, but app/worker.py does not.
async def queue_stats(session: AsyncSession) -> dict[str, int]:
    """Counts by status. Used by the worker's logging and, later, by health."""
    # Step 1: read the status of every job row. (It loads one row per job and counts in
    # Python below, instead of letting SQL do the counting with GROUP BY.)
    rows = (
        await session.execute(
            select(EvaluationJob.status, EvaluationJob.id)
        )
    ).all()
    # Step 2: count the rows for each status. `_` is the job id, which we do not need.
    stats: dict[str, int] = {}
    for status, _ in rows:
        stats[status] = stats.get(status, 0) + 1
    return stats
