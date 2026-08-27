"""Retention tests against a controlled database with known old and new records.

The acceptance criterion these exist to prove: *given a deterministic cutoff,
every eligible record older than the cutoff is removed, every ineligible record
remains, and referential integrity is preserved.*

That cannot be established by reading the code, so every test here seeds a real
database with rows on both sides of the cutoff and inspects what survives.

WHY REFERENTIAL INTEGRITY IS CHECKED EXPLICITLY. SQLite runs with
`PRAGMA foreign_keys = 0` in this application — the database will not stop a
purge from orphaning rows. Deletion ordering is the only protection, so
`assert_no_orphans` runs after every destructive case.
"""

from __future__ import annotations

import asyncio
import os
import sqlite3
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.retention import (  # noqa: E402
    EXEMPT_ENTITIES,
    TERMINAL_JOB_STATUSES,
    apply_retention,
    compute_cutoff,
    plan_retention,
)

RETENTION_DAYS = 30
NOW = datetime(2026, 8, 28, 12, 0, 0)          # fixed clock: deterministic cutoff
OLD = NOW - timedelta(days=60)                  # comfortably outside the window
RECENT = NOW - timedelta(days=2)                # comfortably inside it
EDGE_INSIDE = NOW - timedelta(days=RETENTION_DAYS) + timedelta(minutes=1)


def migrate(db: Path) -> None:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, f"migration failed:\n{result.stderr}"


def seed(db: Path) -> None:
    """One old trace and one recent trace, each with a full dependent set,
    plus the exempt entities and jobs in every status."""
    conn = sqlite3.connect(str(db))

    def ts(dt: datetime) -> str:
        return dt.isoformat(sep=" ")

    for tag, when in (("old", OLD), ("new", RECENT)):
        conn.execute(
            "INSERT INTO traces (trace_id, start_time, status, total_spans, service_name) "
            "VALUES (?,?,?,?,?)", (f"trace-{tag}", ts(when), "completed", 2, "svc"))
        for i in range(2):
            span_id = f"span-{tag}-{i}"
            conn.execute(
                "INSERT INTO spans (span_id, trace_id, agent_id, span_kind, event_type, "
                "start_time, status) VALUES (?,?,?,?,?,?,?)",
                (span_id, f"trace-{tag}", f"agent{i}", "AGENT", "agent_execution",
                 ts(when), "success"))
            conn.execute(
                "INSERT INTO evaluations (span_id, trace_id, evaluated_at, evaluator_name, "
                "model_name, model_version, config_version, threshold_version, "
                "evaluator_version) VALUES (?,?,?,?,?,?,?,?,?)",
                (span_id, f"trace-{tag}", ts(when), "e", "m", "v", "v", "v", "v"))
            conn.execute(
                "INSERT INTO drift_records (agent_id, span_id, recorded_at) VALUES (?,?,?)",
                (f"agent{i}", span_id, ts(when)))
        conn.execute(
            "INSERT INTO alerts (trace_id, alert_type, severity, message, created_at, "
            "acknowledged, resolved) VALUES (?,?,?,?,?,?,?)",
            (f"trace-{tag}", "TEST", "high", "m", ts(when), 0, 0))

    # Jobs: one per status, old and new, so terminal-vs-pending is exercised
    # on both sides of the cutoff.
    for tag, when in (("old", OLD), ("new", RECENT)):
        for status in ("queued", "running", "succeeded", "failed", "dead_letter"):
            conn.execute(
                "INSERT INTO evaluation_jobs (job_key, span_id, trace_id, agent_id, "
                "payload_json, status, attempts, max_attempts, available_at, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (f"key-{tag}-{status}", f"span-{tag}-0", f"trace-{tag}", "agent0",
                 "{}", status, 0, 3, ts(when), ts(when)))

    # Exempt entities, all old enough to be deleted if they were eligible.
    conn.execute(
        "INSERT INTO agent_records (agent_id, first_seen, last_seen, total_spans, "
        "total_errors) VALUES (?,?,?,?,?)", ("agent0", ts(OLD), ts(OLD), 1, 0))
    conn.execute(
        "INSERT INTO baselines (agent_id, baseline_type, sample_count, created_at, "
        "updated_at) VALUES (?,?,?,?,?)", ("agent0", "embedding_centroid", 5, ts(OLD), ts(OLD)))
    conn.execute(
        "INSERT INTO dataset_cases (case_id, dataset_name, dataset_version, domain, "
        "input_query, agent_claim, expected_classification, expected_failure_type, "
        "is_failure, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("case1", "ds", "v1.0_curated", "research", "q", "a", "hallucination",
         "unsupported_claim", 1, ts(OLD)))
    conn.execute(
        "INSERT INTO experiment_runs (experiment_id, name, model_name, reasoning_strategy, "
        "dataset_version, status, created_at) VALUES (?,?,?,?,?,?,?)",
        ("exp1", "n", "m", "DIRECT", "v1.0_test", "completed", ts(OLD)))

    conn.commit()
    conn.close()


def counts(db: Path) -> dict[str, int]:
    conn = sqlite3.connect(str(db))
    tables = [
        "traces", "spans", "evaluations", "drift_records", "alerts",
        "evaluation_jobs", "agent_records", "baselines", "dataset_cases",
        "experiment_runs",
    ]
    out = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables}
    conn.close()
    return out


def rows(db: Path, sql: str, params: tuple = ()) -> list[tuple]:
    conn = sqlite3.connect(str(db))
    result = conn.execute(sql, params).fetchall()
    conn.close()
    return result


def assert_no_orphans(db: Path) -> None:
    """Foreign keys are unenforced, so this is checked rather than assumed."""
    orphan_spans = rows(db, "SELECT COUNT(*) FROM spans s LEFT JOIN traces t "
                            "ON s.trace_id=t.trace_id WHERE t.trace_id IS NULL")[0][0]
    orphan_evals = rows(db, "SELECT COUNT(*) FROM evaluations e LEFT JOIN spans s "
                            "ON e.span_id=s.span_id WHERE s.span_id IS NULL")[0][0]
    orphan_alerts = rows(db, "SELECT COUNT(*) FROM alerts a LEFT JOIN traces t "
                             "ON a.trace_id=t.trace_id WHERE a.trace_id IS NOT NULL "
                             "AND t.trace_id IS NULL")[0][0]
    orphan_drift = rows(db, "SELECT COUNT(*) FROM drift_records d LEFT JOIN spans s "
                            "ON d.span_id=s.span_id WHERE d.span_id IS NOT NULL "
                            "AND s.span_id IS NULL")[0][0]
    assert (orphan_spans, orphan_evals, orphan_alerts, orphan_drift) == (0, 0, 0, 0), (
        f"referential integrity broken: spans={orphan_spans} evaluations={orphan_evals} "
        f"alerts={orphan_alerts} drift_records={orphan_drift}"
    )


def session_factory_for(db: Path):
    """A get_session equivalent bound to a specific database file.

    Built here rather than importing app.database, whose engine binds to
    settings at import time and would point at the real database.
    """
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(f"sqlite+aiosqlite:///{db.as_posix()}")
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def factory():
        async with maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    return factory, engine


def run_retention(db: Path, *, dry_run: bool = False, batch_size: int = 500,
                  retention_days: int = RETENTION_DAYS):
    factory, engine = session_factory_for(db)

    async def go():
        try:
            return await apply_retention(
                factory, retention_days, dry_run=dry_run,
                batch_size=batch_size, now=NOW,
            )
        finally:
            await engine.dispose()

    return asyncio.run(go())


@pytest.fixture
def seeded_db(tmp_path) -> Path:
    db = tmp_path / "retention.db"
    migrate(db)
    seed(db)
    return db


class TestRetentionContract:
    def test_cutoff_is_deterministic(self):
        """A fixed reference time must give a fixed cutoff.

        If each query recomputed "now", a long purge would move its own boundary
        and could delete rows that were inside the window when it started.
        """
        assert compute_cutoff(30, NOW) == NOW - timedelta(days=30)
        assert compute_cutoff(30, NOW) == compute_cutoff(30, NOW)

        aware = datetime(2026, 8, 28, 12, 0, 0, tzinfo=timezone.utc)
        assert compute_cutoff(30, aware).tzinfo is None, \
            "cutoff must be naive UTC to compare against stored timestamps"

    def test_dry_run_deletes_nothing(self, seeded_db):
        before = counts(seeded_db)
        report = run_retention(seeded_db, dry_run=True)

        assert report.dry_run is True
        assert counts(seeded_db) == before, "dry run modified the database"
        assert report.deleted["traces"] == 1, "dry run should still report the plan"
        assert report.total > 0

    def test_old_deleted_new_retained(self, seeded_db):
        before = counts(seeded_db)
        assert before["traces"] == 2

        report = run_retention(seeded_db)
        after = counts(seeded_db)

        # The old trace and its whole dependent set are gone.
        assert [r[0] for r in rows(seeded_db, "SELECT trace_id FROM traces")] == ["trace-new"]
        assert after["spans"] == 2, "only the new trace's spans should remain"
        assert after["evaluations"] == 2
        assert after["drift_records"] == 2
        assert after["alerts"] == 1

        # Nothing newer than the cutoff was touched.
        assert all(r[0] == "trace-new" for r in
                   rows(seeded_db, "SELECT trace_id FROM spans"))
        assert report.deleted["traces"] == 1
        assert report.deleted["spans"] == 2
        assert report.deleted["evaluations"] == 2
        assert report.deleted["drift_records"] == 2
        assert report.deleted["alerts"] == 1

        assert_no_orphans(seeded_db)

    def test_exempt_entities_are_untouched(self, seeded_db):
        """Curated research artifacts and drift baselines survive.

        All four were seeded 60 days old — comfortably deletable if they were
        eligible — so their survival is the exemption working, not luck.
        """
        run_retention(seeded_db)
        after = counts(seeded_db)

        for table in EXEMPT_ENTITIES:
            assert after[table] > 0, f"exempt entity {table} was deleted"
        assert after["dataset_cases"] == 1
        assert after["baselines"] == 1
        assert after["agent_records"] == 1
        assert after["experiment_runs"] == 1

    def test_pending_jobs_are_never_deleted(self, seeded_db):
        """The dangerous case: outstanding work must survive retention.

        A queued or running job is an evaluation the durable-queue phase
        guaranteed would happen. Deleting it because its trace aged out would
        discard that work silently — worse than the unbounded growth retention
        exists to fix.
        """
        run_retention(seeded_db)

        remaining = dict(rows(seeded_db,
                              "SELECT status, COUNT(*) FROM evaluation_jobs GROUP BY status"))

        assert remaining.get("queued") == 2, "an old queued job was deleted"
        assert remaining.get("running") == 2, "an old running job was deleted"

        for status in TERMINAL_JOB_STATUSES:
            assert remaining.get(status, 0) == 1, (
                f"expected only the recent {status} job to survive, got {remaining}"
            )

    def test_repeated_execution_is_idempotent(self, seeded_db):
        """A second run must delete nothing further."""
        first = run_retention(seeded_db)
        after_first = counts(seeded_db)
        assert first.total > 0

        second = run_retention(seeded_db)
        after_second = counts(seeded_db)

        assert second.total == 0, f"second run deleted more rows: {second.deleted}"
        assert after_second == after_first
        assert_no_orphans(seeded_db)

    def test_batching_produces_the_same_result(self, tmp_path):
        """A tiny batch size must not change the outcome, only the transactions."""
        db = tmp_path / "batched.db"
        migrate(db)
        seed(db)

        report = run_retention(db, batch_size=1)

        assert report.batches >= 1
        assert [r[0] for r in rows(db, "SELECT trace_id FROM traces")] == ["trace-new"]
        assert report.deleted["traces"] == 1
        assert_no_orphans(db)

    def test_retention_disabled_deletes_nothing(self, seeded_db):
        """retention_days <= 0 is the documented off switch."""
        before = counts(seeded_db)
        report = run_retention(seeded_db, retention_days=0)
        assert report.total == 0
        assert counts(seeded_db) == before

    def test_boundary_row_just_inside_window_survives(self, tmp_path):
        """A row one minute inside the window must not be deleted.

        Guards the comparison itself: an inclusive/exclusive slip or a timezone
        error would show up here and nowhere else.
        """
        db = tmp_path / "edge.db"
        migrate(db)
        conn = sqlite3.connect(str(db))
        conn.execute(
            "INSERT INTO traces (trace_id, start_time, status, total_spans, service_name) "
            "VALUES (?,?,?,?,?)",
            ("trace-edge", EDGE_INSIDE.isoformat(sep=" "), "completed", 0, "svc"))
        conn.commit()
        conn.close()

        report = run_retention(db)
        assert report.deleted.get("traces", 0) == 0
        assert counts(db)["traces"] == 1, "a row inside the window was deleted"

    def test_plan_matches_what_apply_deletes(self, seeded_db):
        """The dry-run report must be honest about the real run.

        A plan that undercounts would let an operator approve a purge larger
        than the one they were shown.
        """
        planned = run_retention(seeded_db, dry_run=True)
        applied = run_retention(seeded_db)

        for entity in ("traces", "spans", "evaluations", "drift_records", "alerts"):
            assert planned.deleted[entity] == applied.deleted[entity], (
                f"{entity}: dry run said {planned.deleted[entity]}, "
                f"apply deleted {applied.deleted[entity]}"
            )
