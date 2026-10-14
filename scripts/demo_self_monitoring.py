"""Live demonstration that platform state is measured, not inferred.

Walks a real API and real worker through four situations and prints what
`/v1/platform` reports at each. The point is the third column: in every one of
these situations `/v1/health` returns HTTP 200, so a reader relying on status
codes alone cannot tell them apart.

    1. API up, no worker            -> failing   (accepting work nothing evaluates)
    2. worker started               -> healthy
    3. spans ingested               -> queue depth and job counts move
    4. worker SIGKILLed             -> failing again once the heartbeat goes stale

Usage:  python scripts/demo_self_monitoring.py
"""

# About this file
# - What it is: a demo you run by hand. It starts a real API and a real worker as separate
#   processes on a throwaway SQLite database. At four moments it asks GET /v1/platform for
#   the platform's self-report and prints it next to the HTTP status of GET /v1/health.
# - Windows only: kill() below uses `taskkill`, a Windows command.
# - How it fits in: it talks to the backend over HTTP (routes in backend/app/routers) and
#   imports WORKER_STALE_AFTER_SECONDS from backend/app/services/platform_health.py.

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# ROOT = repo folder, BACKEND = its backend/ folder (the child processes run from there).
# PORT and BASE = where the demo API listens; API_KEY = a made-up key the demo API is
# started with and the requests below send.
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PORT = 8137
BASE = f"http://127.0.0.1:{PORT}"
API_KEY = "selfmon-demo-key"


# Builds the environment variables for the child processes (API and worker): the current
# environment plus settings that point them at the throwaway database `db`.
def env_for(db: Path) -> dict:
    # AGENTPULSE_LOCAL_DEV_MODE=true lets GET requests skip the API key (see middleware.py).
    # PYTHONPATH lets the children import the `app` package. HF_HUB_DISABLE_SYMLINKS_WARNING
    # hides a warning from Hugging Face (the model download library) about symlinks.
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["PYTHONPATH"] = str(BACKEND)
    env["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    return env


# Force-stops a process and the processes it started (taskkill /F = force, /T = whole
# tree). Does nothing for None or a process that has already ended. Waits up to 20
# seconds for it to exit and ignores a timeout.
def kill(proc):
    if proc and proc.poll() is None:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            pass


# GET /v1/platform and return the parsed JSON. Raises an error if the API cannot be reached.
def platform_state() -> dict:
    req = urllib.request.Request(f"{BASE}/v1/platform",
                                 headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# GET /v1/health and return only the HTTP status number. The health route answers 200
# whatever the platform state is, which is the point of this demo.
def health_status() -> int:
    req = urllib.request.Request(f"{BASE}/v1/health", headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


# Prints one snapshot: the health status code, the platform's verdict with its reasons,
# how many workers are alive or stale, the queue size and how many jobs were processed.
def show(label: str) -> None:
    body = platform_state()
    # q = the job queue; depth = jobs waiting plus jobs running, by_status = count per status.
    q = body["evaluation_queue"]
    # w = the worker list. A worker is "alive" when its heartbeat (a row it keeps refreshing
    # in the database) is recent and its status is "running". Every other one is "stale".
    w = body["workers"]
    print(f"\n  {label}")
    print(f"    /v1/health HTTP     : {health_status()}   <- identical in every case")
    print(f"    platform state      : {body['state'].upper()}")
    for reason in body["reasons"]:
        print(f"      reason            : {reason}")
    print(f"    workers alive/stale : {w['alive']}/{w['stale']}  "
          f"backends={w['backend_distribution']}  degraded={w['degraded_backends']}")
    print(f"    queue depth         : {q['depth']}  by_status={q['by_status']}")
    # Jobs processed, added up over every worker row in the list (alive or stale).
    print(f"    jobs processed      : "
          f"{sum(x['jobs_processed'] for x in w['workers'])}")


# Runs the demo: Step 1 prepares a fresh database, then it shows the platform state at
# four moments (see the module docstring). The finally block at the end always stops
# the API and worker, even if something fails.
def main() -> None:
    # Step 1: make a new database file in the temp folder. The timestamp in the name gives
    # every run its own empty file. Then create its tables with Alembic (the tool that
    # applies database migrations; "upgrade head" = apply all of them).
    tmp = Path(os.environ.get("TEMP", "/tmp")) / "agentpulse_selfmon"
    tmp.mkdir(parents=True, exist_ok=True)
    db = tmp / f"demo_{int(time.time())}.db"

    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                            cwd=str(BACKEND), env=env_for(db),
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"migration failed:\n{result.stderr}")

    api = worker = None
    try:
        print("=" * 74)
        print("SELF-MONITORING DEMONSTRATION")
        print("=" * 74)

        # Step 2: start the API (uvicorn is the server program that runs the FastAPI app).
        # Its output is thrown away, and --log-level warning keeps it quiet.
        api = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
             "--port", str(PORT), "--log-level", "warning"],
            cwd=str(BACKEND), env=env_for(db),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Wait up to 300 seconds, asking once a second. Errors while the API is still
        # starting (connection refused) are ignored on purpose, and we ask again.
        deadline = time.time() + 300
        while time.time() < deadline:
            try:
                body = platform_state()
                # API readiness is the database, not models: the API performs
                # no inference and no longer loads them.
                if body["api"]["ready"]:
                    break
            except Exception:
                pass
            time.sleep(1)

        # Moment 1: API is up but no worker exists.
        show("1. API up and ready (no models by design), NO WORKER")

        # Step 3: start the worker (`-m app.worker` runs backend/app/worker.py as a program).
        worker = subprocess.Popen(
            [sys.executable, "-m", "app.worker"],
            cwd=str(BACKEND), env=env_for(db),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Wait (up to 300 s) until the platform reports at least one live worker, meaning
        # the worker has written a heartbeat.
        deadline = time.time() + 300
        while time.time() < deadline:
            if platform_state()["workers"]["alive"] > 0:
                break
            time.sleep(1)
        # Moment 2: the worker is alive.
        show("2. worker started")

        # Step 4: send 20 spans of one trace in a single POST /v1/ingest. Each span has its
        # own agent_id and the same short input text, so the worker has 20 jobs to score.
        spans = [{
            "trace_id": "demo-trace", "span_id": f"demo-span-{i}",
            "agent_id": f"agent_{i}", "event_type": "agent_execution",
            "span_kind": "AGENT", "status": "success",
            "input_summary": "Assess the quarterly figures.",
            "output_summary": f"Stage {i}: figures indicate a measurable increase.",
        } for i in range(20)]
        body = json.dumps({"spans": spans, "sdk_version": "0.1.0",
                           "service_name": "demo"}).encode()
        req = urllib.request.Request(
            f"{BASE}/v1/ingest", data=body, method="POST",
            headers={"Content-Type": "application/json", "X-API-Key": API_KEY})
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        # Pause 2 seconds before the snapshot, which is meant to catch evaluation in progress.
        time.sleep(2)
        # Moment 3: queue depth and job counts should be changing.
        show("3. 20 spans ingested (evaluation in progress)")

        # Step 5: wait (up to 180 s, checking every 2 s) until the queue depth is 0, which
        # means no job is queued or running.
        deadline = time.time() + 180
        while time.time() < deadline:
            if platform_state()["evaluation_queue"]["depth"] == 0:
                break
            time.sleep(2)

        # Step 6: force-kill the worker. Setting it to None stops the finally block from
        # trying to kill it a second time.
        kill(worker)
        worker = None
        print("\n  worker SIGKILLed; waiting for heartbeat to go stale...")
        # Imported here, not at the top: the backend folder only gets onto sys.path in the
        # `__main__` block at the bottom of this file. The constant is the number of seconds
        # without a heartbeat after which a worker is treated as dead (90 in platform_health.py).
        from app.services.platform_health import WORKER_STALE_AFTER_SECONDS  # noqa
        # Wait that long plus 5 seconds of margin.
        time.sleep(WORKER_STALE_AFTER_SECONDS + 5)
        # Moment 4: no live worker any more, so the state is "failing" again.
        show("4. worker killed, heartbeat stale")

        print("\n" + "-" * 74)
        print("Every case above returned HTTP 200 from /v1/health.")
        print("Platform state distinguished them from measured signals.")
    finally:
        kill(worker)
        kill(api)


if __name__ == "__main__":
    # Make the backend's `app` package importable in this process (needed by the import
    # inside main()), then run the demo.
    sys.path.insert(0, str(BACKEND))
    main()
