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

# ---- What this file is for ---------------------------------------------------
# A benchmark that you run by hand (it can take a long time). It measures how many spans per
# second the evaluation side of AgentPulse can score with 1, 2, 4 and 8 worker processes.
# For each setting it starts its own API and its own workers on a fresh temporary SQLite
# database, sends the same made-up traces to POST /v1/ingest, waits until the job queue is
# empty, and then reads the timings from the database. It does this for two kinds of load:
# "burst" (send everything as fast as possible) and "steady" (send at a fixed rate). The
# result is one JSON file.
#
# How it fits in: it imports nothing from the backend. It starts the real API
# (uvicorn app.main:app) and the real worker (python -m app.worker) as separate processes,
# and applies the alembic migrations in backend/. It stops processes with the Windows command
# taskkill, so as written it works on Windows only.
# ------------------------------------------------------------------------------

from __future__ import annotations

import argparse
import json
import os
import statistics
# subprocess starts and stops the API and worker processes.
import subprocess
import sys
# threading is used for the background thread that samples CPU and memory.
import threading
import time
# urllib.request / urllib.error make the HTTP calls (no extra library is needed).
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# psutil reads the memory and CPU use of this computer and of other processes.
import psutil

# ROOT = the repo root. BACKEND = the backend folder (the API and worker run from there).
# RESULTS = the JSON file this script writes.
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
RESULTS = ROOT / "experiments" / "results" / "throughput_benchmark.json"

# A made-up API key, given both to the API (as its key) and to every request. PORT is the
# local port of the benchmark's own API, and BASE is its address.
API_KEY = "throughput-bench-key"
PORT = 8131
BASE = f"http://127.0.0.1:{PORT}"

# Every trace sent has this many spans (see "WORKLOAD DESIGN" above).
SPANS_PER_TRACE = 5
# In short: EST_WORKER_RSS_GB is the RAM (GB) one worker is assumed to hold (its RSS).
# MEMORY_HEADROOM_GB is an extra margin of free RAM on top of that. run_config() skips a
# setting when workers x 1.4 + 3.0 GB is more than the free memory.
# Worker RSS observed at ~1.2 GB (each process loads its own model copy). Refuse
# to start a configuration that would not fit rather than measure a machine that
# is swapping, which would produce a number describing the page file.
EST_WORKER_RSS_GB = 1.4
MEMORY_HEADROOM_GB = 3.0


# Environment variables for the API and worker processes: a copy of this process's own
# environment plus these settings. database URL = the SQLite file `db` (aiosqlite is the
# async driver); the API key; local dev mode on; PYTHONPATH so that the `app` package can
# be imported; and a switch that hides a Hugging Face warning about symlinks.
def env_for(db: Path) -> dict[str, str]:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["PYTHONPATH"] = str(BACKEND)
    env["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    return env


# Create the tables in the new database file by running `alembic upgrade head` (alembic is a
# tool that applies database schema changes). Stops the whole benchmark, showing the error
# text, if it fails.
def migrate(db: Path) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env_for(db), capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"migration failed:\n{result.stderr}")


# Stop the benchmark if something already listens on PORT. An old API process would answer
# the requests instead of the new one and spoil the numbers. The test: try to connect. If
# the connection fails, nobody listens, so return (the socket is closed either way). If it
# works, something is there, and SystemExit is raised.
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


# Start the API as a child process: uvicorn (the web server) running app.main:app on
# 127.0.0.1:PORT, started from the backend folder. Its output is thrown away (DEVNULL).
# Returns at once, without waiting for the API to be ready.
def start_api(db: Path) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
        cwd=str(BACKEND), env=env_for(db),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# Start one evaluation worker (`python -m app.worker`) as a child process on the same
# database. Each worker loads its own copy of the models. Returns at once.
def start_worker(db: Path) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "app.worker"],
        cwd=str(BACKEND), env=env_for(db),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# Stop a process and all of its child processes. Does nothing if it has already ended.
# Otherwise it runs the Windows-only command taskkill (/F = force, /T = also the children),
# then waits up to 20 seconds for the process to exit. If it has not exited by then, the
# code just carries on.
def hard_kill(proc: subprocess.Popen) -> None:
    # poll() is None while the process is still running.
    if proc.poll() is not None:
        return
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        pass


# Ask GET /v1/health every 0.5 seconds until the API says it can serve requests. Gives up
# after `timeout` seconds (default 300). Returns True when ready, False on timeout. The
# docstring below describes the older rule; the code now waits for readiness.api.ready
# (the database answers). The "models all loaded" test is only a fallback.
def wait_api_ready(timeout: float = 300) -> bool:
    """Ready means models loaded, not merely HTTP 200 -- see the durability
    harness for why that distinction matters."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/v1/health", timeout=3) as r:
                body = json.loads(r.read())
                # The API no longer loads models (it performs no inference), so
                # `models` is all false by design and is the wrong readiness
                # signal. What this needs is "can the API serve requests".
                # Worker readiness is waited for separately by
                # wait_for_job_activity.
                api_ready = (body.get("readiness") or {}).get("api") or {}
                if api_ready.get("ready"):
                    return True
                # Fall back for older API revisions without the readiness block.
                models = body.get("models") or {}
                if models and all(models.values()):
                    return True
        # The API is still starting (connection refused, no valid JSON yet): ignore the
        # error, wait, and ask again.
        except Exception:
            pass
        time.sleep(0.5)
    return False


# Read the "inference_backend" block (which engine runs the NLI model, and whether it fell
# back to a slower one) from the API's /v1/health. Returns {} if the call fails. Note: this
# asks the API process, and the API loads no models unless api_load_models is on, so the
# values are normally None and False here. The workers' own backend is not read.
def backend_in_use() -> dict:
    try:
        with urllib.request.urlopen(f"{BASE}/v1/health", timeout=5) as r:
            return json.loads(r.read()).get("inference_backend", {})
    except Exception:
        return {}


# Send one batch of spans to POST /v1/ingest with the API key in the X-API-Key header.
# Returns the HTTP status (202 = accepted), the error's status if the server answered with
# an error, or -1 for any other failure (for example no answer within 60 seconds).
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
    # The trace id looks like "bench-t00007". The prefix lets collect_metrics() find the
    # rows of one run later (warm-up traces use another prefix).
    trace_id = f"{prefix}-t{trace_index:05d}"
    # Build SPANS_PER_TRACE spans. Span i is from agent_i. The texts are one template with
    # the trace number and the span position filled in, so all spans are alike in size.
    # The "percent" in the output changes from trace to trace (3 to 19).
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


# A background thread. Every `interval` seconds (0.5 by default) it notes the CPU use of the
# whole computer and the memory use of the API and of all workers together. RSS = the
# memory a process holds in RAM. daemon=True means the thread will not keep the program
# alive when main() ends. Use: start() before the load, stop() after it.
class ResourceSampler(threading.Thread):
    """Samples system CPU and per-role RSS while a load runs."""

    # Take the Popen objects of the API and the workers and make a psutil handle for each
    # (psutil can read memory use; Popen cannot). The three lists hold one number per sample.
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

    # A psutil handle for a process id, or None if that cannot be made (for example the
    # process is already gone).
    @staticmethod
    def _safe(pid: int):
        try:
            return psutil.Process(pid)
        except Exception:
            return None

    def _tree_rss(self, proc) -> float:
        """Include children: uvicorn spawns, and RSS on the parent alone
        understates a multi-process server."""
        # Returns gigabytes (bytes / 1e9). Errors are ignored on purpose: a child can end
        # between the moment we list it and the moment we read it. Then the total is a
        # little too small for that one sample.
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

    # The thread's loop. The first cpu_percent call only "primes" psutil: it measures the
    # CPU use since the previous call, so the first reading means nothing and is dropped.
    # Then, until stop() is called, each round stores three numbers: CPU % of the whole
    # computer, memory of the API process and its children, and the summed memory of all
    # worker processes and their children.
    def run(self) -> None:
        psutil.cpu_percent(interval=None)  # prime
        while not self._stop.is_set():
            self.cpu.append(psutil.cpu_percent(interval=None))
            self.api_rss.append(self._tree_rss(self._api_proc))
            self.worker_rss.append(sum(self._tree_rss(p) for p in self._worker_procs))
            time.sleep(self.interval)

    # Tell the loop to stop and wait up to 5 seconds for it. Returns the number of samples
    # and the mean and peak (largest) value of CPU %, API memory (GB) and total worker
    # memory (GB), rounded to 2 decimals.
    def stop(self) -> dict:
        self._stop.set()
        self.join(timeout=5)

        # Mean and peak of a list of numbers. None for both when there are no samples.
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


# Turn a time value from the database into seconds (a float). Empty gives None, a number is
# kept as it is, and date text (for example "2026-01-01 12:00:00") is parsed. Text that
# cannot be parsed gives None. Later code only uses differences between two times, so the
# time zone does not matter.
def parse_ts(value) -> float | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except ValueError:
        return None


# Read the results of one run straight from the SQLite file. `prefix` is the start of the
# trace ids of that run ("bench"), so warm-up traces are not counted. One job = one span.
# Returns a dict of counts (jobs, succeeded, failed, retries, evaluations written) and of
# timings (total time, spans per second, and p50/p95 of three delays).
def collect_metrics(db: Path, prefix: str) -> dict:
    import sqlite3

    # Step 1: read the job rows of this run. In the SQL, `LIKE 'bench-%'` means "trace_id
    # starts with bench-". Each row has: the job's status, how many times a worker took it
    # (attempts), when it was created, when a worker last started it, and when it ended.
    conn = sqlite3.connect(str(db))
    rows = conn.execute(
        "SELECT status, attempts, created_at, started_at, completed_at "
        "FROM evaluation_jobs WHERE trace_id LIKE ?", (f"{prefix}-%",)
    ).fetchall()
    # Step 2: how many result rows were saved for these traces, and how many different spans
    # they cover. If a span was scored twice, the first number is bigger than the second.
    n_eval = conn.execute(
        "SELECT COUNT(*) FROM evaluations WHERE trace_id LIKE ?", (f"{prefix}-%",)
    ).fetchone()[0]
    n_distinct = conn.execute(
        "SELECT COUNT(DISTINCT span_id) FROM evaluations WHERE trace_id LIKE ?",
        (f"{prefix}-%",)
    ).fetchone()[0]
    conn.close()

    # Step 3: go through the jobs. queue_wait = time from creation to a worker starting it.
    # eval_time = time from start to end. e2e = end to end, creation to end. All in seconds
    # here. `created` and `completed` collect the raw times for the total time below.
    queue_wait, eval_time, e2e = [], [], []
    created, completed = [], []
    failed = retries = succeeded = 0

    for status, attempts, c, s, done in rows:
        if status in ("failed", "dead_letter"):
            failed += 1
        if status == "succeeded":
            succeeded += 1
        # Every attempt after the first is a retry.
        retries += max(0, (attempts or 0) - 1)

        # A delay is only recorded when both of its times exist. started_at is overwritten
        # at each new attempt, so for a retried job eval_time covers the last attempt only.
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

    # The p-th percentile (p50 = the middle value, p95 = a value that 95% of the numbers do
    # not exceed). Sort the list and take the item at position round(p/100 x (n-1)). The
    # answer is turned from seconds into milliseconds, rounded to 1 decimal. None if empty.
    def pct(values: list[float], p: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k] * 1000, 1)  # ms

    # Step 4: total time = the last job finished minus the first job created. The throughput
    # in the result is the number of succeeded jobs divided by this time.
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


# How many jobs of this run are still waiting ('queued') or being worked on ('running').
# 0 means the queue is empty for this run, so all its work is done.
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


# Run ONE test: `worker_count` workers under one `mode` ("burst" or "steady") with
# `n_traces` traces. `tmp` is the folder for the temporary database; `steady_rate` (spans per
# second) is used only in steady mode. Returns a dict with the results, or
# {"skipped": True, "reason": ...} if memory is too small, or {"error": ...} if the API
# never got ready.
def run_config(worker_count: int, mode: str, n_traces: int, tmp: Path,
               steady_rate: float | None = None) -> dict:
    # Step 1: make sure the port is free, then make a new empty database file (its name has
    # the mode, the worker count and the time) and create its tables.
    assert_port_free()
    db = tmp / f"bench_{mode}_{worker_count}_{int(time.time())}.db"
    migrate(db)

    # Step 2: memory check. Skip this setting if the free memory is below what the workers
    # and the headroom are expected to need (see EST_WORKER_RSS_GB above).
    available_gb = psutil.virtual_memory().available / 1e9
    needed = worker_count * EST_WORKER_RSS_GB + MEMORY_HEADROOM_GB
    if needed > available_gb:
        return {"skipped": True,
                "reason": f"needs ~{needed:.1f} GB, only {available_gb:.1f} GB available"}

    # Step 3: start the API and wait until it can serve requests. If it never gets ready,
    # kill it and report an error for this setting.
    api = start_api(db)
    if not wait_api_ready():
        hard_kill(api)
        return {"error": "API never became ready"}
    backend = backend_in_use()

    # Step 4: start the workers. worker_start is the time before the first one starts; it is
    # used for worker_ready_seconds in the result.
    workers: list[subprocess.Popen] = []
    worker_start = time.time()
    for _ in range(worker_count):
        workers.append(start_worker(db))

    # Warm-up: prove every worker is alive and past model loading before the
    # measured phase. Without this, the first seconds of the run would be
    # measuring model loading rather than evaluation.
    # Step 5 (the warm-up): send 2 traces per worker with their own prefix ("warm"), so they are
    # not counted in the results, and wait until none is queued or running. Waits at most 600
    # seconds; if the time runs out, the code carries on anyway. worker_ready_seconds = time
    # from starting the workers until this is finished.
    warm_prefix = "warm"
    for i in range(worker_count * 2):
        post(make_trace(warm_prefix, i))
    deadline = time.time() + 600
    while time.time() < deadline and queue_outstanding(db, warm_prefix) > 0:
        time.sleep(0.5)
    worker_ready_seconds = round(time.time() - worker_start, 1)

    # Step 6: the measured part. Start the resource sampler, then send the traces.
    prefix = "bench"
    sampler = ResourceSampler(api, workers)
    sampler.start()

    # Step 7: send the load. `statuses` keeps the HTTP status of every POST.
    submit_start = time.time()
    statuses: list[int] = []
    if mode == "burst":
        # Everything at once: the queue is never empty, so drain rate is the
        # configuration's maximum sustainable throughput.
        # (One POST after the other with no pause. Each POST waits for the API's reply.)
        for i in range(n_traces):
            statuses.append(post(make_trace(prefix, i)))
    else:
        # Paced submission at a fixed rate, identical across configurations.
        # interval = seconds between two traces so that spans go in at `steady_rate` per
        # second. Trace i is due at submit_start + i x interval. If the program is behind
        # schedule, it sends at once without sleeping.
        interval = SPANS_PER_TRACE / steady_rate
        for i in range(n_traces):
            target = submit_start + i * interval
            now = time.time()
            if target > now:
                time.sleep(target - now)
            statuses.append(post(make_trace(prefix, i)))
    submit_seconds = round(time.time() - submit_start, 2)

    # Step 8: wait until the workers have finished all the jobs of this run, for at most 1800
    # seconds (30 minutes). `drained` says whether the queue really got empty in that time.
    drain_deadline = time.time() + 1800
    while time.time() < drain_deadline and queue_outstanding(db, prefix) > 0:
        time.sleep(0.5)
    drained = queue_outstanding(db, prefix) == 0

    # Step 9: stop the sampler, read the timings from the database, then kill the workers
    # and the API so the next setting starts clean.
    resources = sampler.stop()
    metrics = collect_metrics(db, prefix)

    for w in workers:
        hard_kill(w)
    hard_kill(api)

    # The result of this setting. Notes: ingest_http_errors = how many POSTs did not answer
    # 202. inference_backend and backend_degraded come from the API's health reply (see
    # backend_in_use). `**metrics` adds all the numbers from collect_metrics.
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


# Run the whole benchmark: every mode x every worker count, then save one JSON file.
def main() -> None:
    # Options. --traces = traces per test (each has 5 spans). --workers = comma-separated
    # worker counts to try. --modes = comma-separated load types to run ("burst", "steady").
    parser = argparse.ArgumentParser()
    parser.add_argument("--traces", type=int, default=400,
                        help="traces per run; each is 5 spans")
    parser.add_argument("--workers", default="1,2,4,8")
    parser.add_argument("--modes", default="burst,steady")
    args = parser.parse_args()

    # Turn the text options into lists. The temporary databases go in a folder under the
    # TEMP folder (or /tmp if TEMP is not set).
    worker_counts = [int(w) for w in args.workers.split(",")]
    modes = args.modes.split(",")
    tmp = Path(os.environ.get("TEMP", "/tmp")) / "agentpulse_throughput"
    tmp.mkdir(parents=True, exist_ok=True)

    print("=" * 78)
    print("THROUGHPUT BENCHMARK — worker processes vs sustainable spans/sec")
    print("=" * 78)
    # Facts about this computer, saved in the JSON so that the numbers can be read in context.
    # Physical cores = real cores; logical cores = cores counting hyper-threading.
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
    # Steady mode needs that burst figure. `base` = the first burst result with 1 worker and
    # a throughput number. If there is none (for example --modes steady), steady is skipped.
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

        # Run every worker count in this mode. A skipped or failed run has no "worker_count"
        # and "mode" keys, so setdefault adds them (it never changes a key that exists).
        for count in worker_counts:
            print(f"--- {mode:6s} | {count} worker(s) ---")
            entry = run_config(count, mode, args.traces, tmp, steady_rate)
            entry.setdefault("worker_count", count)
            entry.setdefault("mode", mode)
            results.append(entry)

            # Print one short summary per run. Skipped and failed runs print their reason.
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

    # The file that is saved: the time, the machine facts, the workload settings, the steady
    # rate that was used (None if steady did not run) and the list of all runs.
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
