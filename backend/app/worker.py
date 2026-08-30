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

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import socket
import uuid
from concurrent.futures import ThreadPoolExecutor

from datetime import datetime, timezone

from sqlmodel import select

from app.database import get_session
from app.models import WorkerHeartbeat
from app.services import job_queue
from app.services.evaluation_runner import MalformedJobError, execute_job

logger = logging.getLogger("agentpulse.worker")

POLL_INTERVAL_SECONDS = 0.5
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
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


class EvaluationWorker:
    """Claims jobs and runs them. Driveable one step at a time, for tests."""

    def __init__(self, evaluator, worker_id: str | None = None,
                 lease_seconds: int = job_queue.DEFAULT_LEASE_SECONDS):
        self.evaluator = evaluator
        self.worker_id = worker_id or make_worker_id()
        self.lease_seconds = lease_seconds
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="agentpulse-eval"
        )
        self._stopping = False
        # Counted here rather than derived from the jobs table so "alive but
        # doing nothing" is distinguishable from "alive and working" even when
        # the queue is empty.
        self.jobs_processed = 0
        self.jobs_failed = 0
        self._next_progress_beat = 0.0

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
        from app.services.grounding import backend_info

        try:
            backend = backend_info()
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            async with get_session() as session:
                existing = (
                    await session.execute(
                        select(WorkerHeartbeat)
                        .where(WorkerHeartbeat.worker_id == self.worker_id)
                    )
                ).scalar_one_or_none()

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
                else:
                    existing.last_heartbeat_at = now
                    existing.status = status
                    existing.jobs_processed = self.jobs_processed
                    existing.jobs_failed = self.jobs_failed
                    existing.nli_backend = backend.get("nli_backend")
                    existing.embedding_backend = backend.get("embedding_backend")
                    existing.backend_degraded = bool(backend.get("degraded"))
                    existing.fallback_reason = backend.get("fallback_reason")
                await session.commit()
        except Exception:
            logger.warning("Heartbeat failed; continuing to evaluate", exc_info=True)

    async def run_once(self) -> bool:
        """Claim and process a single job. Returns False if the queue was empty.

        Failure classification happens here rather than in the runner, because
        it is a queue policy decision, not an evaluation one: malformed payloads
        are permanent, everything else is assumed transient and retried.
        """
        async with get_session() as session:
            job = await job_queue.claim_next(
                session, worker_id=self.worker_id, lease_seconds=self.lease_seconds
            )

        if job is None:
            return False

        job_id, span_id = job.id, job.span_id
        logger.info("Claimed job %s (span %s, attempt %d/%d)",
                    job_id, span_id, job.attempts, job.max_attempts)

        try:
            loop = asyncio.get_running_loop()
            written = await execute_job(
                self.evaluator, job.payload_json, loop, self._executor
            )
        except MalformedJobError as exc:
            # Permanent: attempt three will fail identically.
            async with get_session() as session:
                await job_queue.mark_failed(
                    session, job_id, error=f"malformed job: {exc}", retryable=False
                )
            self.jobs_failed += 1
            logger.error("Job %s permanently failed (malformed): %s", job_id, exc)
            return True
        except Exception as exc:  # noqa: BLE001 - classify, do not swallow
            async with get_session() as session:
                status = await job_queue.mark_failed(
                    session, job_id, error=f"{type(exc).__name__}: {exc}", retryable=True
                )
            self.jobs_failed += 1
            logger.error("Job %s failed (%s), now %s: %s",
                         job_id, type(exc).__name__, status, exc, exc_info=True)
            return True

        async with get_session() as session:
            await job_queue.mark_succeeded(session, job_id)
        self.jobs_processed += 1
        logger.info("Job %s succeeded (span %s, results_written=%s)",
                    job_id, span_id, written)
        return True

    async def run_forever(self) -> None:
        logger.info("Evaluation worker %s starting", self.worker_id)
        recovered = await self.recover()
        if recovered:
            logger.warning("Startup recovery returned %d abandoned job(s)", recovered)

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

                if loop.time() >= next_heartbeat:
                    await self.heartbeat()
                    next_heartbeat = loop.time() + HEARTBEAT_INTERVAL_SECONDS

                did_work = await self.run_once()

                if did_work:
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
                        next_heartbeat = loop.time() + HEARTBEAT_INTERVAL_SECONDS
                        self._next_progress_beat = (
                            loop.time() + PROGRESS_HEARTBEAT_MIN_INTERVAL_SECONDS
                        )
                else:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a worker must not die on one error
                logger.exception("Worker loop error; continuing")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)

        # Mark ourselves stopped on a graceful exit. A SIGKILLed worker cannot
        # do this, which is exactly why liveness is judged by heartbeat
        # staleness rather than by any status a worker writes about itself.
        await self.heartbeat(status="stopping")
        logger.info("Evaluation worker %s stopped", self.worker_id)

    def stop(self) -> None:
        self._stopping = True

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False)


async def _amain(lease_seconds: int) -> None:
    from sqlmodel import select

    from app.config import settings
    from app.models import Baseline
    from app.services.alerting import AlertEngine
    from app.services.drift import DriftDetector
    from app.services.evaluator import EvaluationPipeline
    from app.services.grounding import backend_info, load_models, models_loaded

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

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
    loaded = models_loaded()
    logger.info("models_loaded(): %s", loaded)
    if not all(loaded.values()):
        # A worker that cannot evaluate should not silently claim jobs and fail
        # them one attempt at a time until they dead-letter.
        raise SystemExit(f"ABORT: models not fully loaded ({loaded}); refusing to start.")

    # The worker is where inference actually happens now, so it must say which
    # backend it is running. Degraded is not fatal -- results are identical and
    # only speed differs -- but it must not be silent.
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
    try:
        restored = 0
        window_restored = 0
        async with get_session() as session:
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
    except Exception as exc:
        logger.error("Failed to restore drift baselines: %s", exc)

    worker = EvaluationWorker(evaluator, lease_seconds=lease_seconds)

    stop_event = asyncio.Event()

    def _handle_signal(*_args) -> None:
        logger.info("Shutdown signal received; finishing current job")
        worker.stop()
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_signal)
        except (ValueError, OSError):
            pass  # not available on this platform/thread

    try:
        await worker.run_forever()
    finally:
        worker.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser(description="AgentPulse evaluation worker")
    parser.add_argument(
        "--lease-seconds", type=int, default=job_queue.DEFAULT_LEASE_SECONDS,
        help="How long a claimed job is held before being considered abandoned",
    )
    args = parser.parse_args()
    asyncio.run(_amain(args.lease_seconds))


if __name__ == "__main__":
    main()
