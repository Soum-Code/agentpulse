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

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import EvaluationJob


@dataclass(frozen=True)
class ClaimedJob:
    """A detached snapshot of a claimed job.

    Deliberately NOT the ORM instance. A worker holds a claimed job across the
    lifetime of a long evaluation, well after the claiming session has closed;
    touching an ORM attribute at that point triggers a lazy refresh on a dead
    session and raises `MissingGreenlet`. Returning plain data makes the job's
    lifetime independent of any session's, which is what a queue consumer needs.
    """

    id: int
    job_key: str
    span_id: str
    trace_id: str
    agent_id: str
    payload_json: str
    attempts: int
    max_attempts: int

logger = logging.getLogger("agentpulse.job_queue")

STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
STATUS_DEAD_LETTER = "dead_letter"

TERMINAL_STATUSES = {STATUS_SUCCEEDED, STATUS_FAILED, STATUS_DEAD_LETTER}

DEFAULT_MAX_ATTEMPTS = 3
# Must exceed realistic worst-case evaluation time. Evaluation is ~90-190ms per
# span for short text but runs to seconds on long agent outputs, and a batch is
# processed one span per job. 120s leaves a wide margin; too low and healthy
# work gets reclaimed and duplicated.
DEFAULT_LEASE_SECONDS = 120
BACKOFF_BASE_SECONDS = 2
BACKOFF_MAX_SECONDS = 300


def _now() -> datetime:
    """Naive UTC, matching how every other timestamp in this schema is stored."""
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
    return hashlib.sha256(f"{trace_id}::{span_id}".encode()).hexdigest()


def compute_backoff_seconds(attempts: int) -> int:
    """Exponential backoff, capped. `attempts` is the count already made."""
    if attempts <= 0:
        return 0
    delay = BACKOFF_BASE_SECONDS * (2 ** (attempts - 1))
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
    key = job_key_for(trace_id, span_id)

    existing = (
        await session.execute(
            select(EvaluationJob.id).where(EvaluationJob.job_key == key)
        )
    ).first()
    if existing is not None:
        return False

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
    now = _now()

    for _ in range(max_candidates):
        candidate = (
            await session.execute(
                select(EvaluationJob)
                .where(EvaluationJob.status == STATUS_QUEUED)
                .where(EvaluationJob.available_at <= now)
                .order_by(EvaluationJob.available_at, EvaluationJob.id)
                .limit(1)
            )
        ).scalar_one_or_none()

        if candidate is None:
            return None

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
        await session.commit()

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
            return ClaimedJob(*row)

        # Lost the race; another worker took it. Try the next candidate.
        logger.debug("claim race lost on job %s, retrying", candidate.id)

    return None


async def mark_succeeded(session: AsyncSession, job_id: int) -> None:
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
    job = (
        await session.execute(select(EvaluationJob).where(EvaluationJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        logger.warning("mark_failed called for missing job %s", job_id)
        return STATUS_FAILED

    trimmed = (error or "")[:2000]

    if not retryable:
        new_status, values = STATUS_FAILED, {
            "status": STATUS_FAILED,
            "completed_at": _now(),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }
    elif job.attempts >= job.max_attempts:
        new_status, values = STATUS_DEAD_LETTER, {
            "status": STATUS_DEAD_LETTER,
            "completed_at": _now(),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }
    else:
        delay = compute_backoff_seconds(job.attempts)
        new_status, values = STATUS_QUEUED, {
            "status": STATUS_QUEUED,
            "available_at": _now() + timedelta(seconds=delay),
            "lease_expires_at": None,
            "worker_id": None,
            "last_error": trimmed,
        }

    await session.execute(
        update(EvaluationJob).where(EvaluationJob.id == job_id).values(**values)
    )
    await session.commit()
    return new_status


async def recover_expired_leases(session: AsyncSession) -> int:
    """Return abandoned `running` jobs to `queued`. Returns how many.

    This is what makes a killed worker survivable. It is deliberately driven by
    wall-clock lease expiry rather than by any signal from the worker, because a
    process that was SIGKILLed emits no signal at all.

    Note that `attempts` is not decremented: a job whose worker died has
    genuinely consumed an attempt, and pretending otherwise would let a job that
    reliably kills its worker retry forever.
    """
    now = _now()
    result = await session.execute(
        update(EvaluationJob)
        .where(EvaluationJob.status == STATUS_RUNNING)
        .where(EvaluationJob.lease_expires_at.is_not(None))
        .where(EvaluationJob.lease_expires_at < now)
        .values(
            status=STATUS_QUEUED,
            available_at=now,
            lease_expires_at=None,
            worker_id=None,
            last_error="reclaimed after lease expiry (worker presumed dead)",
        )
    )
    await session.commit()
    count = result.rowcount or 0
    if count:
        logger.warning("Recovered %d job(s) abandoned by a dead worker", count)
    return count


async def queue_stats(session: AsyncSession) -> dict[str, int]:
    """Counts by status. Used by the worker's logging and, later, by health."""
    rows = (
        await session.execute(
            select(EvaluationJob.status, EvaluationJob.id)
        )
    ).all()
    stats: dict[str, int] = {}
    for status, _ in rows:
        stats[status] = stats.get(status, 0) + 1
    return stats
