"""Durability tests for the evaluation job queue.

The headline case is `test_worker_killed_mid_evaluation_recovers_exactly_once`:
a real worker process is SIGKILLed while it holds a claimed job, and the job
must be recoverable and produce exactly one evaluation.

WHY SUBPROCESSES. Every test that involves a crash spawns a real process and
kills it with taskkill /F (SIGKILL equivalent). Simulating a crash in-process
would let Python run cleanup that a real crash never runs, so the test would
verify the simulation rather than the system. Assertions read the database
directly with sqlite3, so they observe committed state rather than ORM caches.

Timing is anchored to observed progress, not to sleeps: the stub evaluator
writes a progress marker when it actually begins work, and the kill waits for
that file. A fixed sleep would make these tests flaky on a loaded machine, and
a flaky durability test is worse than none because it teaches you to ignore it.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
HARNESS = Path(__file__).resolve().parent / "_queue_harness.py"


# ─── helpers ──────────────────────────────────────────────────────────


def make_db(tmp_path: Path) -> Path:
    """A migrated, empty database. Schema comes from alembic, never create_all."""
    db = tmp_path / "queue.db"
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, f"migration failed:\n{result.stderr}"
    return db


def harness(*args: str, env_extra: dict | None = None,
            timeout: float = 120) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(BACKEND)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, str(HARNESS), *args],
        cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=timeout,
    )


def spawn_harness(*args: str, env_extra: dict | None = None) -> subprocess.Popen:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(BACKEND)
    if env_extra:
        env.update(env_extra)
    return subprocess.Popen(
        [sys.executable, str(HARNESS), *args],
        cwd=str(ROOT), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )


def hard_kill(proc: subprocess.Popen) -> None:
    """SIGKILL equivalent -- no Python cleanup runs, which is the point."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
    else:
        proc.kill()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        pass


def jobs(db: Path) -> list[dict]:
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM evaluation_jobs")]
    conn.close()
    return rows


def count(db: Path, table: str, where: str = "", params: tuple = ()) -> int:
    conn = sqlite3.connect(str(db))
    sql = f"SELECT COUNT(*) FROM {table}" + (f" WHERE {where}" if where else "")
    n = conn.execute(sql, params).fetchone()[0]
    conn.close()
    return n


def fast_forward_availability(db: Path) -> int:
    """Make backed-off jobs immediately claimable, without sleeping.

    Returns how many rows were actually in the future -- so a caller can assert
    that backoff really deferred the job rather than silently doing nothing.
    """
    conn = sqlite3.connect(str(db))
    pending = conn.execute(
        "SELECT COUNT(*) FROM evaluation_jobs "
        "WHERE status='queued' AND available_at > datetime('now')"
    ).fetchone()[0]
    conn.execute(
        "UPDATE evaluation_jobs SET available_at = datetime('now', '-1 hour') "
        "WHERE status='queued'"
    )
    conn.commit()
    conn.close()
    return pending


def wait_for(predicate, timeout: float = 30, interval: float = 0.1) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


# ─── the headline acceptance test ─────────────────────────────────────


class TestCrashRecovery:
    def test_worker_killed_mid_evaluation_recovers_exactly_once(self, tmp_path):
        """SIGKILL a worker holding a job; the job must survive and run once.

        This is the property the whole phase exists to provide. Before the
        durable queue, a kill in this window lost the work permanently and left
        no record it had been owed -- measured at 36 of 40 evaluations lost.
        """
        db = make_db(tmp_path)
        progress = tmp_path / "progress.marker"

        assert "created" in harness("enqueue", str(db), "span-crash-1").stdout

        # Long sleep so the kill lands squarely inside evaluation. Short lease
        # so recovery is observable without waiting two minutes.
        worker = spawn_harness(
            "work", str(db), "--sleep", "30", "--lease", "3", "--max-jobs", "1",
            env_extra={"AGENTPULSE_TEST_PROGRESS_FILE": str(progress)},
        )
        try:
            # Wait for evidence the job is genuinely in flight, not a guess.
            assert wait_for(lambda: progress.exists(), timeout=60), \
                "worker never began evaluating"
            running = [j for j in jobs(db) if j["status"] == "running"]
            assert len(running) == 1, f"expected one running job, got {jobs(db)}"
            assert running[0]["attempts"] == 1
            assert running[0]["lease_expires_at"] is not None
        finally:
            hard_kill(worker)

        # The job is still there, still marked running, still owned by a worker
        # that no longer exists. Nothing was lost.
        after_kill = jobs(db)
        assert len(after_kill) == 1
        assert after_kill[0]["status"] == "running", \
            "job vanished or changed state when its worker died"
        assert count(db, "evaluations") == 0, "no evaluation should exist yet"

        # Lease expiry is what makes the job reclaimable; a dead worker cannot
        # report its own death.
        time.sleep(3.5)
        assert "recovered=1" in harness("recover", str(db)).stdout

        requeued = jobs(db)[0]
        assert requeued["status"] == "queued"
        assert requeued["attempts"] == 1, \
            "the failed attempt must still count, or a worker-killing job retries forever"

        # A fresh worker completes it.
        result = harness("work", str(db), "--max-jobs", "1", timeout=120)
        assert "processed=1" in result.stdout, result.stderr

        final = jobs(db)[0]
        assert final["status"] == "succeeded"
        assert count(db, "evaluations", "span_id = ?", ("span-crash-1",)) == 1, \
            "exactly one evaluation must exist -- not zero (lost), not two (duplicated)"

    def test_recovery_is_idempotent_when_results_already_written(self, tmp_path):
        """A worker killed AFTER writing results but BEFORE marking success.

        The nastiest ordering: the evaluation happened, so re-running it would
        duplicate the result. The idempotency guard in the runner is what makes
        the redelivery safe, and this proves it rather than assuming it.
        """
        db = make_db(tmp_path)
        assert "created" in harness("enqueue", str(db), "span-dup-1").stdout

        # Run it to completion once.
        assert "processed=1" in harness("work", str(db), "--max-jobs", "1").stdout
        assert count(db, "evaluations", "span_id = ?", ("span-dup-1",)) == 1

        # Simulate the lost acknowledgement: put the job back as if the worker
        # died between persisting results and recording success.
        conn = sqlite3.connect(str(db))
        conn.execute(
            "UPDATE evaluation_jobs SET status='queued', completed_at=NULL "
            "WHERE span_id='span-dup-1'"
        )
        conn.commit()
        conn.close()

        assert "processed=1" in harness("work", str(db), "--max-jobs", "1").stdout
        assert count(db, "evaluations", "span_id = ?", ("span-dup-1",)) == 1, \
            "redelivery wrote a second evaluation -- at-least-once became at-least-twice"


# ─── the rest of the acceptance list ──────────────────────────────────


class TestIdempotency:
    def test_duplicate_enqueue_creates_one_job(self, tmp_path):
        db = make_db(tmp_path)
        first = harness("enqueue", str(db), "span-idem-1")
        second = harness("enqueue", str(db), "span-idem-1")
        third = harness("enqueue", str(db), "span-idem-1")

        assert "created" in first.stdout
        assert "duplicate" in second.stdout
        assert "duplicate" in third.stdout
        assert count(db, "evaluation_jobs") == 1

    def test_job_key_is_deterministic(self, tmp_path):
        sys.path.insert(0, str(BACKEND))
        from app.services.job_queue import job_key_for

        assert job_key_for("t1", "s1") == job_key_for("t1", "s1")
        assert job_key_for("t1", "s1") != job_key_for("t1", "s2")
        assert job_key_for("t1", "s1") != job_key_for("t2", "s1")


class TestFailureHandling:
    def test_failing_evaluation_retries_then_dead_letters(self, tmp_path):
        """Retry exhaustion. Attempts are consumed, then the job stops.

        Backoff is verified to have been *scheduled* (available_at moves into
        the future) and is then fast-forwarded, rather than slept through. An
        earlier version waited out the real delay and failed intermittently on
        wall-clock margin -- and a durability test that fails at random is one
        people learn to ignore. The backoff arithmetic itself is covered
        separately by test_backoff_grows_and_is_capped.
        """
        db = make_db(tmp_path)
        harness("enqueue", str(db), "span-fail-1")

        for expected_attempt in (1, 2, 3):
            result = harness("work", str(db), "--fail-mode", "always", "--max-jobs", "1")
            assert "processed=1" in result.stdout, (
                f"attempt {expected_attempt} was never claimed:\n{result.stdout}"
            )
            job = jobs(db)[0]
            assert job["attempts"] == expected_attempt, job

            if expected_attempt < 3:
                assert job["status"] == "queued", "should be scheduled for retry"
                assert job["available_at"] is not None
                assert fast_forward_availability(db) == 1, \
                    "retry was not deferred -- backoff did not schedule it forward"
            else:
                assert job["status"] == "dead_letter", \
                    "retries exhausted but job is not dead-lettered"

        assert "stub evaluator failure" in (jobs(db)[0]["last_error"] or "")
        assert count(db, "evaluations") == 0

    def test_malformed_job_fails_permanently_without_retrying(self, tmp_path):
        """A payload that cannot be parsed is still unparseable on attempt three.

        Retrying it would occupy a worker and delay real work, so it goes
        straight to `failed` -- distinct from `dead_letter`, which means
        something looked transient and kept failing.
        """
        db = make_db(tmp_path)
        assert "enqueued malformed" in harness(
            "enqueue", str(db), "span-bad-1", "--payload", "malformed").stdout

        harness("work", str(db), "--max-jobs", "1")
        job = jobs(db)[0]
        assert job["status"] == "failed", f"expected permanent failure, got {job}"
        assert job["attempts"] == 1, "a permanent failure must not burn retries"
        assert "malformed" in (job["last_error"] or "").lower()

    def test_payload_missing_required_field_is_permanent(self, tmp_path):
        db = make_db(tmp_path)
        harness("enqueue", str(db), "span-bad-2", "--payload", "missing-span")

        harness("work", str(db), "--max-jobs", "1")
        job = jobs(db)[0]
        assert job["status"] == "failed"
        assert "span_id" in (job["last_error"] or "")


class TestWorkerLifecycle:
    def test_worker_restart_picks_up_pending_work(self, tmp_path):
        """Queued jobs are worked by whichever process happens to be alive."""
        db = make_db(tmp_path)
        for i in range(3):
            harness("enqueue", str(db), f"span-restart-{i}")
        assert count(db, "evaluation_jobs", "status = 'queued'") == 3

        # First "worker lifetime" handles one job, then exits.
        assert "processed=1" in harness("work", str(db), "--max-jobs", "1").stdout
        assert count(db, "evaluation_jobs", "status = 'succeeded'") == 1

        # A completely separate process drains the rest.
        assert "processed=2" in harness("work", str(db), "--max-jobs", "2").stdout
        assert count(db, "evaluation_jobs", "status = 'succeeded'") == 3
        assert count(db, "evaluations") == 3

    def test_queue_survives_with_no_worker_running(self, tmp_path):
        """Jobs enqueued with nothing consuming them simply wait.

        This is the API-restart case: the API can accept work, be restarted,
        and the work is still there afterwards because it lives in the database
        rather than in any process's memory.
        """
        db = make_db(tmp_path)
        for i in range(4):
            harness("enqueue", str(db), f"span-nowork-{i}")

        assert count(db, "evaluation_jobs", "status = 'queued'") == 4
        assert count(db, "evaluations") == 0

        # Time passes, processes come and go, nothing is consuming the queue.
        time.sleep(1)
        assert count(db, "evaluation_jobs", "status = 'queued'") == 4

        assert "processed=4" in harness("work", str(db), "--max-jobs", "4").stdout
        assert count(db, "evaluations") == 4


class TestWorkerEntryPoint:
    def test_worker_module_starts_and_loads_models(self, tmp_path):
        """`python -m app.worker` must actually start.

        Regression guard for a real bug: `_amain` imported a class name that
        does not exist (`Evaluator` instead of `EvaluationPipeline`), so the
        worker died instantly on launch. Nothing caught it, because every other
        test drives EvaluationWorker directly with a stub and never exercises
        the process entry point. This starts the real module and waits for it to
        report that it is running.

        Slow (~20s) because it loads the real models -- which is the point; a
        worker that cannot construct its evaluator is useless however fast the
        rest of the queue is.
        """
        db = make_db(tmp_path)
        env = dict(os.environ)
        env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"

        proc = subprocess.Popen(
            [sys.executable, "-m", "app.worker", "--lease-seconds", "10"],
            cwd=str(BACKEND), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        try:
            deadline = time.time() + 180
            saw_start = False
            while time.time() < deadline and proc.poll() is None:
                line = proc.stdout.readline()
                if not line:
                    continue
                if "Evaluation worker" in line and "starting" in line:
                    saw_start = True
                    break
            assert saw_start, (
                "worker never reported startup; it likely crashed on import or "
                "while constructing the evaluator"
            )
        finally:
            hard_kill(proc)


class TestLeaseSemantics:
    def test_unexpired_lease_is_not_reclaimed(self, tmp_path):
        """Recovery must not steal a job from a worker that is merely slow.

        The guard against turning crash recovery into duplicate execution.
        """
        db = make_db(tmp_path)
        progress = tmp_path / "progress2.marker"
        harness("enqueue", str(db), "span-lease-1")

        worker = spawn_harness(
            "work", str(db), "--sleep", "20", "--lease", "600", "--max-jobs", "1",
            env_extra={"AGENTPULSE_TEST_PROGRESS_FILE": str(progress)},
        )
        try:
            assert wait_for(lambda: progress.exists(), timeout=60)
            result = harness("recover", str(db))
            assert "recovered=0" in result.stdout, \
                "a live worker's job was reclaimed while its lease was still valid"
            assert jobs(db)[0]["status"] == "running"
        finally:
            hard_kill(worker)

    def test_backoff_grows_and_is_capped(self, tmp_path):
        sys.path.insert(0, str(BACKEND))
        from app.services.job_queue import BACKOFF_MAX_SECONDS, compute_backoff_seconds

        assert compute_backoff_seconds(0) == 0
        delays = [compute_backoff_seconds(n) for n in range(1, 8)]
        assert delays == sorted(delays), "backoff must be non-decreasing"
        assert delays[0] < delays[3], "backoff must actually grow"
        assert compute_backoff_seconds(100) == BACKOFF_MAX_SECONDS, "must be capped"
