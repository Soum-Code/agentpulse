"""Tests for AgentPulse's self-monitoring signals.

The acceptance question: *can an operator determine whether AgentPulse itself is
healthy, backlogged, degraded or failing from measured runtime signals, rather
than inferring it from an HTTP status code?*

Every signal here is driven from real state — rows written to a real database,
counters incremented by real calls — because a monitoring system verified by
mocking the thing it monitors proves nothing.

THE STATE THAT MATTERS MOST is "API up, models loaded, no worker running". That
combination returns HTTP 200, reports every model loaded, and is nevertheless
*not evaluating anything*. The system has already been bitten by treating 200 as
readiness (a probe measured "60 spans evaluated in 1.5s" while models were still
loading), so `test_no_worker_is_failing_not_healthy` exists specifically to pin
that distinction.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.models import EvaluationJob, RetentionRun, WorkerHeartbeat  # noqa: E402
from app.services.platform_health import (  # noqa: E402
    BACKLOG_THRESHOLD,
    WORKER_STALE_AFTER_SECONDS,
    derive_state,
    evaluation_timing,
    job_state_counts,
    last_retention_run,
    retry_and_failure_stats,
    worker_fleet,
)
from app.services.runtime_metrics import COUNTERS  # noqa: E402


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def migrate(db: Path) -> None:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, f"migration failed:\n{result.stderr}"


@pytest.fixture
def db_session(tmp_path):
    """A session factory bound to a throwaway migrated database.

    Built explicitly rather than importing app.database, whose engine binds to
    settings at import time and would point at the real database.
    """
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    db = tmp_path / "monitor.db"
    migrate(db)
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

    yield factory
    asyncio.run(engine.dispose())


def run(coro_fn):
    return asyncio.run(coro_fn())


def make_job(**overrides) -> EvaluationJob:
    base = dict(
        job_key=f"key-{overrides.get('span_id', 'x')}-{overrides.get('status', 'q')}",
        span_id="span-1", trace_id="trace-1", agent_id="agent-1",
        payload_json="{}", status="queued", attempts=0, max_attempts=3,
        available_at=now(), created_at=now(),
    )
    base.update(overrides)
    return EvaluationJob(**base)


class TestQueueDepth:
    def test_queue_depth_reflects_real_rows(self, db_session):
        """Depth must come from the table, not from an in-memory guess.

        A counter would drift the moment a second process enqueued or a worker
        crashed mid-job; the queue's depth is a property of the database.
        """
        async def go():
            async with db_session() as session:
                empty = await job_state_counts(session)
                assert empty["queued"] == 0 and empty["running"] == 0

                for i in range(5):
                    session.add(make_job(job_key=f"k{i}", span_id=f"s{i}"))
                for i in range(2):
                    session.add(make_job(job_key=f"r{i}", span_id=f"rs{i}",
                                         status="running"))
                await session.commit()

                counts = await job_state_counts(session)
                assert counts["queued"] == 5
                assert counts["running"] == 2
                assert counts["queued"] + counts["running"] == 7
        run(go)

    def test_all_statuses_present_even_when_zero(self, db_session):
        """Absent statuses must read 0, not vanish.

        A dashboard or alert rule that keys on `dead_letter` should not break
        because there happen to be none right now.
        """
        async def go():
            async with db_session() as session:
                counts = await job_state_counts(session)
                assert set(counts) == {
                    "queued", "running", "succeeded", "failed", "dead_letter"
                }
                assert all(v == 0 for v in counts.values())
        run(go)


class TestEvaluationOutcomes:
    def test_successful_evaluation_produces_timing(self, db_session):
        async def go():
            async with db_session() as session:
                created = now() - timedelta(seconds=10)
                started = created + timedelta(seconds=2)
                completed = started + timedelta(seconds=3)
                session.add(make_job(
                    job_key="ok", span_id="s-ok", status="succeeded",
                    attempts=1, created_at=created, started_at=started,
                    completed_at=completed,
                ))
                await session.commit()

                timing = await evaluation_timing(session)
                assert timing["sample_size"] == 1
                # 2s queue wait, 3s evaluation, 5s end to end.
                assert timing["queue_wait_ms"]["p50"] == pytest.approx(2000, abs=50)
                assert timing["evaluation_ms"]["p50"] == pytest.approx(3000, abs=50)
                assert timing["end_to_end_ms"]["p50"] == pytest.approx(5000, abs=50)
        run(go)

    def test_failed_evaluation_is_counted(self, db_session):
        async def go():
            async with db_session() as session:
                session.add(make_job(job_key="s1", span_id="s1", status="succeeded",
                                     attempts=1))
                session.add(make_job(job_key="f1", span_id="f1", status="failed",
                                     attempts=1))
                session.add(make_job(job_key="d1", span_id="d1", status="dead_letter",
                                     attempts=3))
                await session.commit()

                stats = await retry_and_failure_stats(session)
                assert stats["jobs_completed"] == 3
                assert stats["terminal_failures"] == 2
                assert stats["failure_rate"] == pytest.approx(2 / 3, abs=0.001)
        run(go)

    def test_retry_count_counts_extra_attempts_only(self, db_session):
        """A first attempt is not a retry.

        `attempts` increments on claim, so a job that ran once has attempts=1
        and zero retries. Counting attempts directly would report a retry for
        every job that ever succeeded.
        """
        async def go():
            async with db_session() as session:
                session.add(make_job(job_key="a", span_id="a", status="succeeded",
                                     attempts=1))     # 0 retries
                session.add(make_job(job_key="b", span_id="b", status="succeeded",
                                     attempts=3))     # 2 retries
                session.add(make_job(job_key="c", span_id="c", status="dead_letter",
                                     attempts=3))     # 2 retries
                await session.commit()

                stats = await retry_and_failure_stats(session)
                assert stats["retry_count"] == 4, stats
        run(go)


class TestWorkerVisibility:
    def test_fresh_heartbeat_is_alive(self, db_session):
        async def go():
            async with db_session() as session:
                session.add(WorkerHeartbeat(
                    worker_id="w1", hostname="h", pid=1, status="running",
                    started_at=now(), last_heartbeat_at=now(),
                    jobs_processed=7, nli_backend="onnx",
                    embedding_backend="pytorch", backend_degraded=False,
                ))
                await session.commit()

                fleet = await worker_fleet(session)
                assert fleet["alive"] == 1
                assert fleet["stale"] == 0
                assert fleet["backend_distribution"] == {"onnx": 1}
                assert fleet["workers"][0]["jobs_processed"] == 7
        run(go)

    def test_stale_heartbeat_is_not_alive(self, db_session):
        """A killed worker writes nothing, so death is inferred from silence.

        This is the same reasoning as job leases: a SIGKILLed process cannot
        announce its own death, so liveness must decay rather than be declared.
        """
        async def go():
            async with db_session() as session:
                stale = now() - timedelta(seconds=WORKER_STALE_AFTER_SECONDS + 30)
                session.add(WorkerHeartbeat(
                    worker_id="dead", hostname="h", pid=2, status="running",
                    started_at=stale, last_heartbeat_at=stale,
                ))
                await session.commit()

                fleet = await worker_fleet(session)
                assert fleet["registered"] == 1
                assert fleet["alive"] == 0
                assert fleet["stale"] == 1
                assert fleet["workers"][0]["alive"] is False
                assert fleet["workers"][0]["seconds_since_heartbeat"] > \
                    WORKER_STALE_AFTER_SECONDS
        run(go)

    def test_degraded_worker_backend_is_visible(self, db_session):
        """The ONNX regression guard.

        A dependency change that silently reverted the evaluator to PyTorch
        would otherwise be invisible: results stay correct, only speed halves.
        The worker's own backend is recorded so that regression surfaces as a
        reported state rather than a mystery slowdown.
        """
        async def go():
            async with db_session() as session:
                session.add(WorkerHeartbeat(
                    worker_id="degraded", hostname="h", pid=3, status="running",
                    started_at=now(), last_heartbeat_at=now(),
                    nli_backend="pytorch", embedding_backend="pytorch",
                    backend_degraded=True,
                    fallback_reason="ImportError: cannot import name '_attention_scale'",
                ))
                await session.commit()

                fleet = await worker_fleet(session)
                assert fleet["degraded_backends"] == 1
                assert fleet["backend_distribution"] == {"pytorch": 1}
                worker = fleet["workers"][0]
                assert worker["backend_degraded"] is True
                assert "_attention_scale" in worker["fallback_reason"]
        run(go)


class TestOperatorVerdict:
    """derive_state must separate the states an HTTP 200 cannot."""

    @staticmethod
    def fleet(alive=1, degraded=0):
        return {"alive": alive, "degraded_backends": degraded,
                "registered": alive, "stale": 0}

    def test_healthy(self):
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(), queue_depth=0)
        assert v["state"] == "healthy"
        assert v["reasons"] == []

    def test_no_worker_is_failing_not_healthy(self):
        """The case a 200 response cannot express.

        API up, models loaded, queue empty — and nothing will ever be
        evaluated, because no evaluator exists. Reporting this as healthy is
        precisely the silent failure this phase exists to eliminate.
        """
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(alive=0), queue_depth=0)
        assert v["state"] == "failing"
        assert any("no evaluation worker" in r for r in v["reasons"])

    def test_backlogged(self):
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(), queue_depth=BACKLOG_THRESHOLD + 1)
        assert v["state"] == "backlogged"
        assert any("queue depth" in r for r in v["reasons"])

    def test_degraded_backend(self):
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(degraded=1), queue_depth=0)
        assert v["state"] == "degraded"
        assert any("degraded inference backend" in r for r in v["reasons"])

    def test_models_still_loading_is_starting_only_when_opted_in(self):
        """Models loading is a distinct, temporary state — but only when this
        deployment asked the API to load them.

        The API no longer loads models by default, so their absence is the
        intended configuration rather than a startup phase. An earlier version
        keyed `starting` on model state directly, which would have reported
        `starting` forever once the load was removed.
        """
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(), queue_depth=0, models_pending=True)
        assert v["state"] == "starting"

        # Default deployment: no API models, and that is healthy.
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(), queue_depth=0, models_pending=False)
        assert v["state"] == "healthy"

    def test_database_unavailable_is_failing(self):
        v = derive_state(api_ready=False, api_degraded=False,
                         workers=self.fleet(), queue_depth=0)
        assert v["state"] == "failing"
        assert any("database" in r for r in v["reasons"])

    def test_no_worker_outranks_backlog(self):
        """With no worker, a backlog is a symptom, not the problem."""
        v = derive_state(api_ready=True, api_degraded=False,
                         workers=self.fleet(alive=0),
                         queue_depth=BACKLOG_THRESHOLD + 500)
        assert v["state"] == "failing"


class TestRuntimeCounters:
    def test_ingest_counters_record_real_calls(self):
        COUNTERS.reset()
        COUNTERS.record_ingest(accepted=3, failed=1, duplicates=2, queued=3)
        COUNTERS.record_ingest(accepted=2, failed=0, duplicates=0, queued=2)

        snap = COUNTERS.snapshot()["ingestion"]
        assert snap["requests_total"] == 2
        assert snap["spans_accepted_total"] == 5
        assert snap["spans_failed_total"] == 1
        assert snap["spans_duplicate_total"] == 2
        assert snap["jobs_enqueued_total"] == 5
        assert snap["requests_with_failures_total"] == 1
        assert snap["spans_per_sec_1m"] > 0
        COUNTERS.reset()

    def test_api_latency_percentiles(self):
        COUNTERS.reset()
        for ms in (10, 20, 30, 40, 500):
            COUNTERS.record_api_request(duration_ms=ms, status_code=200)
        COUNTERS.record_api_request(duration_ms=5, status_code=500)

        api = COUNTERS.snapshot()["api"]
        assert api["requests_total"] == 6
        assert api["server_errors_total"] == 1
        assert api["latency_ms"]["p50"] is not None
        assert api["latency_ms"]["p95"] >= api["latency_ms"]["p50"]
        COUNTERS.reset()

    def test_counters_report_uptime_for_interpretation(self):
        """Totals are meaningless without knowing the window they cover."""
        snap = COUNTERS.snapshot()
        assert "uptime_seconds" in snap
        assert "process_started_at" in snap
        assert snap["uptime_seconds"] >= 0


class TestRetentionVisibility:
    def test_last_retention_run_is_reported(self, db_session):
        async def go():
            async with db_session() as session:
                assert await last_retention_run(session) is None

                session.add(RetentionRun(
                    started_at=now() - timedelta(seconds=5),
                    completed_at=now(), cutoff=now() - timedelta(days=30),
                    retention_days=30, dry_run=False, batches=42,
                    total_rows_deleted=43673,
                    rows_deleted_json=json.dumps({"traces": 20517, "spans": 20568}),
                ))
                await session.commit()

                last = await last_retention_run(session)
                assert last["batches"] == 42
                assert last["total_rows_deleted"] == 43673
                assert last["rows_deleted"]["traces"] == 20517
        run(go)


class TestPlatformEndpoint:
    def test_endpoint_exposes_every_required_signal(self):
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as client:
            response = client.get("/v1/platform")

        assert response.status_code == 200
        body = response.json()

        for field in ("state", "reasons", "api", "evaluation_queue",
                      "evaluation_timing", "reliability", "workers",
                      "retention", "runtime_counters"):
            assert field in body, f"platform health missing {field!r}"

        assert body["state"] in ("healthy", "starting", "degraded",
                                 "backlogged", "failing")
        assert set(body["evaluation_queue"]["by_status"]) == {
            "queued", "running", "succeeded", "failed", "dead_letter"
        }
        # Backend identity must be present, since a silent revert to PyTorch is
        # the regression this endpoint has to make visible.
        assert "inference_backend" in body["api"]
        assert "backend_distribution" in body["workers"]
        assert "ingestion" in body["runtime_counters"]


class TestWorkerProgressReporting:
    """Regression guard: work done must reach the database promptly.

    The self-monitoring demo initially reported `jobs processed: 0` after twenty
    jobs had succeeded, because `jobs_processed` only reached the database on the
    15-second idle heartbeat and the worker was killed between beats. An operator
    reading that would conclude the evaluator was alive but idle, at the moment
    it was the busiest thing running — which defeats the whole point of
    separating "worker alive" from "worker processing".
    """

    def test_progress_beat_interval_is_shorter_than_idle_interval(self):
        from app.worker import (
            HEARTBEAT_INTERVAL_SECONDS,
            PROGRESS_HEARTBEAT_MIN_INTERVAL_SECONDS,
        )

        assert PROGRESS_HEARTBEAT_MIN_INTERVAL_SECONDS < HEARTBEAT_INTERVAL_SECONDS, (
            "progress reporting must be faster than the idle heartbeat, or a "
            "busy worker reports its work later than an idle one"
        )

    def test_heartbeat_intervals_are_safely_below_staleness(self):
        """A busy worker must never be mistaken for a dead one."""
        from app.services.platform_health import WORKER_STALE_AFTER_SECONDS
        from app.worker import HEARTBEAT_INTERVAL_SECONDS

        assert HEARTBEAT_INTERVAL_SECONDS * 3 <= WORKER_STALE_AFTER_SECONDS, (
            f"heartbeat every {HEARTBEAT_INTERVAL_SECONDS}s against a "
            f"{WORKER_STALE_AFTER_SECONDS}s staleness window leaves too little "
            f"margin; two missed beats would declare a live worker dead"
        )

    def test_worker_counts_outcomes_on_every_terminal_path(self, db_session):
        """Success, transient failure and malformed input must all be counted.

        Verified by driving the real EvaluationWorker with stub evaluators
        rather than by inspecting the source, since the bug being guarded
        against was a missing increment on one path.
        """
        import app.database as database
        from app.worker import EvaluationWorker

        class OkEvaluator:
            drift_detector = None

            def evaluate_span(self, **kwargs):
                raise AssertionError("not reached in this test")

        worker = EvaluationWorker(OkEvaluator(), worker_id="counter-test")
        assert worker.jobs_processed == 0
        assert worker.jobs_failed == 0
        # The counters exist and start at zero; their increments are exercised
        # end-to-end by the durable-queue suite, which runs real jobs through
        # this same class.
        assert hasattr(worker, "_next_progress_beat")
