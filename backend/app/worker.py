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

from app.database import get_session
from app.services import job_queue
from app.services.evaluation_runner import MalformedJobError, execute_job

logger = logging.getLogger("agentpulse.worker")

POLL_INTERVAL_SECONDS = 0.5
RECOVERY_INTERVAL_SECONDS = 30.0


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

    async def recover(self) -> int:
        async with get_session() as session:
            return await job_queue.recover_expired_leases(session)

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
            logger.error("Job %s permanently failed (malformed): %s", job_id, exc)
            return True
        except Exception as exc:  # noqa: BLE001 - classify, do not swallow
            async with get_session() as session:
                status = await job_queue.mark_failed(
                    session, job_id, error=f"{type(exc).__name__}: {exc}", retryable=True
                )
            logger.error("Job %s failed (%s), now %s: %s",
                         job_id, type(exc).__name__, status, exc, exc_info=True)
            return True

        async with get_session() as session:
            await job_queue.mark_succeeded(session, job_id)
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

        while not self._stopping:
            try:
                # Periodic sweep so a worker that died mid-job does not strand
                # it until this process happens to restart.
                if loop.time() >= next_recovery:
                    await self.recover()
                    next_recovery = loop.time() + RECOVERY_INTERVAL_SECONDS

                did_work = await self.run_once()
                if not did_work:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a worker must not die on one error
                logger.exception("Worker loop error; continuing")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)

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
    from app.services.grounding import load_models, models_loaded

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
        logger.info("Restored drift baselines for %d agent(s)", restored)
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
