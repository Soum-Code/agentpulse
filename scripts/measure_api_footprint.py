"""Measure what removing the API's model load actually saved.

The readiness contract established that the API needs a database, not models.
This measures the consequence of acting on that, rather than asserting it: the
same API process is started twice, once with `AGENTPULSE_API_LOAD_MODELS=true`
and once with the new default, and resident memory plus time-to-ready are
compared.

Time-to-ready is measured against `/v1/health/ready` -- API readiness -- because
that is now the signal that says the process can serve. Waiting on model state
would measure the very thing being removed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PORT = 8141
BASE = f"http://127.0.0.1:{PORT}"
API_KEY = "footprint-key"


def env_for(db: Path, load_models: bool) -> dict:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    env["AGENTPULSE_API_KEY"] = API_KEY
    env["AGENTPULSE_LOCAL_DEV_MODE"] = "true"
    env["AGENTPULSE_API_LOAD_MODELS"] = "true" if load_models else "false"
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


def tree_rss_gb(pid: int) -> float:
    try:
        proc = psutil.Process(pid)
        total = proc.memory_info().rss
        for child in proc.children(recursive=True):
            try:
                total += child.memory_info().rss
            except Exception:
                pass
        return total / 1e9
    except Exception:
        return 0.0


def get(path: str):
    req = urllib.request.Request(f"{BASE}{path}", headers={"X-API-Key": API_KEY})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, json.loads(r.read())


def measure(db: Path, load_models: bool) -> dict:
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
         "--port", str(PORT), "--log-level", "warning"],
        cwd=str(BACKEND), env=env_for(db, load_models),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    started = time.time()
    ready_at = None
    models_ready_at = None

    try:
        deadline = time.time() + 300
        while time.time() < deadline:
            try:
                status, body = get("/v1/health/ready")
                if body.get("ready") and ready_at is None:
                    ready_at = time.time() - started
                    if not load_models:
                        break
                if load_models and ready_at is not None:
                    _s, health = get("/v1/health")
                    if all(health["models"].values()):
                        models_ready_at = time.time() - started
                        break
            except Exception:
                pass
            time.sleep(0.25)

        # Let it settle before sampling memory.
        time.sleep(5)
        rss = tree_rss_gb(proc.pid)
        _s, health = get("/v1/health")
        return {
            "api_load_models": load_models,
            "seconds_to_api_ready": round(ready_at, 2) if ready_at else None,
            "seconds_to_models_loaded": (
                round(models_ready_at, 2) if models_ready_at else None
            ),
            "rss_gb": round(rss, 3),
            "models_reported": health["models"],
            "api_ready": health["readiness"]["api"]["ready"],
        }
    finally:
        kill(proc)


def main() -> None:
    tmp = Path(os.environ.get("TEMP", "/tmp")) / "agentpulse_footprint"
    tmp.mkdir(parents=True, exist_ok=True)
    db = tmp / f"fp_{int(time.time())}.db"
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                            cwd=str(BACKEND), env=env_for(db, False),
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"migration failed:\n{result.stderr}")

    print("=" * 74)
    print("API FOOTPRINT: models loaded vs not")
    print("=" * 74)

    rows = [measure(db, True), measure(db, False)]
    print(f"\n{'api_load_models':>16} {'RSS (GB)':>10} {'to API ready':>14} "
          f"{'to models loaded':>18} {'api_ready':>10}")
    for r in rows:
        print(f"{str(r['api_load_models']):>16} {r['rss_gb']:>10.3f} "
              f"{str(r['seconds_to_api_ready']):>14} "
              f"{str(r['seconds_to_models_loaded']):>18} {str(r['api_ready']):>10}")

    saved = rows[0]["rss_gb"] - rows[1]["rss_gb"]
    print(f"\nmemory saved per API process: {saved:.3f} GB")
    print(f"models reported when disabled: {rows[1]['models_reported']}")
    print(f"API still ready without models: {rows[1]['api_ready']}")

    out = ROOT / "experiments" / "results" / "api_footprint.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "measurements": rows,
        "memory_saved_gb": round(saved, 3),
    }, indent=2), encoding="utf-8")
    print(f"\nSaved: {out}")


if __name__ == "__main__":
    main()
