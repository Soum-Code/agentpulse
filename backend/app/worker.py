"""Evaluation worker — a process that drains the durable job queue.

Runs separately from the API. That separation is the point: previously,
evaluation executed inside the API process via BackgroundTasks, so API death
was evaluation death and the two could not be scaled or restarted independently.

    python -m app.worker

The worker owns no state that matters. Everything it needs is in
`evaluation_jobs`, so killing it loses nothing: whatever it was holding returns
to `queued` once the lease expires, and any worker picks it up.

CONCURRENCY IS DELIBERATELY NOT TUNED HERE. The evaluator is CPU-bound and a
previous measurement found more threads made throughput *worse* (1 worker
~95 req/s, 4 ~63, 8 ~39) because small-model inference spends much of its time
in Python-level tokenisation rather than GIL-released compute. The executor is
therefore fixed at one thread, matching the previous in-router behaviour. Worker
concurrency gets benchmarked in a later phase, after the ONNX loading defect is
fixed -- tuning it now would measure an artificially slow evaluator.
"""

# ---- What this file is for ---------------------------------------------------
# This file is the evaluation worker. It is a program that keeps running and scores
# spans. Again and again it takes one job from the `evaluation_jobs` table, runs the
# evaluator on that span, and marks the job done or failed. It also writes a
# "heartbeat" row to the database (every 15 seconds, or sooner while it is busy), so the
# API can see that a worker is alive and which model engine it runs on.
#
# How it fits in: the API (routers/ingest.py) adds the jobs. This file takes them with
# services/job_queue.py and runs them with services/evaluation_runner.py. It builds its
# own DriftDetector, AlertEngine and EvaluationPipeline (services/). Start it with
# `python -m app.worker` (docker-compose.yml does this).
# ------------------------------------------------------------------------------

from __future__ import annotations

# argparse reads the command-line option (--lease-seconds) in main().
import argparse
# asyncio runs the worker loop. "async" code can wait (await) without blocking other work.
import asyncio
import logging
import os
# signal lets the program react to Ctrl+C (SIGINT) and to a "please stop" request (SIGTERM).
import signal
# socket is used only to get this machine's name (socket.gethostname()).
import socket
import uuid
# ThreadPoolExecutor = a group of threads that run work for you. Here it has just one.
from concurrent.futures import ThreadPoolExecutor

from datetime import datetime, timezone

# select() builds a SQL SELECT query.
from sqlmodel import select

# get_session() gives a database session that commits on success and rolls back on error.
from app.database import get_session
# WorkerHeartbeat = the table with one row per worker process (the heartbeat rows).
from app.models import WorkerHeartbeat
# job_queue = the functions that claim jobs and mark them done or failed.
from app.services import job_queue
# execute_job scores one job. MalformedJobError is raised for a job that can never work.
from app.services.evaluation_runner import MalformedJobError, execute_job

logger = logging.getLogger("agentpulse.worker")

# When the queue is empty (or the loop just had an error), the worker sleeps this long
# (0.5 seconds) before it looks again.
POLL_INTERVAL_SECONDS = 0.5
# How often (every 30 seconds) the loop returns jobs with an expired lease to the queue.
RECOVERY_INTERVAL_SECONDS = 30.0
# Well below platform_health.WORKER_STALE_AFTER_SECONDS (90s), so a worker that
# is merely busy is never mistaken for a dead one.
HEARTBEAT_INTERVAL_SECONDS = 15.0
# Minimum gap between progress heartbeats while actively working. Bounds the
# write rate so a fast queue does not turn reporting into a write per job.
PROGRESS_HEARTBEAT_MIN_INTERVAL_SECONDS = 3.0


def make_worker_id() -> str:
    """Identifies which process holds a lease. Useful when a job is stuck and
    someone has to work out which machine to look at."""
    # The id has three parts joined by ":": the machine name, the operating-system process
    # number, and 8 random hex characters. The random part means a restarted worker
    # gets a new id. This id is also the primary key of its heartbeat row.
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


# One EvaluationWorker is created by _amain(). run_forever() is the real loop. run_once()
# does a single job, which is what the tests call. Everything else is a helper for them.
class EvaluationWorker:
    """Claims jobs and runs them. Driveable one step at a time, for tests."""

    # In: the EvaluationPipeline that scores a span; an optional id (a new one is made if
    # missing); and how many seconds a claimed job is held (default: job_queue's 120).
    def __init__(self, evaluator, worker_id: str | None = None,
                 lease_seconds: int = job_queue.DEFAULT_LEASE_SECONDS):
        self.evaluator = evaluator
        self.worker_id = worker_id or make_worker_id()
        self.lease_seconds = lease_seconds
        # A pool with ONE thread. The evaluator is slow, CPU-heavy work, so execute_job
        # runs it here and the async loop stays free. The thread names start with
        # "agentpulse-eval" so they are easy to spot in logs and debuggers.
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="agentpulse-eval"
        )
        # Set to True by stop(). run_forever() checks it at the start of each round.
        self._stopping = False
        # Counted here rather than derived from the jobs table so "alive but
        # doing nothing" is distinguishable from "alive and working" even when
        # the queue is empty.
        self.jobs_processed = 0
        self.jobs_failed = 0
        # The earliest loop time (see loop.time() in run_forever) at which the next
        # progress heartbeat may be written. 0.0 means the first one is allowed at once.
        self._next_progress_beat = 0.0

    # Puts jobs whose lease has run out back in the queue, and returns how many it moved.
    # It opens its own short database session and calls the job_queue function.
    async def recover(self) -> int:
        async with get_session() as session:
            return await job_queue.recover_expired_leases(session)

    async def heartbeat(self, status: str = "running") -> None:
        """Publish liveness and backend identity so the API can see this process.

        The API cannot observe a separate process's memory, so "is an evaluator
        alive, and what is it running on?" has to be answered through the
        database. Backend identity is written here rather than read from the
        API's own `backend_info()` because the two processes load models
        independently -- taking it from the API would make a regression that
        silently reverts THIS worker to the slow PyTorch path invisible.

        Failures are logged and swallowed: monitoring must never be the reason a
        worker stops evaluating.
        """
        # In short: write (or refresh) this worker's own row in worker_heartbeats. `status`
        # is "running" normally, or "stopping" for the last heartbeat before a clean exit.
        from app.services.grounding import backend_info

        try:
            # Step 1: ask which model engine is really running now (a small dict with
            # keys such as nli_backend, embedding_backend, degraded, fallback_reason).
            backend = backend_info()
            # The current UTC time without a timezone label ("naive"), like the other
            # timestamps in the heartbeat table.
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            async with get_session() as session:
                # Step 2: look for the row that belongs to this worker. The question in
                # SQL words: the heartbeat row whose worker_id equals ours, if any.
                existing = (
                    await session.execute(
                        select(WorkerHeartbeat)
                        .where(WorkerHeartbeat.worker_id == self.worker_id)
                    )
                ).scalar_one_or_none()

                # Step 3a: first heartbeat of this process, so create the row. Here
                # started_at is set. `backend_degraded` means: ONNX was asked for but
                # the NLI model runs on PyTorch (see backend_info in grounding.py).
                if existing is None:
                    session.add(WorkerHeartbeat(
                        worker_id=self.worker_id,
                        hostname=socket.gethostname(),
                        pid=os.getpid(),
                        status=status,
                        started_at=now,
                        last_heartbeat_at=now,
                        jobs_processed=self.jobs_processed,
                        jobs_failed=self.jobs_failed,
                        nli_backend=backend.get("nli_backend"),
                        embedding_backend=backend.get("embedding_backend"),
                        backend_degraded=bool(backend.get("degraded")),
                        fallback_reason=backend.get("fallback_reason"),
                    ))
                # Step 3b: the row exists, so refresh only the fields that change (the
                # time, status, counters and backend). Host, pid and started_at stay.
                else:
                    existing.last_heartbeat_at = now
                    existing.status = status
                    existing.jobs_processed = self.jobs_processed
                    existing.jobs_failed = self.jobs_failed
                    existing.nli_backend = backend.get("nli_backend")
                    existing.embedding_backend = backend.get("embedding_backend")
                    existing.backend_degraded = bool(backend.get("degraded"))
                    existing.fallback_reason = backend.get("fallback_reason")
                # Step 4: save the new or changed row.
                await session.commit()
        # Any error here is only logged, never raised, so a failed heartbeat cannot stop
        # the worker.
        except Exception:
            logger.warning("Heartbeat failed; continuing to evaluate", exc_info=True)

    async def run_once(self) -> bool:
        """Claim and process a single job. Returns False if the queue was empty.

        Failure classification happens here rather than in the runner, because
        it is a queue policy decision, not an evaluation one: malformed payloads
        are permanent, everything else is assumed transient and retried.
        """
        # Step 1: claim the oldest job that is ready. claim_next marks it "running" and
        # gives us a lease (a deadline) of lease_seconds. It returns None if none is ready.
        async with get_session() as session:
            job = await job_queue.claim_next(
                session, worker_id=self.worker_id, lease_seconds=self.lease_seconds
            )

        # Nothing to do. The caller (run_forever) will sleep for a moment.
        if job is None:
            return False

        # Short names for two ids. They are used below by mark_failed, mark_succeeded and
        # the log lines.
        job_id, span_id = job.id, job.span_id
        logger.info("Claimed job %s (span %s, attempt %d/%d)",
                    job_id, span_id, job.attempts, job.max_attempts)

        # Step 2: score the span. execute_job parses the payload, runs the evaluator in
        # our one-thread pool, and saves the results. `written` is True if new results
        # were saved, and False if the span had already been scored (a duplicate).
        try:
            loop = asyncio.get_running_loop()
            written = await execute_job(
                self.evaluator, job.payload_json, loop, self._executor
            )
        # Step 3a: the job's data is broken. retryable=False sends the job to "failed"
        # straight away, with no further attempts.
        except MalformedJobError as exc:
            # Permanent: attempt three will fail identically.
            async with get_session() as session:
                await job_queue.mark_failed(
                    session, job_id, error=f"malformed job: {exc}", retryable=False
                )
            self.jobs_failed += 1
            logger.error("Job %s permanently failed (malformed): %s", job_id, exc)
            # True = "a job was handled", even though it failed. So no sleep follows.
            return True
        # Step 3b: any other error is treated as possibly temporary. retryable=True makes
        # mark_failed put the job back in the queue after a delay, or give it the status
        # "dead_letter" when all its attempts are used up. `status` is the new status.
        except Exception as exc:  # noqa: BLE001 - classify, do not swallow
            async with get_session() as session:
                status = await job_queue.mark_failed(
                    session, job_id, error=f"{type(exc).__name__}: {exc}", retryable=True
                )
            self.jobs_failed += 1
            logger.error("Job %s failed (%s), now %s: %s",
                         job_id, type(exc).__name__, status, exc, exc_info=True)
            return True

        # Step 4: no error, so mark the job "succeeded" and count it.
        async with get_session() as session:
            await job_queue.mark_succeeded(session, job_id)
        self.jobs_processed += 1
        logger.info("Job %s succeeded (span %s, results_written=%s)",
                    job_id, span_id, written)
        return True

    # The main loop. It runs until stop() is called. Each round does these things in
    # order: (1) now and then return expired-lease jobs to the queue, (2) now and then
    # write a heartbeat, (3) try to do one job, (4) after a job, maybe write a progress
    # heartbeat; if there was no job, sleep a little.
    async def run_forever(self) -> None:
        logger.info("Evaluation worker %s starting", self.worker_id)
        # Before the loop: take back jobs whose lease has already run out (for example, jobs
        # that a worker which died earlier was holding).
        recovered = await self.recover()
        if recovered:
            logger.warning("Startup recovery returned %d abandoned job(s)", recovered)

        # loop.time() is the event loop's clock in seconds. It only counts forward, so it
        # is safe for "do this again in N seconds" timers. The two variables below hold
        # the clock value at which the next recovery sweep and the next heartbeat are due.
        loop = asyncio.get_running_loop()
        next_recovery = loop.time() + RECOVERY_INTERVAL_SECONDS
        next_heartbeat = loop.time()  # publish immediately on startup

        while not self._stopping:
            try:
                # Periodic sweep so a worker that died mid-job does not strand
                # it until this process happens to restart.
                if loop.time() >= next_recovery:
                    await self.recover()
                    next_recovery = loop.time() + RECOVERY_INTERVAL_SECONDS

                # The regular heartbeat (see HEARTBEAT_INTERVAL_SECONDS above).
                if loop.time() >= next_heartbeat:
                    await self.heartbeat()
                    next_heartbeat = loop.time() + HEARTBEAT_INTERVAL_SECONDS

                # Try one job. True = a job was handled (it may have failed). False =
                # the queue had nothing ready.
                did_work = await self.run_once()

                if did_work:
                    # In short: after a job, write an extra heartbeat so the job counters
                    # show up soon, but at most once every 3 seconds.
                    # Publish progress sooner than the idle interval allows.
                    #
                    # Without this, `jobs_processed` only reaches the database
                    # every 15 seconds, so a worker that processes a burst and
                    # then dies reports zero work done -- observed in the
                    # self-monitoring demo, where 20 completed jobs showed as
                    # "jobs processed: 0". An operator would read that as "alive
                    # but idle" while it was in fact the busiest thing running.
                    #
                    # Rate-limited so a fast queue cannot turn progress
                    # reporting into a write per job.
                    if loop.time() >= self._next_progress_beat:
                        await self.heartbeat()
                        # This heartbeat counts as the regular one, so push that back too.
                        next_heartbeat = loop.time() + HEARTBEAT_INTERVAL_SECONDS
                        self._next_progress_beat = (
                            loop.time() + PROGRESS_HEARTBEAT_MIN_INTERVAL_SECONDS
                        )
                # No job was ready: wait a moment so we do not hammer the database.
                else:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
            # A cancelled task must stay cancelled, so this error is passed upward.
            except asyncio.CancelledError:
                raise
            # Any other error is logged and the loop carries on, after a short sleep.
            except Exception:  # noqa: BLE001 - a worker must not die on one error
                logger.exception("Worker loop error; continuing")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)

        # Mark ourselves stopped on a graceful exit. A SIGKILLed worker cannot
        # do this, which is exactly why liveness is judged by heartbeat
        # staleness rather than by any status a worker writes about itself.
        await self.heartbeat(status="stopping")
        logger.info("Evaluation worker %s stopped", self.worker_id)

    # Asks the loop to end. It only sets a flag: the job in progress is finished first,
    # and the loop stops at its next check. The signal handler in _amain calls this.
    def stop(self) -> None:
        self._stopping = True

    # Closes the thread pool. wait=False means it does not wait for running work.
    # _amain calls this after the loop has ended.
    def shutdown(self) -> None:
        self._executor.shutdown(wait=False)


# Sets everything up, then runs the worker loop until a stop signal arrives. Steps:
#   1 load the models (and refuse to start if they do not load)
#   2 build the evaluator
#   3 restore the saved drift baselines
#   4 install the stop-signal handler
#   5 run the loop
async def _amain(lease_seconds: int) -> None:
    # These imports sit inside the function, so they run only when the worker really
    # starts. (`select` is also imported at the top of this file; this repeats it.)
    from sqlmodel import select

    from app.config import settings
    from app.models import Baseline
    from app.services.alerting import AlertEngine
    from app.services.drift import DriftDetector
    from app.services.evaluator import EvaluationPipeline
    from app.services.grounding import backend_info, load_models, models_loaded

    # Set up log output. settings.log_level is an upper-case name such as "INFO". getattr
    # turns that name into logging's number for it, and falls back to INFO if it is unknown.
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Step 1: load the NLI model, its tokenizer and the embedding model. NLI = a model
    # that says whether one sentence follows from another. A tokenizer cuts text into
    # the numbered pieces ("tokens") that a model reads.
    logger.info("Loading evaluation models...")
    # sync=True, unlike the API. The API can usefully serve reads while models
    # load in the background; a worker that starts claiming jobs before its
    # models exist would evaluate them into null results and mark them
    # succeeded, which is worse than starting slowly.
    load_models(
        nli_model_name=settings.nli_model,
        embedding_model_name=settings.embedding_model,
        cache_dir=settings.model_cache_dir,
        use_onnx=settings.use_onnx,
        sync=True,
    )
    # models_loaded() returns a dict such as {"nli_model": True, ...}, one entry per part.
    # All values must be True, or the worker exits with an error message (SystemExit).
    loaded = models_loaded()
    logger.info("models_loaded(): %s", loaded)
    if not all(loaded.values()):
        # A worker that cannot evaluate should not silently claim jobs and fail
        # them one attempt at a time until they dead-letter.
        raise SystemExit(f"ABORT: models not fully loaded ({loaded}); refusing to start.")

    # The worker is where inference actually happens now, so it must say which
    # backend it is running. Degraded is not fatal -- results are identical and
    # only speed differs -- but it must not be silent.
    # "Degraded" = ONNX Runtime (a fast CPU engine) was requested but the NLI model
    # runs on PyTorch instead. This block only writes a log line. It changes nothing else.
    backend = backend_info()
    if backend["degraded"]:
        logger.warning(
            "INFERENCE BACKEND DEGRADED: %s requested but running on %s. Reason: %s. "
            "Results are unaffected; throughput is roughly halved.",
            backend["nli_backend_requested"], backend["nli_backend"],
            backend["fallback_reason"],
        )
    else:
        logger.info("Inference backend: nli=%s embedding=%s",
                    backend["nli_backend"], backend["embedding_backend"])

    # Same construction as the API's lifespan, settings included -- the worker
    # is now where evaluation actually happens, so a divergence here would mean
    # the deployed thresholds silently differ from the configured ones.
    # Step 2: build the three objects. The DriftDetector keeps each agent's "normal"
    # output pattern in memory. The AlertEngine holds the alert rules (thresholds on the
    # scores) and decides when an alert fires. The EvaluationPipeline takes the other two
    # and runs all the checks on one span (see services/evaluator.py).
    drift_detector = DriftDetector(
        window_size=settings.drift_window_size,
        drift_threshold=settings.drift_threshold,
    )
    alert_engine = AlertEngine(
        hallucination_threshold=settings.hallucination_threshold,
        drift_threshold=settings.drift_threshold,
        asi_low_threshold=settings.asi_low_threshold,
        cooldown_seconds=settings.alert_cooldown_seconds,
        max_per_hour=settings.alert_max_per_hour,
        webhook_url=settings.webhook_url,
    )
    evaluator = EvaluationPipeline(
        drift_detector=drift_detector,
        alert_engine=alert_engine,
    )

    # Restore persisted drift baselines. Previously the API did this because the
    # API evaluated; now the worker evaluates, so without this every worker
    # restart would cold-start every agent's baseline and drift would go quiet
    # exactly when the system had just been restarted.
    # Step 3: read the saved baselines from the `baselines` table and load them into the
    # detector. There are two kinds, one row per agent for each kind. The counters
    # only feed the log line at the end.
    try:
        restored = 0
        window_restored = 0
        async with get_session() as session:
            # Step 3a: the "embedding_centroid" rows (an average of the agent's output
            # embeddings). A row with no saved bytes is skipped.
            result = await session.execute(
                select(Baseline).where(Baseline.baseline_type == "embedding_centroid")
            )
            for baseline in result.scalars().all():
                if baseline.data:
                    drift_detector.load_centroid(
                        baseline.agent_id, baseline.data, baseline.sample_count
                    )
                    restored += 1

            # The centroid restore above only revives the spike metric. Without
            # the window pool as well, `window_centroid_distance` -- the metric
            # DRIFT_DETECTED actually fires on -- stays None until every agent
            # re-accumulates a full baseline, so drift alerting was still blind
            # across exactly the window this restore exists to protect.
            # Step 3b: the same for the "window_baseline_pool" rows.
            window_result = await session.execute(
                select(Baseline).where(Baseline.baseline_type == "window_baseline_pool")
            )
            for baseline in window_result.scalars().all():
                if baseline.data:
                    drift_detector.load_window_baseline(
                        baseline.agent_id, baseline.data, baseline.sample_count
                    )
                    window_restored += 1
        logger.info(
            "Restored drift baselines for %d agent(s); window pools for %d",
            restored,
            window_restored,
        )
    # Not fatal: the error is logged and the worker starts without its saved baselines.
    except Exception as exc:
        logger.error("Failed to restore drift baselines: %s", exc)

    worker = EvaluationWorker(evaluator, lease_seconds=lease_seconds)

    # Step 4: stop on Ctrl+C (SIGINT) or on a "please stop" request (SIGTERM, which a
    # container sends when it is stopped). The handler calls worker.stop(), so the loop
    # ends after the current job. (stop_event is set too, but nothing in this file waits
    # on it. The loop ends because of worker.stop().)
    stop_event = asyncio.Event()

    # In short: on Ctrl+C or a stop from Docker, ask the worker to finish its current job and exit.
    def _handle_signal(*_args) -> None:
        logger.info("Shutdown signal received; finishing current job")
        worker.stop()
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_signal)
        except (ValueError, OSError):
            pass  # not available on this platform/thread

    # Step 5: run the loop. It returns only after stop() was called. The `finally` makes
    # sure the thread pool is closed even if the loop ends with an error.
    try:
        await worker.run_forever()
    finally:
        worker.shutdown()


# The program's entry point. It reads the command line and runs _amain until it ends.
def main() -> None:
    parser = argparse.ArgumentParser(description="AgentPulse evaluation worker")
    parser.add_argument(
        "--lease-seconds", type=int, default=job_queue.DEFAULT_LEASE_SECONDS,
        help="How long a claimed job is held before being considered abandoned",
    )
    args = parser.parse_args()
    # asyncio.run starts the event loop and runs _amain on it until _amain returns.
    asyncio.run(_amain(args.lease_seconds))


# This runs when the file is started directly, as in `python -m app.worker`.
if __name__ == "__main__":
    main()
