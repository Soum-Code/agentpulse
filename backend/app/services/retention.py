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

# WHAT THIS FILE IS FOR
# Deletes old data so the database does not grow for ever. It finds the traces that started
# before a cutoff time (now minus retention_days), then deletes those traces together with
# their spans, evaluations (the scores), drift records and alerts. It also deletes finished
# evaluation jobs: those of the deleted traces, and any others older than the cutoff. A
# "dry run" only counts what would be deleted. A real run saves a summary row (RetentionRun)
# so an operator can see it later.
#
# HOW IT FITS IN
# The only caller in the app is app/retention_cli.py, run by hand or from a scheduler.
# This file uses the tables in models.py. services/platform_health.py reads the saved
# RetentionRun row to show the last run.

from __future__ import annotations

import json
import logging
# dataclass = a short way to write a class that mostly just holds data.
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

# delete = builds a SQL DELETE. func = SQL functions such as COUNT. select = builds a SELECT.
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Alert,
    RetentionRun,
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
# This dict does not change what is deleted: the delete code below simply never touches
# these tables. The dict is only copied into each report, and its keys (the table names)
# are printed in the final log line of a real run.
EXEMPT_ENTITIES = {
    "agent_records": "registry keyed by agent identity; bounded by agent count, not traffic",
    "baselines": "drift centroids; deleting them cold-starts every agent's drift detection",
    "dataset_cases": "curated evaluation cases promoted from real incidents (research artifacts)",
    "experiment_runs": "recorded experiment results (research artifacts)",
}

# How many traces are deleted in one batch. Each batch is its own database transaction.
DEFAULT_BATCH_SIZE = 500


# The result of a run. cutoff = data older than this was (or would be) deleted.
# deleted = rows removed per table (in a dry run: rows that WOULD be removed).
# batches = how many batches were run. exempt = tables that are never deleted, with reasons.
@dataclass
class RetentionReport:
    """What a run did, or would do in dry-run."""

    cutoff: datetime
    retention_days: int
    dry_run: bool
    deleted: dict[str, int] = field(default_factory=dict)
    batches: int = 0
    exempt: dict[str, str] = field(default_factory=lambda: dict(EXEMPT_ENTITIES))

    # Total rows over all tables.
    @property
    def total(self) -> int:
        return sum(self.deleted.values())

    # The report as a plain dictionary. The cutoff date becomes text so it can be sent as JSON.
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
    # Use the given time, or the current UTC time. If it has a timezone label, convert it
    # to UTC and remove the label. Then go back `retention_days` days from that moment.
    reference = now or datetime.now(timezone.utc)
    if reference.tzinfo is not None:
        reference = reference.astimezone(timezone.utc).replace(tzinfo=None)
    return reference - timedelta(days=retention_days)


# Returns up to `limit` trace ids whose start_time is before the cutoff, oldest first.
# SQL: SELECT trace_id FROM traces WHERE start_time < cutoff ORDER BY start_time LIMIT n.
# Used to pick the next batch to delete.
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
    # Step 1: work out the cutoff and start a report marked as a dry run.
    cutoff = compute_cutoff(retention_days, now)
    report = RetentionReport(cutoff=cutoff, retention_days=retention_days, dry_run=True)

    # Step 2: count the traces that started before the cutoff.
    trace_count = (
        await session.execute(
            select(func.count()).select_from(Trace).where(Trace.start_time < cutoff)
        )
    ).scalar_one()

    # `expired` and `expired_spans` are not run on their own. Each is a sub-query that is
    # placed inside a later "IN (...)" test: the ids of the expired traces, and the ids of
    # the spans that belong to those traces.
    expired = select(Trace.trace_id).where(Trace.start_time < cutoff)
    expired_spans = select(Span.span_id).where(Span.trace_id.in_(expired))

    # Step 3: count the rows in every other table that would go with those traces.
    # Spans, evaluations, drift records and alerts are found through the expired traces.
    # Evaluation jobs are different: they are counted by their own created_at, and only
    # in a finished state. The real run also deletes finished jobs of expired traces
    # whatever their created_at, so the real number can be a little higher.
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
    # `counts` is updated in place: each DELETE adds the number of rows it removed.
    # This function does not commit. The caller commits, so one batch is one transaction.
    #
    # Step 1: find the ids of all spans in these traces. Evaluations and drift records are
    # deleted by span_id (a drift record has no trace_id), so the span ids are needed first.
    span_ids = [
        r[0] for r in (
            await session.execute(select(Span.span_id).where(Span.trace_id.in_(trace_ids)))
        ).all()
    ]

    # Step 2: delete the rows that hang off the spans (evaluations, then drift records).
    # `.rowcount` is how many rows the DELETE removed; `or 0` turns an empty (None) value
    # into 0, so the addition always works.
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

    # Step 3: delete the spans, then the alerts. Both carry the trace id directly.
    counts["spans"] += (
        await session.execute(delete(Span).where(Span.trace_id.in_(trace_ids)))
    ).rowcount or 0
    counts["alerts"] += (
        await session.execute(delete(Alert).where(Alert.trace_id.in_(trace_ids)))
    ).rowcount or 0

    # Step 4: delete the finished jobs of these traces.
    # Only terminal jobs. A queued or running job for an expired trace is still
    # outstanding work and is left alone; it will be swept once it completes.
    counts["evaluation_jobs"] += (
        await session.execute(
            delete(EvaluationJob)
            .where(EvaluationJob.trace_id.in_(trace_ids))
            .where(EvaluationJob.status.in_(TERMINAL_JOB_STATUSES))
        )
    ).rowcount or 0

    # Step 5: delete the traces last, because everything above pointed to them.
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
    # Step 1: retention_days of 0 or less means "retention is switched off". Return an
    # empty report (marked as a dry run) and delete nothing.
    if retention_days <= 0:
        logger.info("Retention disabled (retention_days=%s); nothing to do", retention_days)
        return RetentionReport(
            cutoff=compute_cutoff(0, now), retention_days=retention_days, dry_run=True
        )

    # Step 2: work out the cutoff ONCE and reuse it everywhere below.
    cutoff = compute_cutoff(retention_days, now)

    # Step 3: a dry run only counts. It deletes nothing and saves no RetentionRun row.
    if dry_run:
        async with session_factory() as session:
            report = await plan_retention(session, retention_days, now)
        logger.info("Retention DRY RUN, cutoff %s: would delete %s",
                    cutoff.isoformat(), report.deleted)
        return report

    # Step 4: a real run. Note the start time and set a counter to 0 for each table.
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)
    report = RetentionReport(cutoff=cutoff, retention_days=retention_days, dry_run=False)
    counts: dict[str, int] = {
        "traces": 0, "spans": 0, "evaluations": 0,
        "drift_records": 0, "alerts": 0, "evaluation_jobs": 0,
    }

    # Step 5: delete in batches, oldest traces first. Each pass opens a NEW session, so
    # each batch is its own transaction. A pass picks the next `batch_size` expired traces,
    # deletes them with everything that hangs off them, and commits. Because the picked
    # traces are gone after the commit, the next pass sees the next oldest ones. The loop
    # stops when no expired trace is left. If the program stops half way, the batches that
    # were already committed stay deleted, and the next run carries on from there.
    while True:
        async with session_factory() as session:
            trace_ids = await _expired_trace_ids(session, cutoff, batch_size)
            if not trace_ids:
                break
            await _purge_trace_batch(session, trace_ids, counts)
            await session.commit()
        report.batches += 1

    # Step 6: a final clean-up of finished jobs older than the cutoff.
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

    # Step 7: put the final per-table counts into the report.
    report.deleted = counts

    # Step 8: save a RetentionRun row with the totals.
    # Persisted so "did retention run, and what did it remove?" is answerable
    # without reading logs from a process that has already exited.
    # If saving the row fails, the error is only logged and not raised: the deletes above
    # are already committed, so failing here would not undo them. rows_deleted_json is the
    # per-table counts written as JSON text.
    try:
        async with session_factory() as session:
            session.add(RetentionRun(
                started_at=started_at,
                completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
                cutoff=cutoff,
                retention_days=retention_days,
                dry_run=False,
                batches=report.batches,
                total_rows_deleted=report.total,
                rows_deleted_json=json.dumps(counts),
            ))
            await session.commit()
    except Exception:
        logger.warning("Could not record retention run", exc_info=True)

    # Step 9: log a one-line summary and return the report.
    logger.info(
        "Retention complete: cutoff=%s batches=%d deleted=%s (exempt: %s)",
        cutoff.isoformat(), report.batches, counts, ", ".join(sorted(EXEMPT_ENTITIES)),
    )
    return report
