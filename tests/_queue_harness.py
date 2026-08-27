"""Subprocess harness for durable-queue tests. Not a test module itself.

Durability cannot be tested in-process. A worker that is killed must be a real
operating-system process, because the failure being tested is exactly the one
where no Python cleanup runs -- no `finally`, no atexit, no graceful shutdown.
An in-process "simulated crash" would test the simulation, not the system.

This exposes the queue and worker as CLI subcommands so tests can spawn real
processes against a throwaway database and then assert on the rows directly.

The evaluator here is a stub with controllable timing and failure. That is
deliberate: these tests are about job durability, not about evaluation quality,
and loading real NLI models would make every case take a minute and make the
kill timing unreliable. The stub is passed to the real EvaluationWorker, so the
claim/lease/retry/recovery code under test is production code.

Subcommands:
    enqueue <db> <span_id> [--payload malformed|missing-span|valid]
    work <db> [--sleep S] [--fail-mode none|always] [--lease S] [--max-jobs N]
    recover <db>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))


class StubDrift:
    def touched_agent_ids(self, agent_ids):
        return set()

    def serialize_centroid(self, agent_id):
        return None

    def get_baseline_info(self, agent_id):
        return {"sample_count": 0}


class StubGrounding:
    grounding_score = 0.25
    entailment_prob = 0.7
    contradiction_prob = 0.1
    neutral_prob = 0.2
    evaluation_stage = "stage2"


class StubResult:
    def __init__(self):
        self.grounding = StubGrounding()
        self.tool_claim = None
        self.disagreement = None
        self.drift = None
        self.alerts = []
        self.overall_risk_score = 0.25
        self.risk_label = "low_risk"
        self.evaluator_name = "stub"
        self.model_name = "stub-model"
        self.model_version = "v0"
        self.config_version = "v0"
        self.threshold_version = "v0"


class StubEvaluator:
    """Controllable stand-in. `sleep` widens the window for a kill to land
    mid-job; `fail_mode` exercises the retry and dead-letter paths."""

    def __init__(self, sleep: float = 0.0, fail_mode: str = "none"):
        self.sleep = sleep
        self.fail_mode = fail_mode
        self.drift_detector = StubDrift()

    def evaluate_span(self, **kwargs):
        # Announce that real work has begun, so a test can time its kill
        # against actual progress rather than against a guessed delay.
        marker = os.environ.get("AGENTPULSE_TEST_PROGRESS_FILE")
        if marker:
            Path(marker).write_text(str(time.time()), encoding="utf-8")
        if self.sleep:
            time.sleep(self.sleep)
        if self.fail_mode == "always":
            raise RuntimeError("stub evaluator failure (deliberate)")
        return StubResult()


def _configure_db(db: str) -> None:
    """Must happen before app.database is imported: the engine binds at import."""
    os.environ["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(db).as_posix()}"


PAYLOADS = {
    "valid": lambda span_id: {
        "span_id": span_id,
        "trace_id": "harness-trace",
        "agent_id": "harness-agent",
        "input_summary": "Summarise the quarterly findings.",
        "output_summary": "The quarterly findings show a measured increase.",
        "status": "success",
    },
    "missing-span": lambda span_id: {
        "trace_id": "harness-trace",
        "agent_id": "harness-agent",
    },
}


async def cmd_enqueue(db: str, span_id: str, payload_kind: str) -> None:
    _configure_db(db)
    from app.database import get_session
    from app.models import EvaluationJob
    from app.services.job_queue import enqueue_job, job_key_for
    import json as _json

    if payload_kind == "malformed":
        # Not JSON at all -- exercises parse failure rather than field validation.
        async with get_session() as session:
            session.add(EvaluationJob(
                job_key=job_key_for("harness-trace", span_id),
                span_id=span_id, trace_id="harness-trace", agent_id="harness-agent",
                payload_json="{this is not json",
            ))
            await session.commit()
        print("enqueued malformed")
        return

    payload = PAYLOADS[payload_kind](span_id)
    async with get_session() as session:
        created = await enqueue_job(
            session,
            trace_id=payload.get("trace_id", "harness-trace"),
            span_id=span_id,
            agent_id=payload.get("agent_id", "harness-agent"),
            payload=payload,
        )
        await session.commit()
    print("created" if created else "duplicate")


async def cmd_work(db: str, sleep: float, fail_mode: str,
                   lease: int, max_jobs: int) -> None:
    _configure_db(db)
    from app.worker import EvaluationWorker

    worker = EvaluationWorker(
        StubEvaluator(sleep=sleep, fail_mode=fail_mode),
        worker_id=f"harness:{os.getpid()}",
        lease_seconds=lease,
    )
    await worker.recover()

    processed = 0
    idle_polls = 0
    while processed < max_jobs and idle_polls < 20:
        did = await worker.run_once()
        if did:
            processed += 1
            idle_polls = 0
        else:
            idle_polls += 1
            await asyncio.sleep(0.1)
    worker.shutdown()
    print(f"processed={processed}")


async def cmd_recover(db: str) -> None:
    _configure_db(db)
    from app.database import get_session
    from app.services.job_queue import recover_expired_leases

    async with get_session() as session:
        n = await recover_expired_leases(session)
    print(f"recovered={n}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_enq = sub.add_parser("enqueue")
    p_enq.add_argument("db")
    p_enq.add_argument("span_id")
    p_enq.add_argument("--payload", default="valid",
                       choices=["valid", "malformed", "missing-span"])

    p_work = sub.add_parser("work")
    p_work.add_argument("db")
    p_work.add_argument("--sleep", type=float, default=0.0)
    p_work.add_argument("--fail-mode", default="none", choices=["none", "always"])
    p_work.add_argument("--lease", type=int, default=120)
    p_work.add_argument("--max-jobs", type=int, default=1)

    p_rec = sub.add_parser("recover")
    p_rec.add_argument("db")

    args = parser.parse_args()

    if args.cmd == "enqueue":
        asyncio.run(cmd_enqueue(args.db, args.span_id, args.payload))
    elif args.cmd == "work":
        asyncio.run(cmd_work(args.db, args.sleep, args.fail_mode,
                             args.lease, args.max_jobs))
    elif args.cmd == "recover":
        asyncio.run(cmd_recover(args.db))


if __name__ == "__main__":
    main()
