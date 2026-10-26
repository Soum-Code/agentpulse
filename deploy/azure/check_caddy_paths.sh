#!/usr/bin/env bash
# In short: runs deploy/azure/Caddyfile in the real Caddy image, in front of a stub that only
# says what reached it, and checks which requests are asked for the write password (401) and
# which pass. It needs Docker and nothing else: no secret, no network access beyond pulling
# the image, and nothing on the VM is touched.
#
#   deploy/azure/check_caddy_paths.sh                 # the Caddyfile in this checkout
#   CADDYFILE=/path/to/other bash deploy/azure/check_caddy_paths.sh   # another file
#
# The write password is made up for the run (random, never printed, gone with the
# containers). Exit status 0 only when `caddy validate` says "Valid configuration" and every
# line of the table below came out as expected.
set -u
# Git Bash on Windows rewrites arguments that look like paths ("name:/etc/caddy/Caddyfile");
# this switches that off, and does nothing elsewhere.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/../.." || exit 2
CADDYFILE=${CADDYFILE:-deploy/azure/Caddyfile}
IMAGE=${CADDY_IMAGE:-caddy:2-alpine}
PORT=${CHECK_PORT:-18080}
SUFFIX=$$
NET=ap-caddy-check-$SUFFIX
STUB=ap-caddy-stub-$SUFFIX
SUT=ap-caddy-sut-$SUFFIX
fail=0

cleanup() { docker rm -f "$STUB" "$SUT" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
trap cleanup EXIT

# --- 1. validate the file the way the README does (the real image, `caddy validate`) -------
PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
HASH=$(docker run --rm "$IMAGE" caddy hash-password --plaintext "$PW") || { echo "cannot make a hash"; exit 2; }
USER_NAME=checker

echo "== caddy validate ($CADDYFILE, $IMAGE)"
docker create --name "$SUT-validate" -e AGENTPULSE_SITE_ADDRESS=http://localhost \
  -e AGENTPULSE_WRITE_USER=$USER_NAME -e AGENTPULSE_WRITE_HASH="$HASH" \
  "$IMAGE" caddy validate --config /etc/caddy/Caddyfile >/dev/null || exit 2
docker cp "$CADDYFILE" "$SUT-validate:/etc/caddy/Caddyfile" || exit 2
docker start -a "$SUT-validate" 2>&1 | grep -E "Valid configuration|Error|error" | head -3
valid=${PIPESTATUS[0]}
docker rm -f "$SUT-validate" >/dev/null 2>&1
[ "$valid" = 0 ] || { echo "caddy validate FAILED"; exit 1; }

# --- 2. a stub for the two upstreams the Caddyfile names (dashboard:5173, chat:8100) -------
# Its Caddyfile travels in an environment variable, so no file has to be copied into it.
STUB_CADDYFILE='{
	admin off
	auto_https off
}
:5173, :8100 {
	respond "reached upstream method={http.request.method} uri={http.request.uri} xff=[{http.request.header.X-Forwarded-For}]"
}'
docker network create "$NET" >/dev/null || exit 2
docker run -d --name "$STUB" --network "$NET" --network-alias dashboard --network-alias chat \
  -e STUB_CADDYFILE="$STUB_CADDYFILE" "$IMAGE" \
  sh -c 'echo "$STUB_CADDYFILE" > /tmp/stub.caddy && exec caddy run --adapter caddyfile --config /tmp/stub.caddy' >/dev/null || exit 2

# --- 3. the Caddyfile under test, with a plain-HTTP site address so no certificate is asked -
docker create --name "$SUT" --network "$NET" -p 127.0.0.1:$PORT:80 \
  -e AGENTPULSE_SITE_ADDRESS=http://localhost \
  -e AGENTPULSE_WRITE_USER=$USER_NAME -e AGENTPULSE_WRITE_HASH="$HASH" \
  "$IMAGE" caddy run --config /etc/caddy/Caddyfile >/dev/null || exit 2
docker cp "$CADDYFILE" "$SUT:/etc/caddy/Caddyfile" && docker start "$SUT" >/dev/null || exit 2
# The site address is http://localhost, and Caddy answers a request for any other Host with an
# empty 200, so every request below names localhost (--resolve) and goes to the published port.
CURL=(curl -s --resolve "localhost:$PORT:127.0.0.1")
for _ in $(seq 1 30); do
  "${CURL[@]}" -o /dev/null "http://localhost:$PORT/" && break
  sleep 1
done

# --- 4. the table ------------------------------------------------------------------------
# check <expected status> <method> <path> [extra curl args...]
# --path-as-is stops curl from tidying "/v1//simulate" or "%2f.." before they are sent.
check() {
  local want=$1 method=$2 path=$3; shift 3
  local out got
  # The body comes first and the status code last, split apart below: a temporary file would
  # have to be written by curl and read by bash, which Git Bash on Windows does not share.
  out=$("${CURL[@]}" --path-as-is -w '
%{http_code}' -X "$method" "$@" "http://localhost:$PORT$path")
  got=${out##*$'
'}
  LAST_BODY=${out%$'
'*}
  local mark=ok
  [ "$got" = "$want" ] || { mark=WRONG; fail=1; }
  printf '%-6s %-6s %-34s want %s got %s
' "$mark" "$method" "$path" "$want" "$got"
}

echo
echo "== which requests are asked for the write password (401) and which pass (200)"
# The one exemption.
check 200 POST   /v1/simulate -d '{}'
check 200 POST   '/v1/simulate?scenario=clean' -d '{}'
# Same path, other methods: only POST is exempt.
check 401 PUT    /v1/simulate -d '{}'
check 401 PATCH  /v1/simulate -d '{}'
check 401 DELETE /v1/simulate
# Neighbours and lookalikes of the path: all still need the password.
check 401 POST   /v1/simulate/ -d '{}'
check 401 POST   /v1/simulate/abc -d '{}'
check 401 POST   /v1//simulate -d '{}'
check 401 POST   //v1/simulate -d '{}'
check 401 POST   '/v1/simulate%2f..' -d '{}'
check 401 POST   '/v1/simulate%2F' -d '{}'
check 401 POST   '/v1/simulate;x' -d '{}'
check 401 POST   /v1/Simulate -d '{}'
check 401 POST   /V1/simulate -d '{}'
check 401 POST   /v1/simulate.json -d '{}'
check 401 POST   '/v1/simulatex' -d '{}'
check 401 POST   '/v1/./simulate' -d '{}'
# One spelling of the path itself: %73 is "s", so Caddy, nginx and the backend all read this as
# /v1/simulate. It is the same route, not a way round the exemption.
check 200 POST   '/v1/%73imulate' -d '{}'
check 401 POST   '/v1/x/../simulate' -d '{}'
# Every other write.
check 401 POST   /v1/ingest -d '{}'
check 401 POST   /v1/keys -d '{}'
check 401 DELETE /v1/keys/1
check 401 PATCH  /v1/alerts/1 -d '{}'
check 401 POST   /v1/datasets/x/cases -d '{}'
check 401 POST   /v1/experiments -d '{}'
check 401 POST   / -d '{}'
# Reads stay public; the chat's own exemption is unchanged.
check 200 GET    /v1/alerts
check 200 GET    /v1/simulate/abc
check 200 HEAD   /v1/simulate/abc -I
check 200 POST   /chat/stream -d '{}'
# With the password a write passes, with a wrong one it does not.
check 200 POST   /v1/ingest -d '{}' -u "$USER_NAME:$PW"
check 401 POST   /v1/ingest -d '{}' -u "$USER_NAME:wrong"

echo
echo "== X-Forwarded-For: what the upstream sees when a visitor sends their own"
# The stub prints the header it received as xff=[...]. It must hold one address, the one Caddy
# saw (here the Docker gateway), and none of the made-up ones. The body must really be the
# stub's, so that an empty reply cannot pass for "nothing leaked".
xff_case() {
  local label=$1; shift
  check 200 POST /v1/simulate -d '{}' "$@"
  echo "   $LAST_BODY"
  case "$LAST_BODY" in
    *"reached upstream"*) ;;
    *) echo "WRONG  $label: the reply did not come from the stub"; fail=1; return ;;
  esac
  case "$LAST_BODY" in
    *6.6.6.6*|*7.7.7.7*) echo "WRONG  $label: a made-up X-Forwarded-For reached the upstream"; fail=1 ;;
    *) echo "ok     $label: replaced by the address Caddy saw" ;;
  esac
}
xff_case "one header" -H 'X-Forwarded-For: 6.6.6.6'
xff_case "two headers" -H 'X-Forwarded-For: 6.6.6.6' -H 'X-Forwarded-For: 7.7.7.7'
xff_case "a list" -H 'X-Forwarded-For: 6.6.6.6, 7.7.7.7'

echo
[ "$fail" = 0 ] && echo "ALL AS EXPECTED" || echo "SOMETHING WAS NOT AS EXPECTED"
exit "$fail"
