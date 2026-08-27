"""Data retention: delete operational telemetry older than a cutoff.

`settings.retention_days` existed as configuration but nothing read it, so the
database grew without bound. This implements it.

THE RETENTION CONTRACT

Retention is TRACE-DRIVEN. A trace and everything derived from it age together,
and children are deleted before parents. Driving the cascade from trace
membership rather than from each table's own timestamp is what guarantees no
orphans: a span cannot outlive its trace, because it is deleted *because* its
trace expired, not because of its own clock.

That matters more here than it would elsewhere, because SQLite is running with
`PRAGMA foreign_keys = 0` (verified; the app never enables it). The database will
not stop us from orphaning rows, so ordering is the only thing preventing it.

| Entity            | Ages by             | Deletable | Reason                                    |
| ----------------- | ------------------- | --------- | ----------------------------------------- |
| traces            | start_time          | yes       | root of the cascade                       |
| spans             | parent trace        | yes       | deleted with their trace                  |
| evaluations       | parent span         | yes       | deleted with their span                   |
| drift_records     | parent span         | yes       | deleted with their span                   |
| alerts            | parent trace        | yes       | deleted with their trace                  |
| evaluation_jobs   | created_at          | TERMINAL  | see below -- never deletes pending work    |
| agent_records     | --                  | NO        | registry keyed by identity, bounded by     |
|                   |                     |           | agent count, not by traffic                |
| baselines         | --                  | NO        | deleting them cold-starts drift detection  |
| dataset_cases     | --                  | NO        | curated research artifacts                 |
| experiment_runs   | --                  | NO        | research artifacts                         |

EVALUATION JOBS ARE THE DANGEROUS ONE. Only jobs in a terminal state
(`succeeded`, `failed`, `dead_letter`) are eligible. A `queued` or `running` job
is outstanding work, and deleting it would silently discard an evaluation that
the durable-queue phase exists to guarantee. The live database currently holds
24 queued jobs, so this is not hypothetical. Terminal jobs are also swept
independently of traces, because a job can outlive interest in its trace.

EXEMPTIONS ARE DELIBERATE. `dataset_cases` holds curated evaluation cases
(69 rows, all `v1.0_curated`) promoted from real incidents, and `baselines` holds
the drift centroids whose loss would make every agent cold-start. Neither grows
with traffic, so neither is a reason the database expands. Ageing them out would
destroy research inputs to save nothing.

SAFETY PROPERTIES

- **Deterministic cutoff.** Computed once and passed down. If each query
  recomputed "now", a long run would move the boundary mid-execution and could
  delete rows that were inside the window when the run started.
- **Batched.** Traces are processed in batches, each in its own transaction, so a
  large purge never becomes one enormous lock.
- **Idempotent.** A second run finds nothing older than the cutoff and deletes
  nothing.
- **Dry-run.** `plan_retention` counts what would go without touching anything.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Alert,
    DriftRecord,
    Evaluation,
    EvaluationJob,
    Span,
    Trace,
)

logger = logging.getLogger("agentpulse.retention")

# Job states safe to delete. Anything else is outstanding work.
TERMINAL_JOB_STATUSES = ("succeeded", "failed", "dead_letter")

# Entities deliberately never aged out, with the reason recorded so the
# exemption is a decision rather than an oversight.
EXEMPT_ENTITIES = {
    "agent_records": "registry keyed by agent identity; bounded by agent count, not traffic",
    "baselines": "drift centroids; deleting them cold-starts every agent's drift detection",
    "dataset_cases": "curated evaluation cases promoted from real incidents (research artifacts)",
    "experiment_runs": "recorded experiment results (research artifacts)",
}

DEFAULT_BATCH_SIZE = 500


@dataclass
class RetentionReport:
    """What a run did, or would do in dry-run."""

    cutoff: datetime
    retention_days: int
    dry_run: bool
    deleted: dict[str, int] = field(default_factory=dict)
    batches: int = 0
    exempt: dict[str, str] = field(default_factory=lambda: dict(EXEMPT_ENTITIES))

    @property
    def total(self) -> int:
        return sum(self.deleted.values())

    def as_dict(self) -> dict:
        return {
            "cutoff": self.cutoff.isoformat(),
            "retention_days": self.retention_days,
            "dry_run": self.dry_run,
            "batches": self.batches,
            "deleted": dict(self.deleted),
            "total_rows": self.total,
            "exempt_entities": self.exempt,
        }


def compute_cutoff(retention_days: int, now: Optional[datetime] = None) -> datetime:
    """The single point in time this run works against.

    Naive UTC, matching how every timestamp in this schema is stored. Accepting
    an explicit `now` keeps the function testable without freezing clocks.
    """
    reference = now or datetime.now(timezone.utc)
    if reference.tzinfo is not None:
        reference = reference.astimezone(timezone.utc).replace(tzinfo=None)
    return reference - timedelta(days=retention_days)


async def _expired_trace_ids(
    session: AsyncSession, cutoff: datetime, limit: int
) -> list[str]:
    rows = await session.execute(
        select(Trace.trace_id)
        .where(Trace.start_time < cutoff)
        .order_by(Trace.start_time)
        .limit(limit)
    )
    return [r[0] for r in rows.all()]


async def plan_retention(
    session: AsyncSession, retention_days: int, now: Optional[datetime] = None
) -> RetentionReport:
    """Count what a run would delete, without deleting anything."""
    cutoff = compute_cutoff(retention_days, now)
    report = RetentionReport(cutoff=cutoff, retention_days=retention_days, dry_run=True)

    trace_count = (
        await session.execute(
            select(func.count()).select_from(Trace).where(Trace.start_time < cutoff)
        )
    ).scalar_one()

    expired = select(Trace.trace_id).where(Trace.start_time < cutoff)
    expired_spans = select(Span.span_id).where(Span.trace_id.in_(expired))

    report.deleted["traces"] = trace_count
    report.deleted["spans"] = (
        await session.execute(
            select(func.count()).select_from(Span).where(Span.trace_id.in_(expired))
        )
    ).scalar_one()
    report.deleted["evaluations"] = (
        await session.execute(
            select(func.count()).select_from(Evaluation)
            .where(Evaluation.span_id.in_(expired_spans))
        )
    ).scalar_one()
    report.deleted["drift_records"] = (
        await session.execute(
            select(func.count()).select_from(DriftRecord)
            .where(DriftRecord.span_id.in_(expired_spans))
        )
    ).scalar_one()
    report.deleted["alerts"] = (
        await session.execute(
            select(func.count()).select_from(Alert).where(Alert.trace_id.in_(expired))
        )
    ).scalar_one()
    report.deleted["evaluation_jobs"] = (
        await session.execute(
            select(func.count()).select_from(EvaluationJob)
            .where(EvaluationJob.created_at < cutoff)
            .where(EvaluationJob.status.in_(TERMINAL_JOB_STATUSES))
        )
    ).scalar_one()

    return report


async def _purge_trace_batch(
    session: AsyncSession, trace_ids: list[str], counts: dict[str, int]
) -> None:
    """Delete one batch of traces and everything hanging off them.

    Order is children first, then parents. With foreign keys unenforced this
    ordering is the only thing standing between a purge and a database full of
    orphans, so it is not merely tidy.
    """
    span_ids = [
        r[0] for r in (
            await session.execute(select(Span.span_id).where(Span.trace_id.in_(trace_ids)))
        ).all()
    ]

    if span_ids:
        counts["evaluations"] += (
            await session.execute(
                delete(Evaluation).where(Evaluation.span_id.in_(span_ids))
            )
        ).rowcount or 0
        counts["drift_records"] += (
            await session.execute(
                delete(DriftRecord).where(DriftRecord.span_id.in_(span_ids))
            )
        ).rowcount or 0

    counts["spans"] += (
        await session.execute(delete(Span).where(Span.trace_id.in_(trace_ids)))
    ).rowcount or 0
    counts["alerts"] += (
        await session.execute(delete(Alert).where(Alert.trace_id.in_(trace_ids)))
    ).rowcount or 0

    # Only terminal jobs. A queued or running job for an expired trace is still
    # outstanding work and is left alone; it will be swept once it completes.
    counts["evaluation_jobs"] += (
        await session.execute(
            delete(EvaluationJob)
            .where(EvaluationJob.trace_id.in_(trace_ids))
            .where(EvaluationJob.status.in_(TERMINAL_JOB_STATUSES))
        )
    ).rowcount or 0

    counts["traces"] += (
        await session.execute(delete(Trace).where(Trace.trace_id.in_(trace_ids)))
    ).rowcount or 0


async def apply_retention(
    session_factory,
    retention_days: int,
    *,
    dry_run: bool = False,
    batch_size: int = DEFAULT_BATCH_SIZE,
    now: Optional[datetime] = None,
) -> RetentionReport:
    """Delete operational data older than `retention_days`.

    `session_factory` is a callable returning an async session context manager
    (i.e. `app.database.get_session`), because each batch commits in its own
    transaction rather than holding one lock for the whole purge.
    """
    if retention_days <= 0:
        logger.info("Retention disabled (retention_days=%s); nothing to do", retention_days)
        return RetentionReport(
            cutoff=compute_cutoff(0, now), retention_days=retention_days, dry_run=True
        )

    cutoff = compute_cutoff(retention_days, now)

    if dry_run:
        async with session_factory() as session:
            report = await plan_retention(session, retention_days, now)
        logger.info("Retention DRY RUN, cutoff %s: would delete %s",
                    cutoff.isoformat(), report.deleted)
        return report

    report = RetentionReport(cutoff=cutoff, retention_days=retention_days, dry_run=False)
    counts: dict[str, int] = {
        "traces": 0, "spans": 0, "evaluations": 0,
        "drift_records": 0, "alerts": 0, "evaluation_jobs": 0,
    }

    while True:
        async with session_factory() as session:
            trace_ids = await _expired_trace_ids(session, cutoff, batch_size)
            if not trace_ids:
                break
            await _purge_trace_batch(session, trace_ids, counts)
            await session.commit()
        report.batches += 1

    # Terminal jobs whose trace has already gone, or which never had a retained
    # trace. Swept separately so the queue table cannot grow unbounded on a
    # system whose traces have all expired.
    async with session_factory() as session:
        counts["evaluation_jobs"] += (
            await session.execute(
                delete(EvaluationJob)
                .where(EvaluationJob.created_at < cutoff)
                .where(EvaluationJob.status.in_(TERMINAL_JOB_STATUSES))
            )
        ).rowcount or 0
        await session.commit()

    report.deleted = counts
    logger.info(
        "Retention complete: cutoff=%s batches=%d deleted=%s (exempt: %s)",
        cutoff.isoformat(), report.batches, counts, ", ".join(sorted(EXEMPT_ENTITIES)),
    )
    return report
