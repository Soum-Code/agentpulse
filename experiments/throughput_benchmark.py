"""Measure sustainable evaluation throughput across worker-process counts.

Runs the SAME workload against 1, 2, 4 and 8 worker processes, under both burst
and steady load, and reports what the system actually sustains. No target is
assumed: the output is "maximum sustainable throughput under this workload and
these resources = X spans/sec", which becomes a measured capability rather than
a marketing number.

WHY THIS RUNS ONLY NOW. Until the ONNX defect was fixed, every model load
silently fell back to PyTorch, so any worker-count benchmark would have been
tuning against an accidentally degraded evaluator (~2x slower) and drawing
conclusions from it.

SCALING UNIT IS PROCESSES, NOT THREADS. Each worker's internal executor is fixed
at one thread, because a prior measurement found more threads made throughput
*worse* (1 worker ~95 req/s, 4 ~63, 8 ~39) -- small-model inference spends much
of its time in Python-level tokenisation rather than GIL-released compute. So
concurrency here means more worker processes, each with its own interpreter.

WORKLOAD DESIGN, AND WHY IT IS SHAPED THIS WAY

Traces are short (5 spans each) on purpose. The disagreement evaluator compares
each span against up to 12 prior agents *in its own trace*, so per-span cost
grows with position within a trace. One long trace would make late spans far
more expensive than early ones and the measured rate would depend on how far
through the run you looked. Short traces bound priors to at most 4 and keep
per-span work flat, which is what makes the number comparable across configs.

COLD START IS REPORTED SEPARATELY. The first ONNX load performs the model export
(~200s) and writes model.onnx into the cache; subsequent loads are seconds. That
is deployment latency, not per-span evaluation latency, and mixing the two would
make throughput look far worse than it is. This benchmark requires a warm cache
and measures warm inference; worker startup time is reported on its own.

Outputs:
- experiments/results/throughput_benchmark.json
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
RESULTS = ROOT / "experiments" / "results" / "throughput_benchmark.json"

API_KEY = "throughput-bench-key"
PORT = 8131
BASE = f"http://127.0.0.1:{PORT}"

SPANS_PER_TRACE = 5
# Worker RSS observed at ~1.2 GB (each process loads its own model copy). Refuse
# to start a configuration that would not fit rather than measure a machine that
# is swapping, which would produce a number describing the page file.
EST_WORKER_RSS_GB = 1.4
MEMORY_HEADROOM_GB = 3.0


def env_for(db: Path) -> dict[str, str]:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["PYTHONPATH"] = str(BACKEND)
    env["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    return env


def migrate(db: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env_for(db), capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"migration failed:\n{result.stderr}")


def assert_port_free() -> None:
    import socket
    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect(("127.0.0.1", PORT))
    except Exception:
        return
    finally:
        sock.close()
    raise SystemExit(f"ABORT: port {PORT} in use; a stale process would corrupt results.")


def start_api(db: Path) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
        cwd=str(BACKEND), env=env_for(db),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def start_worker(db: Path) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "app.worker"],
        cwd=str(BACKEND), env=env_for(db),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def hard_kill(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        pass


def wait_api_ready(timeout: float = 300) -> bool:
    """Ready means models loaded, not merely HTTP 200 -- see the durability
    harness for why that distinction matters."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/v1/health", timeout=3) as r:
                body = json.loads(r.read())
                models = body.get("models") or {}
                if models and all(models.values()):
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def backend_in_use() -> dict:
    try:
        with urllib.request.urlopen(f"{BASE}/v1/health", timeout=5) as r:
            return json.loads(r.read()).get("inference_backend", {})
    except Exception:
        return {}


def post(spans: list[dict]) -> int:
    body = json.dumps({"spans": spans, "sdk_version": "0.1.0",
                       "service_name": "throughput-bench"}).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/ingest", data=body, method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return -1


def make_trace(prefix: str, trace_index: int) -> list[dict]:
    """One short trace. Agents differ so disagreement has something to compare."""
    trace_id = f"{prefix}-t{trace_index:05d}"
    return [
        {
            "trace_id": trace_id,
            "span_id": f"{trace_id}-s{i}",
            "agent_id": f"agent_{i}",
            "event_type": "agent_execution",
            "span_kind": "AGENT",
            "status": "success",
            "input_summary": (
                f"Assess whether the quarterly report {trace_index} supports the "
                f"stated conclusion about regional performance."
            ),
            "output_summary": (
                f"Stage {i} review of report {trace_index}: the figures indicate a "
                f"measurable increase of {trace_index % 17 + 3} percent, corroborated "
                f"by {i + 2} independent sources in the appendix."
            ),
        }
        for i in range(SPANS_PER_TRACE)
    ]


# ─── resource sampling ────────────────────────────────────────────────


class ResourceSampler(threading.Thread):
    """Samples system CPU and per-role RSS while a load runs."""

    def __init__(self, api: subprocess.Popen, workers: list[subprocess.Popen],
                 interval: float = 0.5):
        super().__init__(daemon=True)
        self.interval = interval
        self._stop = threading.Event()
        self.cpu: list[float] = []
        self.api_rss: list[float] = []
        self.worker_rss: list[float] = []
        self._api_proc = self._safe(api.pid)
        self._worker_procs = [p for p in (self._safe(w.pid) for w in workers) if p]

    @staticmethod
    def _safe(pid: int):
        try:
            return psutil.Process(pid)
        except Exception:
            return None

    def _tree_rss(self, proc) -> float:
        """Include children: uvicorn spawns, and RSS on the parent alone
        understates a multi-process server."""
        if proc is None:
            return 0.0
        total = 0.0
        try:
            total += proc.memory_info().rss
            for child in proc.children(recursive=True):
                try:
                    total += child.memory_info().rss
                except Exception:
                    pass
        except Exception:
            pass
        return total / 1e9

    def run(self) -> None:
        psutil.cpu_percent(interval=None)  # prime
        while not self._stop.is_set():
            self.cpu.append(psutil.cpu_percent(interval=None))
            self.api_rss.append(self._tree_rss(self._api_proc))
            self.worker_rss.append(sum(self._tree_rss(p) for p in self._worker_procs))
            time.sleep(self.interval)

    def stop(self) -> dict:
        self._stop.set()
        self.join(timeout=5)

        def summarise(values: list[float]) -> dict:
            usable = [v for v in values if v is not None]
            if not usable:
                return {"mean": None, "peak": None}
            return {"mean": round(statistics.mean(usable), 2),
                    "peak": round(max(usable), 2)}

        return {
            "samples": len(self.cpu),
            "cpu_percent": summarise(self.cpu),
            "api_rss_gb": summarise(self.api_rss),
            "worker_rss_total_gb": summarise(self.worker_rss),
        }


# ─── metrics ──────────────────────────────────────────────────────────


def parse_ts(value) -> float | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except ValueError:
        return None


def collect_metrics(db: Path, prefix: str) -> dict:
    import sqlite3

    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        "SELECT status, attempts, created_at, started_at, completed_at "
        "FROM evaluation_jobs WHERE trace_id LIKE ?", (f"{prefix}-%",)
    ).fetchall()
    n_eval = conn.execute(
        "SELECT COUNT(*) FROM evaluations WHERE trace_id LIKE ?", (f"{prefix}-%",)
    ).fetchone()[0]
    n_distinct = conn.execute(
        "SELECT COUNT(DISTINCT span_id) FROM evaluations WHERE trace_id LIKE ?",
        (f"{prefix}-%",)
    ).fetchone()[0]
    conn.close()

    queue_wait, eval_time, e2e = [], [], []
    created, completed = [], []
    failed = retries = succeeded = 0

    for status, attempts, c, s, done in rows:
        if status in ("failed", "dead_letter"):
            failed += 1
        if status == "succeeded":
            succeeded += 1
        retries += max(0, (attempts or 0) - 1)

        tc, ts, td = parse_ts(c), parse_ts(s), parse_ts(done)
        if tc is not None:
            created.append(tc)
        if td is not None:
            completed.append(td)
        if tc is not None and ts is not None:
            queue_wait.append(ts - tc)
        if ts is not None and td is not None:
            eval_time.append(td - ts)
        if tc is not None and td is not None:
            e2e.append(td - tc)

    def pct(values: list[float], p: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k] * 1000, 1)  # ms

    wall = (max(completed) - min(created)) if created and completed else 0.0
    return {
        "jobs": len(rows),
        "succeeded": succeeded,
        "failed_or_dead_letter": failed,
        "retry_count": retries,
        "evaluations_written": n_eval,
        "distinct_spans_evaluated": n_distinct,
        "duplicate_evaluations": max(0, n_eval - n_distinct),
        "wall_seconds": round(wall, 2),
        "spans_per_sec": round(succeeded / wall, 2) if wall > 0 else None,
        "queue_wait_ms": {"p50": pct(queue_wait, 50), "p95": pct(queue_wait, 95)},
        "evaluation_ms": {"p50": pct(eval_time, 50), "p95": pct(eval_time, 95)},
        "end_to_end_ms": {"p50": pct(e2e, 50), "p95": pct(e2e, 95)},
    }


def queue_outstanding(db: Path, prefix: str) -> int:
    import sqlite3
    conn = sqlite3.connect(str(db))
    n = conn.execute(
        "SELECT COUNT(*) FROM evaluation_jobs WHERE trace_id LIKE ? "
        "AND status IN ('queued','running')", (f"{prefix}-%",)
    ).fetchone()[0]
    conn.close()
    return n


# ─── one configuration ────────────────────────────────────────────────


def run_config(worker_count: int, mode: str, n_traces: int, tmp: Path,
               steady_rate: float | None = None) -> dict:
    assert_port_free()
    db = tmp / f"bench_{mode}_{worker_count}_{int(time.time())}.db"
    migrate(db)

    available_gb = psutil.virtual_memory().available / 1e9
    needed = worker_count * EST_WORKER_RSS_GB + MEMORY_HEADROOM_GB
    if needed > available_gb:
        return {"skipped": True,
                "reason": f"needs ~{needed:.1f} GB, only {available_gb:.1f} GB available"}

    api = start_api(db)
    if not wait_api_ready():
        hard_kill(api)
        return {"error": "API never became ready"}
    backend = backend_in_use()

    workers: list[subprocess.Popen] = []
    worker_start = time.time()
    for _ in range(worker_count):
        workers.append(start_worker(db))

    # Warm-up: prove every worker is alive and past model loading before the
    # measured phase. Without this, the first seconds of the run would be
    # measuring model loading rather than evaluation.
    warm_prefix = "warm"
    for i in range(worker_count * 2):
        post(make_trace(warm_prefix, i))
    deadline = time.time() + 600
    while time.time() < deadline and queue_outstanding(db, warm_prefix) > 0:
        time.sleep(0.5)
    worker_ready_seconds = round(time.time() - worker_start, 1)

    prefix = "bench"
    sampler = ResourceSampler(api, workers)
    sampler.start()

    submit_start = time.time()
    statuses: list[int] = []
    if mode == "burst":
        # Everything at once: the queue is never empty, so drain rate is the
        # configuration's maximum sustainable throughput.
        for i in range(n_traces):
            statuses.append(post(make_trace(prefix, i)))
    else:
        # Paced submission at a fixed rate, identical across configurations.
        interval = SPANS_PER_TRACE / steady_rate
        for i in range(n_traces):
            target = submit_start + i * interval
            now = time.time()
            if target > now:
                time.sleep(target - now)
            statuses.append(post(make_trace(prefix, i)))
    submit_seconds = round(time.time() - submit_start, 2)

    drain_deadline = time.time() + 1800
    while time.time() < drain_deadline and queue_outstanding(db, prefix) > 0:
        time.sleep(0.5)
    drained = queue_outstanding(db, prefix) == 0

    resources = sampler.stop()
    metrics = collect_metrics(db, prefix)

    for w in workers:
        hard_kill(w)
    hard_kill(api)

    return {
        "worker_count": worker_count,
        "mode": mode,
        "spans_submitted": n_traces * SPANS_PER_TRACE,
        "submit_seconds": submit_seconds,
        "steady_rate_target": steady_rate,
        "drained": drained,
        "worker_ready_seconds": worker_ready_seconds,
        "inference_backend": backend.get("nli_backend"),
        "backend_degraded": backend.get("degraded"),
        "ingest_http_errors": sum(1 for s in statuses if s != 202),
        "resources": resources,
        **metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--traces", type=int, default=400,
                        help="traces per run; each is 5 spans")
    parser.add_argument("--workers", default="1,2,4,8")
    parser.add_argument("--modes", default="burst,steady")
    args = parser.parse_args()

    worker_counts = [int(w) for w in args.workers.split(",")]
    modes = args.modes.split(",")
    tmp = Path(os.environ.get("TEMP", "/tmp")) / "agentpulse_throughput"
    tmp.mkdir(parents=True, exist_ok=True)

    print("=" * 78)
    print("THROUGHPUT BENCHMARK — worker processes vs sustainable spans/sec")
    print("=" * 78)
    vm = psutil.virtual_memory()
    machine = {
        "physical_cores": psutil.cpu_count(logical=False),
        "logical_cores": psutil.cpu_count(logical=True),
        "ram_total_gb": round(vm.total / 1e9, 1),
        "ram_available_gb": round(vm.available / 1e9, 1),
    }
    print(f"machine: {machine}")
    print(f"workload: {args.traces} traces x {SPANS_PER_TRACE} spans = "
          f"{args.traces * SPANS_PER_TRACE} spans, identical across configs\n")

    results: list[dict] = []

    # Burst first: its 1-worker figure defines the steady rate, so every
    # configuration is then driven at the same offered load.
    steady_rate = None
    for mode in modes:
        if mode == "steady" and steady_rate is None:
            base = next((r for r in results
                         if r.get("mode") == "burst" and r.get("worker_count") == 1
                         and r.get("spans_per_sec")), None)
            if not base:
                print("skipping steady mode: no 1-worker burst baseline")
                continue
            # 1.5x what one worker sustains: enough that a single worker must
            # fall behind, so the queue-depth behaviour is informative.
            steady_rate = round(base["spans_per_sec"] * 1.5, 2)
            print(f"\nsteady offered load fixed at {steady_rate} spans/sec "
                  f"(1.5x the 1-worker burst rate)\n")

        for count in worker_counts:
            print(f"--- {mode:6s} | {count} worker(s) ---")
            entry = run_config(count, mode, args.traces, tmp, steady_rate)
            entry.setdefault("worker_count", count)
            entry.setdefault("mode", mode)
            results.append(entry)

            if entry.get("skipped"):
                print(f"    SKIPPED: {entry['reason']}\n")
                continue
            if entry.get("error"):
                print(f"    ERROR: {entry['error']}\n")
                continue
            print(f"    spans/sec {entry['spans_per_sec']}  "
                  f"e2e p50 {entry['end_to_end_ms']['p50']}ms "
                  f"p95 {entry['end_to_end_ms']['p95']}ms  "
                  f"eval p50 {entry['evaluation_ms']['p50']}ms")
            print(f"    queue wait p95 {entry['queue_wait_ms']['p95']}ms  "
                  f"cpu {entry['resources']['cpu_percent']['mean']}% "
                  f"(peak {entry['resources']['cpu_percent']['peak']}%)  "
                  f"worker RSS peak {entry['resources']['worker_rss_total_gb']['peak']}GB")
            print(f"    failed {entry['failed_or_dead_letter']}  "
                  f"retries {entry['retry_count']}  "
                  f"duplicates {entry['duplicate_evaluations']}  "
                  f"backend {entry['inference_backend']}\n")

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "machine": machine,
        "workload": {
            "traces": args.traces,
            "spans_per_trace": SPANS_PER_TRACE,
            "total_spans": args.traces * SPANS_PER_TRACE,
            "note": "short traces bound prior-agent comparisons so per-span cost "
                    "stays flat; one long trace would make late spans dominate",
        },
        "steady_rate_spans_per_sec": steady_rate,
        "results": results,
    }
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved: {RESULTS}")


if __name__ == "__main__":
    main()
