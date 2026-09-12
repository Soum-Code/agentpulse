#!/usr/bin/env bash
# Entry point for the Hugging Face Space.
#
# Spaces run a single container on a single port, so the API and the
# evaluation worker share this process tree. The API owns the port; the
# worker runs beside it and is restarted if it dies.
set -euo pipefail

echo "[start] AgentPulse Space booting"

# Spaces filesystems are ephemeral: every restart begins with an empty
# database. Seed it so the console has something to show.
export AGENTPULSE_SEED_DEMO="${AGENTPULSE_SEED_DEMO:-true}"

start_worker() {
  while true; do
    echo "[worker] starting"
    python -m app.worker || echo "[worker] exited with $?; restarting in 5s"
    sleep 5
  done
}

start_worker &
WORKER_PID=$!

shutdown() {
  echo "[start] shutting down"
  kill "$WORKER_PID" 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM SIGINT

# Seeding runs against the live API, so it waits for the port to answer.
if [ "$AGENTPULSE_SEED_DEMO" = "true" ]; then
  ( python /app/seed_demo.py || echo "[seed] failed, continuing without demo data" ) &
fi

echo "[start] launching API on 0.0.0.0:7860"
exec uvicorn app.main:app --host 0.0.0.0 --port 7860
