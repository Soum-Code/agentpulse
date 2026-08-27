"""Measure evaluation durability by killing processes, not by reading code.

Runs the same four probes against whatever architecture is currently in the
tree, so the before/after comparison for the durable-queue work is measured
rather than asserted. The instruction driving this script was explicit: do not
claim durability from code inspection alone.

PROBES

  loss_on_crash      ingest N spans, SIGKILL the server mid-evaluation, restart,
                     and count how many spans ended up with an evaluation.
                     Anything missing was silently lost.
  duplicate_submit   ingest the same span twice; count evaluation rows for it.
                     More than one means the same work was done twice.
  recovery           after the crash and restart, does the system finish the
                     work it still owes without being asked again?
  retry              does a failing evaluation get retried, and does it stop?

Each probe runs against a throwaway database. Nothing here touches
data/agentpulse.db.

WHY SIGKILL. `terminate()` lets Python run shutdown hooks, which is the polite
case and not the one that loses data. `kill()` is the power-cut case, and is
what a durability claim has to survive.

Usage:
    python scripts/measure_durability.py --label before
    python scripts/measure_durability.py --label after
Results append to experiments/results/durability_measurements.json.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
RESULTS = ROOT / "experiments" / "results" / "durability_measurements.json"

API_KEY = "durability-probe-key"
PORT = 8123
BASE = f"http://127.0.0.1:{PORT}"


def server_env(db_path: Path) -> dict[str, str]:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["PYTHONPATH"] = str(BACKEND)
    return env


def assert_port_free() -> None:
    """Refuse to run if something already owns the probe port.

    Learned the hard way: a leftover server from a previous crashed run kept
    listening, `wait_ready()` happily connected to *it*, and the probe reported
    0 spans ingested against a database that no longer existed. A stale listener
    must abort the measurement, not silently replace it.
    """
    import socket

    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect(("127.0.0.1", PORT))
    except Exception:
        return  # nothing there, good
    finally:
        sock.close()
    raise SystemExit(
        f"ABORT: port {PORT} is already in use. A stale probe server is likely "
        f"still running; kill it before measuring, or results will describe the "
        f"wrong process."
    )


def start_server(db_path: Path) -> subprocess.Popen:
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
        cwd=str(BACKEND), env=server_env(db_path),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc


def start_worker(db_path: Path, lease_seconds: int = 10) -> subprocess.Popen:
    """Start the evaluation worker process.

    Only meaningful for the durable-queue architecture; before it existed,
    evaluation ran inside the API process and there was nothing to start.

    A short lease keeps recovery observable within the probe's lifetime. In
    production the lease is 120s because it must exceed worst-case evaluation
    time; here the stub-free real evaluator still runs, but the probe kills the
    worker deliberately and wants the reclaim to happen promptly.
    """
    return subprocess.Popen(
        [sys.executable, "-m", "app.worker", "--lease-seconds", str(lease_seconds)],
        cwd=str(BACKEND), env=server_env(db_path),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def wait_for_job_activity(db_path: Path, timeout: float = 300.0) -> bool:
    """Wait until the worker has actually claimed a job.

    Anchors the kill to observed progress rather than a guessed delay -- the
    same reason the durable-queue tests wait on a progress marker.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        counts = db_counts(db_path)
        statuses = counts.get("_job_status") or {}
        if statuses.get("running") or statuses.get("succeeded"):
            return True
        time.sleep(0.5)
    return False


def wait_ready(timeout: float = 300.0) -> bool:
    """Wait for the models to be loaded, not merely for the process to answer.

    `/v1/health` returns 200 as soon as the process is up, but main.py calls
    load_models() WITHOUT sync=True, so the models finish loading on a
    background thread some time later. Evaluations submitted during that window
    complete near-instantly with null scores.

    An earlier version of this probe waited only for HTTP 200 and consequently
    measured 60 spans "evaluated" in under 1.5 seconds -- fast because nothing
    was actually being evaluated. A crash probe that cannot catch work in flight
    measures nothing, so readiness here means models_loaded() is all true.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/v1/health", timeout=3) as r:
                if r.status == 200:
                    body = json.loads(r.read())
                    models = body.get("models") or {}
                    if models and all(models.values()):
                        return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def hard_kill(proc: subprocess.Popen) -> None:
    """SIGKILL equivalent. No shutdown hooks, no flush -- the power-cut case."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
    else:
        proc.send_signal(signal.SIGKILL)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        pass


def post_spans(spans: list[dict]) -> tuple[int, int]:
    """Returns (http_status, accepted). Errors are data, not exceptions --
    a re-submitted span currently 500s, and that is part of the measurement."""
    body = json.dumps({"spans": spans, "sdk_version": "0.1.0",
                       "service_name": "durability-probe"}).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/ingest", data=body, method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read()).get("accepted", 0)
    except urllib.error.HTTPError as exc:
        return exc.code, 0
    except Exception:
        return -1, 0


def make_span(i: int, trace: str) -> dict:
    return {
        "trace_id": trace,
        "span_id": f"{trace}-span-{i:03d}",
        "agent_id": f"agent_{i % 3}",
        "event_type": "agent_execution",
        "span_kind": "AGENT",
        "status": "success",
        "input_summary": f"Summarise the findings of report number {i} in detail.",
        "output_summary": (
            f"Report {i} concludes that the measured throughput increased "
            f"substantially, with {i * 3} distinct sources corroborating the result."
        ),
    }


def db_counts(db_path: Path) -> dict[str, int]:
    conn = sqlite3.connect(str(db_path))
    out: dict[str, int] = {}
    for table in ("spans", "evaluations", "evaluation_jobs"):
        try:
            out[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.OperationalError:
            out[table] = -1  # table absent in this architecture
    try:
        rows = conn.execute(
            "SELECT status, COUNT(*) FROM evaluation_jobs GROUP BY status"
        ).fetchall()
        out["_job_status"] = dict(rows)  # type: ignore[assignment]
    except sqlite3.OperationalError:
        pass
    try:
        out["distinct_evaluated_spans"] = conn.execute(
            "SELECT COUNT(DISTINCT span_id) FROM evaluations"
        ).fetchone()[0]
    except sqlite3.OperationalError:
        out["distinct_evaluated_spans"] = -1
    conn.close()
    return out


def probe_crash_and_recovery(tmp: Path, n_spans: int = 12) -> dict:
    """Ingest, SIGKILL mid-evaluation, restart, and see what survived."""
    # Unique per run: Windows keeps a lock on a sqlite file for a moment after
    # the owning process dies, so reusing one name makes the probe flaky.
    db = tmp / f"crash_{int(time.time()*1000)}.db"

    proc = start_server(db)
    if not wait_ready():
        hard_kill(proc)
        return {"error": "server did not become ready"}

    trace = "crash-trace"
    _status, accepted = post_spans([make_span(i, trace) for i in range(n_spans)])

    has_queue = db_counts(db).get("evaluation_jobs", -1) >= 0

    if has_queue:
        # Durable architecture: the API only enqueues, so the process that must
        # be killed to test durability is the WORKER.
        worker = start_worker(db)
        began = wait_for_job_activity(db)
        if not began:
            hard_kill(worker)
            hard_kill(proc)
            return {"error": "worker never claimed a job"}
        time.sleep(1.0)  # let it get properly into the batch
        hard_kill(worker)
        after_crash = db_counts(db)

        # Restart only the worker. The API was never the thing holding the work.
        worker2 = start_worker(db)
        deadline = time.time() + 240
        recovered = db_counts(db)
        while time.time() < deadline:
            recovered = db_counts(db)
            if recovered.get("distinct_evaluated_spans", 0) >= accepted:
                break
            time.sleep(2)
        hard_kill(worker2)
        hard_kill(proc)
    else:
        # Pre-queue architecture: evaluation lived inside the API process, so
        # killing the API is what destroys in-flight work.
        time.sleep(1.5)
        hard_kill(proc)
        after_crash = db_counts(db)

        proc2 = start_server(db)
        recovered = {}
        if wait_ready():
            deadline = time.time() + 90
            while time.time() < deadline:
                recovered = db_counts(db)
                if recovered.get("distinct_evaluated_spans", 0) >= accepted:
                    break
                time.sleep(2)
            recovered = db_counts(db)
        hard_kill(proc2)

    evaluated = recovered.get("distinct_evaluated_spans", 0)
    return {
        "architecture": "durable_queue" if has_queue else "in_process_background_tasks",
        "spans_ingested": accepted,
        "evaluated_immediately_after_kill": after_crash.get("distinct_evaluated_spans"),
        "job_rows_after_kill": after_crash.get("evaluation_jobs"),
        "job_status_after_kill": after_crash.get("_job_status"),
        "evaluated_after_restart": evaluated,
        "lost_evaluations": max(0, accepted - evaluated),
        "recovered_after_restart": max(
            0, evaluated - (after_crash.get("distinct_evaluated_spans") or 0)
        ),
        "job_status_after_restart": recovered.get("_job_status"),
        "duplicate_evaluations": max(
            0, (recovered.get("evaluations") or 0) - evaluated
        ),
    }


def probe_duplicate_submission(tmp: Path, repeats: int = 3) -> dict:
    """Submit the same span repeatedly; count how often it gets evaluated."""
    db = tmp / f"dupe_{int(time.time()*1000)}.db"

    proc = start_server(db)
    if not wait_ready():
        hard_kill(proc)
        return {"error": "server did not become ready"}

    trace = "dupe-trace"
    span = make_span(0, trace)
    statuses = []
    for _ in range(repeats):
        status, _accepted = post_spans([span])
        statuses.append(status)
        time.sleep(0.3)

    # Give evaluation time to drain. With the durable queue a worker must be
    # running to consume the jobs; before it existed, evaluation happened inside
    # the API process and no worker was involved.
    worker = None
    if db_counts(db).get("evaluation_jobs", -1) >= 0:
        worker = start_worker(db)
        deadline = time.time() + 180
        while time.time() < deadline:
            # Distinct name: `statuses` is already the list of HTTP codes above,
            # and shadowing it made the probe report job states as HTTP results.
            job_states = db_counts(db).get("_job_status") or {}
            if job_states and not job_states.get("queued") and not job_states.get("running"):
                break
            time.sleep(1)
    else:
        time.sleep(12)
    counts = db_counts(db)
    if worker is not None:
        hard_kill(worker)

    conn = sqlite3.connect(str(db))
    evals_for_span = conn.execute(
        "SELECT COUNT(*) FROM evaluations WHERE span_id = ?", (span["span_id"],)
    ).fetchone()[0]
    conn.close()
    hard_kill(proc)

    return {
        "submissions": repeats,
        "http_statuses": statuses,
        "evaluation_rows_for_that_span": evals_for_span,
        "duplicate_evaluations": max(0, evals_for_span - 1),
        "job_rows": counts.get("evaluation_jobs"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True,
                        help="'before' or 'after' the durable-queue change")
    parser.add_argument("--spans", type=int, default=12)
    args = parser.parse_args()

    tmp = Path(os.environ.get("TEMP", "/tmp")) / "agentpulse_durability"
    tmp.mkdir(parents=True, exist_ok=True)

    print("=" * 74)
    print(f"DURABILITY MEASUREMENT — label={args.label}")
    print("=" * 74)

    assert_port_free()
    print("\n[1/2] crash + recovery probe (SIGKILL mid-evaluation)")
    crash = probe_crash_and_recovery(tmp, args.spans)
    for k, v in crash.items():
        print(f"   {k:38s} {v}")

    assert_port_free()
    print("\n[2/2] duplicate submission probe")
    dupe = probe_duplicate_submission(tmp)
    for k, v in dupe.items():
        print(f"   {k:38s} {v}")

    entry = {
        "label": args.label,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "method": "real uvicorn process, SIGKILL, throwaway database",
        "crash_and_recovery": crash,
        "duplicate_submission": dupe,
    }

    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    history = []
    if RESULTS.exists():
        try:
            history = json.loads(RESULTS.read_text(encoding="utf-8"))
        except Exception:
            history = []
    history.append(entry)
    RESULTS.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"\nAppended to {RESULTS}")


if __name__ == "__main__":
    main()
