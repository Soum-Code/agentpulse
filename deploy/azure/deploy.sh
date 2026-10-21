#!/usr/bin/env bash
# Deploys origin/main to the Azure VM. The deploy-azure workflow runs it there over SSH:
#
#   ssh azureuser@<vm> 'bash -s' < deploy/azure/deploy.sh
#
# It is the by-hand procedure of SESSION_HANDOFF.md 28.11 and 28.12, in the same order:
# fast-forward the checkout, back up the database, build the changed images one at a time
# under a temporary swapfile, start the new backend against a COPY of the database, and
# only then swap. If the new containers are not healthy it puts the previous images back
# and fails. Caddy and the volumes are never touched.
#
# On any failure the checkout goes back to the commit that is running, so the next run sees
# the same change again. A log of every run is kept in ~/deploy-logs/ on the VM.
#
# Everything runs from main() at the bottom, so bash has read the whole script before any
# of it runs.

set -euo pipefail

REPO="$HOME/agentpulse"
SWAPFILE=/swapfile
STAMP=$(date -u +%Y%m%d-%H%M%S)
LOG="$HOME/deploy-logs/deploy-$STAMP.log"

# Set as the deploy goes; cleanup() reads them.
OLD="" NEW="" TAG="" TMP="" CAND="" SITE=""
SERVICES=()
declare -A PREV=() NEWIMG=() WANT=()
SWAP_MADE=false SWAPPED=false DEPLOYED=false

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { echo "::error::$*"; exit 1; }
dc() { sudo docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml "$@"; }
cid() { dc ps -q "$1"; }
running_image() { sudo docker inspect -f '{{.Image}}' "$(cid "$1")"; }
swap_active() { swapon --show=NAME --noheadings | grep -x "$SWAPFILE" >/dev/null; }

# Runs "$@" every 5 seconds until it succeeds or $1 seconds have passed.
wait_for() {
  local limit=$1 waited=0
  shift
  until "$@"; do
    ((waited < limit)) || return 1
    sleep 5
    waited=$((waited + 5))
  done
}

# GET /v1/health from inside container $1. It answers 200 whenever the process is up, so
# the body decides: the API (its database check) must be ready, and with "evaluator" as $2
# a live worker as well.
health() {
  sudo docker exec "$1" python -c '
import json, sys, urllib.request
try:
    body = json.load(urllib.request.urlopen("http://127.0.0.1:8000/v1/health", timeout=5))
except Exception as exc:
    print("  /v1/health:", exc)
    sys.exit(1)
ready = body["readiness"]
print("  /v1/health: state=%s api=%s evaluator=%s"
      % (body["state"], ready["api"]["ready"], ready["evaluator"]["ready"]))
sys.exit(0 if ready["api"]["ready"] and (ready["evaluator"]["ready"] or sys.argv[1:] != ["evaluator"]) else 1)
' "${@:2}"
}

# After a swap or a rollback: every service runs the image in WANT, the API and a worker
# started from that image are ready, and the site answers through Caddy.
stack_ok() {
  local svc
  for svc in "${SERVICES[@]}"; do
    if [[ $(running_image "$svc" 2>/dev/null) != "${WANT[$svc]}" ]]; then
      echo "  $svc: not running the expected image yet"
      return 1
    fi
  done
  if [[ -n ${WANT[backend]:-} ]]; then
    health "$(cid backend)" evaluator || return 1
    # The old worker's heartbeat stays "fresh" for 90 s if it was killed rather than
    # stopped, so a ready evaluator alone does not prove the new worker is up.
    if ! sudo docker logs "$(cid worker)" 2>&1 | grep "Evaluation worker .* starting" >/dev/null; then
      echo "  worker: has not started its loop yet"
      return 1
    fi
  fi
  if ! curl -fsS -o /dev/null --resolve "$SITE:443:127.0.0.1" "https://$SITE/" ||
    ! curl -fsS -o /dev/null --resolve "$SITE:443:127.0.0.1" "https://$SITE/v1/health"; then
    echo "  https://$SITE/ is not answering yet"
    return 1
  fi
}

cleanup() {
  local rc=$? svc
  set +e
  trap '' HUP INT TERM # a second signal must not cut the cleanup short
  # A new tee that keeps writing the log if the SSH connection is gone (-p), so the cleanup
  # always runs to the end and is always logged.
  exec > >(tee -p -a "$LOG") 2>&1
  log "cleaning up (exit $rc)"
  if [[ $DEPLOYED != true ]]; then
    # Back to the commit that is running: the next run then sees this change again, and a
    # rollback starts the old images with the compose files they were started with.
    if [[ -n $NEW && $NEW != "$OLD" ]]; then
      if git reset -q --keep "$OLD"; then
        log "checkout back at $OLD"
      else
        echo "::error::could not move $REPO back to $OLD; run 'git reset --keep $OLD' there by hand, or the next deploy will not rebuild this change"
      fi
    fi
    for svc in "${!PREV[@]}"; do
      sudo docker tag "${PREV[$svc]}" "agentpulse-$svc:latest"
    done
    if [[ $SWAPPED == true ]]; then
      log "rolling back ${SERVICES[*]} to the images that ran before"
      for svc in "${SERVICES[@]}"; do
        WANT[$svc]=${PREV[$svc]}
      done
      dc up -d --no-build --no-deps --force-recreate "${SERVICES[@]}"
      if wait_for 300 stack_ok; then
        log "rolled back; the previous images are healthy"
      else
        echo "::error::the rollback is not healthy either; look at the VM by hand"
      fi
    fi
  fi
  [[ -n $CAND ]] && sudo docker rm -f "$CAND" >/dev/null 2>&1
  [[ -n $TMP ]] && sudo rm -rf "$TMP"
  if [[ $SWAP_MADE == true ]]; then
    if sudo swapoff "$SWAPFILE" 2>/dev/null || ! swap_active; then
      sudo rm -f "$SWAPFILE" && log "swapfile removed"
    else
      echo "::warning::could not swapoff $SWAPFILE; remove it by hand (sudo swapoff $SWAPFILE && sudo rm $SWAPFILE)"
    fi
  fi
  exit "$rc"
}

main() {
  local svc id alters backup

  mkdir -p "$HOME/deploy-logs" "$HOME/backups"
  exec > >(tee -a "$LOG") 2>&1

  # One deploy at a time on the VM, even if a cancelled run is still cleaning up here.
  exec 9>"$HOME/.agentpulse-deploy.lock"
  flock -n 9 || fail "another deploy is still running on the VM"

  # Only now, so a run that did not get the lock cannot clean up another run's swapfile.
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  # The tee above dies with the SSH connection (a cancelled or timed-out run). Writes then
  # fail instead of killing the script, so the run stops at a failed step and ends through
  # cleanup(), which rolls back a swap that was already made.
  trap '' PIPE

  cd "$REPO"

  # ── 1. Fast-forward main ──
  [[ $(git branch --show-current) == main ]] ||
    fail "$REPO is not on main ($(git branch --show-current)); switch it by hand"
  [[ -z $(git status --porcelain --untracked-files=no) ]] ||
    fail "$REPO has local changes; commit or discard them by hand: $(git status --short --untracked-files=no | tr '\n' ' ')"
  OLD=$(git rev-parse HEAD)
  git fetch -q origin main
  git merge -q --ff-only origin/main || fail "main on the VM cannot be fast-forwarded to origin/main; look at it by hand"
  NEW=$(git rev-parse HEAD)
  log "old commit $OLD"
  log "new commit $NEW"

  # ── 2. Which images need a rebuild ──
  git diff --quiet "$OLD" "$NEW" -- backend/ || SERVICES+=(backend worker)
  git diff --quiet "$OLD" "$NEW" -- dashboard/ || SERVICES+=(dashboard)
  if ! git diff --quiet "$OLD" "$NEW" -- docker-compose.yml deploy/azure/docker-compose.azure.yml deploy/azure/Caddyfile; then
    echo "::warning::docker-compose.yml, the Azure overlay or the Caddyfile changed. This script applies that only to the services it recreates (${SERVICES[*]:-none}); apply the rest by hand."
  fi
  if ((${#SERVICES[@]} == 0)); then
    log "nothing under backend/ or dashboard/ changed; nothing to rebuild"
    DEPLOYED=true
    exit 0
  fi
  log "to rebuild: ${SERVICES[*]}"

  SITE=$(sed -n 's/^AGENTPULSE_SITE_ADDRESS=//p' .env | tail -n 1 | tr -d "\"'")
  [[ -n $SITE ]] || fail "AGENTPULSE_SITE_ADDRESS is not set in $REPO/.env"
  [[ ! -e $SWAPFILE ]] ||
    fail "$SWAPFILE already exists, and this script only removes a swapfile it made; check 'swapon --show' and /etc/fstab, and remove it by hand if it is left over"
  local free_gb
  free_gb=$(df --output=avail -BG / | tail -n 1 | tr -dc 0-9)
  ((free_gb >= 10)) || fail "only ${free_gb} GB free on /; the swapfile and a build need about 10 GB"
  [[ -n $(cid backend) ]] || fail "the backend is not running, so there is nothing to back up the database from"
  for svc in "${SERVICES[@]}"; do
    id=$(cid "$svc")
    [[ -n $id ]] || fail "$svc is not running, so there is no image to roll back to"
    PREV[$svc]=$(sudo docker inspect -f '{{.Image}}' "$id")
    # Compose starts agentpulse-<service>:latest. If that is not what runs, the VM is in a
    # state this script did not make; a person should look first.
    [[ $(sudo docker image inspect -f '{{.Id}}' "agentpulse-$svc:latest") == "${PREV[$svc]}" ]] ||
      fail "agentpulse-$svc:latest is not the image the running $svc container uses; fix that by hand first"
    log "$svc runs ${PREV[$svc]:7:12} ($(sudo docker image inspect -f '{{join .RepoTags " "}}' "${PREV[$svc]}"))"
  done
  TAG="deploy-$STAMP-${NEW:0:7}"

  # ── 3. Back up the live database, through SQLite's backup API ──
  backup="$HOME/backups/agentpulse-pre-$TAG.db"
  sudo docker exec -i "$(cid backend)" python - <<'PY'
import sqlite3
src = sqlite3.connect("/data/agentpulse.db")
dst = sqlite3.connect("/tmp/agentpulse-backup.db")
src.backup(dst)
src.close()
check = dst.execute("PRAGMA integrity_check").fetchone()[0]
rows = dst.execute("SELECT count(*) FROM evaluations").fetchone()[0]
dst.close()
print(f"  backup: integrity_check={check}, {rows} evaluations")
raise SystemExit(check != "ok")
PY
  sudo docker cp "$(cid backend):/tmp/agentpulse-backup.db" "$backup"
  sudo docker exec "$(cid backend)" rm /tmp/agentpulse-backup.db
  sudo chown "$(id -u):$(id -g)" "$backup"
  log "backup: $backup"

  # ── 4. Temporary swap: 4 GB of RAM and no swap is not enough to build next to the stack ──
  log "adding a 3 GB $SWAPFILE for the build"
  SWAP_MADE=true
  sudo fallocate -l 3G "$SWAPFILE"
  sudo chmod 600 "$SWAPFILE"
  sudo mkswap "$SWAPFILE" >/dev/null
  sudo swapon "$SWAPFILE"

  # ── 5. Build, one service at a time ──
  # Through compose: there is no buildx, and the dashboard bakes VITE_* from .env.
  for svc in "${SERVICES[@]}"; do
    log "building $svc"
    dc build "$svc"
    sudo docker tag "agentpulse-$svc:latest" "agentpulse-$svc:$TAG"
    NEWIMG[$svc]=$(sudo docker image inspect -f '{{.Id}}' "agentpulse-$svc:$TAG")
    # The build moved :latest to the new image. Until the swap it must name what runs, or a
    # reboot or a stray `up` would start an untested image.
    sudo docker tag "${PREV[$svc]}" "agentpulse-$svc:latest"
    log "$svc built: agentpulse-$svc:$TAG (${NEWIMG[$svc]:7:12})"
  done

  # ── 6 and 7. The new backend against a copy of the live database ──
  if [[ -n ${NEWIMG[backend]:-} ]]; then
    sudo docker run --rm --network none "agentpulse-worker:$TAG" python -c "import app.worker"
    log "worker image: app.worker imports"

    TMP=$(mktemp -d /tmp/agentpulse-deploy.XXXXXX)
    cp "$backup" "$TMP/agentpulse.db"
    sudo chown -R 1000:1000 "$TMP" # the image's user

    # Columns the new models have and the database lacks: plain nullable ones are added to
    # the copy here, anything else stops the deploy (schema_check.py says why).
    # shellcheck disable=SC2024 # the file is read as this user, on purpose
    alters=$(sudo docker run --rm -i --network none -v "$TMP:/t" "agentpulse-backend:$TAG" \
      python - /t/agentpulse.db <deploy/azure/schema_check.py)
    [[ -z $alters ]] || log "added to the copy: $alters"

    # No network: it holds a copy of production data and the real .env, and must not send
    # a webhook or reach anything else.
    CAND="agentpulse-candidate-$TAG"
    sudo docker run -d --name "$CAND" --network none --env-file .env \
      -e AGENTPULSE_DATABASE_URL=sqlite+aiosqlite:////t/agentpulse.db \
      -e AGENTPULSE_LOCAL_DEV_MODE=false \
      -v "$TMP:/t" "agentpulse-backend:$TAG" >/dev/null
    if ! wait_for 120 health "$CAND"; then
      sudo docker logs --tail 50 "$CAND"
      fail "the new backend did not become healthy on a copy of the database; nothing live was changed"
    fi
    sudo docker exec -i "$CAND" python - <<'PY'
import asyncio

from sqlmodel import SQLModel, select

from app.database import get_session
from app.models import Evaluation


async def main():
    async with get_session() as session:
        evaluations = (await session.execute(select(Evaluation))).scalars().all()
        for table in SQLModel.metadata.sorted_tables:
            await session.execute(select(table).limit(1))
    print(f"  candidate: read {len(evaluations)} evaluations through the Evaluation model, and a row of every table")


asyncio.run(main())
PY
    sudo docker rm -f "$CAND" >/dev/null
    CAND=""
    log "the new backend works on a copy of the database"

    # The same columns on the live database. The running code does not read them, so this
    # is safe before the swap, and they stay if the swap is rolled back.
    if [[ -n $alters ]]; then
      log "adding the same columns to the live database"
      sudo docker exec -i "$(cid backend)" python - "$alters" <<'PY'
import sqlite3, sys
db = sqlite3.connect("/data/agentpulse.db", timeout=30)
for statement in sys.argv[1].splitlines():
    print("  " + statement)
    db.execute(statement)
db.commit()
check = db.execute("PRAGMA integrity_check").fetchone()[0]
print("  integrity_check:", check)
raise SystemExit(check != "ok")
PY
    fi
  fi

  # ── 8. Swap ──
  for svc in "${SERVICES[@]}"; do
    sudo docker tag "agentpulse-$svc:$TAG" "agentpulse-$svc:latest"
    WANT[$svc]=${NEWIMG[$svc]}
  done
  log "swapping ${SERVICES[*]}"
  SWAPPED=true
  # --no-deps: only the rebuilt services are recreated, never Caddy or the others.
  dc up -d --no-build --no-deps --force-recreate "${SERVICES[@]}"
  wait_for 300 stack_ok || fail "the new containers were not healthy within 5 minutes"
  DEPLOYED=true

  log "deployed $NEW: ${SERVICES[*]} now run the images tagged $TAG"
  log "to roll back by hand, in ~/agentpulse:"
  for svc in "${SERVICES[@]}"; do
    log "  sudo docker tag ${PREV[$svc]} agentpulse-$svc:latest"
  done
  log "  git reset --keep $OLD"
  log "  sudo docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml up -d --no-build --no-deps --force-recreate ${SERVICES[*]}"
}

main "$@"
