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

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PORT = 8137
BASE = f"http://127.0.0.1:{PORT}"
API_KEY = "selfmon-demo-key"


def env_for(db: Path) -> dict:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["PYTHONPATH"] = str(BACKEND)
    env["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    return env


def kill(proc):
    if proc and proc.poll() is None:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            pass


def platform_state() -> dict:
    req = urllib.request.Request(f"{BASE}/v1/platform",
                                 headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def health_status() -> int:
    req = urllib.request.Request(f"{BASE}/v1/health", headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def show(label: str) -> None:
    body = platform_state()
    q = body["evaluation_queue"]
    w = body["workers"]
    print(f"\n  {label}")
    print(f"    /v1/health HTTP     : {health_status()}   <- identical in every case")
    print(f"    platform state      : {body['state'].upper()}")
    for reason in body["reasons"]:
        print(f"      reason            : {reason}")
    print(f"    workers alive/stale : {w['alive']}/{w['stale']}  "
          f"backends={w['backend_distribution']}  degraded={w['degraded_backends']}")
    print(f"    queue depth         : {q['depth']}  by_status={q['by_status']}")
    print(f"    jobs processed      : "
          f"{sum(x['jobs_processed'] for x in w['workers'])}")


def main() -> None:
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

        api = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
             "--port", str(PORT), "--log-level", "warning"],
            cwd=str(BACKEND), env=env_for(db),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

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

        show("1. API up and ready (no models by design), NO WORKER")

        worker = subprocess.Popen(
            [sys.executable, "-m", "app.worker"],
            cwd=str(BACKEND), env=env_for(db),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        deadline = time.time() + 300
        while time.time() < deadline:
            if platform_state()["workers"]["alive"] > 0:
                break
            time.sleep(1)
        show("2. worker started")

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
        time.sleep(2)
        show("3. 20 spans ingested (evaluation in progress)")

        deadline = time.time() + 180
        while time.time() < deadline:
            if platform_state()["evaluation_queue"]["depth"] == 0:
                break
            time.sleep(2)

        kill(worker)
        worker = None
        print("\n  worker SIGKILLed; waiting for heartbeat to go stale...")
        from app.services.platform_health import WORKER_STALE_AFTER_SECONDS  # noqa
        time.sleep(WORKER_STALE_AFTER_SECONDS + 5)
        show("4. worker killed, heartbeat stale")

        print("\n" + "-" * 74)
        print("Every case above returned HTTP 200 from /v1/health.")
        print("Platform state distinguished them from measured signals.")
    finally:
        kill(worker)
        kill(api)


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND))
    main()
