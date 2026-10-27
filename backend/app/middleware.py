"""API key authentication and rate limiting middleware."""

# WHAT THIS FILE IS FOR
# Four middleware classes. Middleware = code that every HTTP request passes through
# before it reaches the route that handles it, and every response passes through again
# on the way back.
#   APIKeyMiddleware         checks the X-API-Key header; answers 401 if it is missing
#                            or wrong.
#   BodySizeLimitMiddleware  refuses a POST /v1/ingest body above the size limit with 413.
#   RateLimitMiddleware      limits how many requests one client may send to
#                            /v1/ingest; answers 429 when the limit is passed.
#   RequestMetricsMiddleware counts requests, server errors (5xx) and latency for the
#                            platform metrics.
#
# HOW IT FITS IN
# main.py adds all three in create_app(). This file uses config.py (the API key and
# dev mode), services/api_keys.py (issued keys, looked up in the database) and
# services/runtime_metrics.py (the counters).

from __future__ import annotations

# hmac.compare_digest compares two secrets in constant time (see the use below).
import hmac
import logging
import time
from collections import defaultdict

from fastapi import HTTPException, Request
# BaseHTTPMiddleware: write a `dispatch(request, call_next)` method. Calling
# `await call_next(request)` runs the rest of the chain and returns the response.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("agentpulse.middleware")


# Note: the docstring says "ingest endpoints", but the check below covers every path
# except the public ones listed in this class. In local dev mode GET requests are
# also let through without a key.
class APIKeyMiddleware(BaseHTTPMiddleware):
    """Validate X-API-Key header on ingest endpoints."""

    # In short: health probes, the docs and the root page need no key. The detailed
    # /v1/health/evaluator route needs one (except a GET in local dev mode).
    # Liveness and readiness are reachable without a key on purpose. They exist
    # for Kubernetes probes, load balancers and uptime monitors, none of which
    # carry credentials -- requiring a key made every such probe report the
    # service permanently unhealthy, which is the exact opposite of what these
    # endpoints are for.
    #
    # /v1/health/evaluator is deliberately NOT public: it reports worker counts,
    # inference backend distribution and degradation reasons. That is
    # operational detail, not a yes/no probe answer.
    # Paths that need no key when the request path matches one of these exactly.
    PUBLIC_EXACT = {
        "/", "/docs", "/openapi.json",
        "/v1/health", "/v1/health/live", "/v1/health/ready",
    }
    # Paths that need no key when they START with one of these: the live WebSocket
    # feed, and the dashboard's files.
    PUBLIC_PREFIXES = ("/v1/ws/", "/static", "/assets")

    # Runs once for every request. It either returns a 401 answer itself, or calls
    # `call_next` to pass the request on to the next layer and then to the route.
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Step 1: read the key the caller sent (None if there is no header) and work
        # out whether the request counts as authenticated. `request.state` is a
        # per-request notepad; the readiness route reads `authenticated` from it later.
        # Public endpoints still need to know whether a valid key came with the
        # request, so one of them can decide how much detail to return.
        presented = request.headers.get("X-API-Key")
        # Local dev mode already waives auth for reads, so a GET there is as
        # trusted as a keyed request. Treating it as unauthenticated would leave
        # one endpoint redacting detail while every other one returned it.
        #
        # Only the environment key is checked here. Issued keys need a database
        # lookup, and this runs before the public-path check -- doing it here
        # would put a query in front of every health probe and static asset.
        #
        # So `authenticated` is True when either (a) a key was sent and it equals the
        # key from settings, or (b) local dev mode is on and this is a GET. The
        # compare_digest call takes the same time wherever the two texts differ, so
        # the response time does not leak how much of a guessed key was right. It gets
        # bytes because it raises TypeError on a str with a non-ASCII character, and
        # Starlette decodes header bytes as latin-1, so any byte of 0x80 or more would
        # otherwise answer 500 on every path.
        request.state.authenticated = (
            (bool(presented) and hmac.compare_digest(presented.encode(), settings.api_key.encode()))
            or (settings.local_dev_mode and request.method == "GET")
        )

        # Step 2: public paths go straight through.
        # Skip auth for health check, docs, dashboard, and WebSocket
        # (str.startswith accepts a tuple: True if the path starts with any item.)
        if path in self.PUBLIC_EXACT or path.startswith(self.PUBLIC_PREFIXES):
            return await call_next(request)

        # Step 3: in local dev mode, plain reads go through.
        # In local dev mode, skip auth for GET requests (dashboard reads)
        if settings.local_dev_mode and request.method == "GET":
            return await call_next(request)

        # Step 4: everything else needs a valid key. Checks run cheapest first:
        #   (a) no key at all -> 401;
        #   (b) key equals the key from settings -> allowed, no database needed;
        #   (c) /v1/keys is for the key from settings only: the caller picks owner_id,
        #       so an issued key there could mint, list and revoke every owner's keys
        #       -> 401 without a lookup;
        #   (d) otherwise look it up among the keys issued through /v1/keys (at most
        #       one database query) -> allowed and marked authenticated if found;
        #   (e) anything else -> 401. All the 401 answers use the same text.
        # Require API key for mutating requests, or all requests when local_dev_mode is False
        if not presented:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
        if request.state.authenticated:
            return await call_next(request)
        if path.startswith("/v1/keys"):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
        if await _is_valid_issued_key(presented):
            request.state.authenticated = True
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})


# In short: is `presented` one of the keys issued through /v1/keys? Any error counts
# as "no".
async def _is_valid_issued_key(presented: str) -> bool:
    """Check a key against the api_keys table.

    Reached only when the environment key did not match, so an existing
    deployment pays nothing for this. A malformed or unrecognised header is
    rejected by `verify_key` before any query runs, which keeps random traffic
    off the database.

    Fails closed on error, but does not take the request down with it: a broken
    database should return 401 rather than 500, because the caller cannot tell
    the difference and a 500 invites a retry storm against something already
    struggling.
    """
    # These imports sit inside the function, so they run when it is called, not when
    # this file is loaded.
    from app.database import get_session
    from app.services.api_keys import verify_key

    try:
        async with get_session() as session:
            # verify_key returns the matching key row, or None. We only need to know
            # whether a row exists.
            return await verify_key(session, presented) is not None
    except Exception as exc:  # noqa: BLE001 - authentication must not 500
        logger.error("API key lookup failed: %s", exc)
        return False


# In short: stops an oversized body of POST /v1/ingest before it is read into memory. Two
# checks. (1) The Content-Length header: a request that says it is too big is answered 413 at
# once and its body is never read. (2) A body that carries no such header (chunked), or lies
# about it: the bytes are counted as the route reads them, and the 413 is raised as soon as
# the total passes the limit. The limit is settings.ingest_max_body_bytes (0 = off).
# Written as a plain ASGI middleware (not BaseHTTPMiddleware) because only that can see the
# body as it arrives. FastAPI re-raises an HTTPException that comes out of the body read, which
# is why the count raises one: any other error there becomes a vague "400 error parsing the
# body". It sits innermost (added first in main.py), so a request without a valid key is
# answered 401 before anyone reads its body, and the 413 still passes the CORS and metrics layers.
class BodySizeLimitMiddleware:
    # The paths it guards: POST /v1/ingest (and anything below it).
    PATH_PREFIX = "/v1/ingest"

    # In short: keep the app this middleware wraps.
    def __init__(self, app):
        self.app = app

    # In short: runs once per request. Anything that is not POST /v1/ingest goes straight
    # through; an ingest request is refused with 413 if it announces, or turns out to carry,
    # more bytes than the limit.
    async def __call__(self, scope, receive, send):
        limit = settings.ingest_max_body_bytes
        if scope["type"] != "http" or limit <= 0 or not scope["path"].startswith(self.PATH_PREFIX):
            await self.app(scope, receive, send)
            return

        # The sentence the caller reads. size is the announced length, or None when the bytes
        # were counted while streaming and the real total is not known.
        def sentence(size: int | None) -> str:
            is_text = f"Request body is {size} bytes, over" if size is not None else "Request body is over"
            return (
                f"{is_text} the limit of {limit} bytes for POST /v1/ingest. "
                "Send fewer spans per request."
            )

        # Check 1: the size the client announced.
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            response = JSONResponse(status_code=413, content={"detail": sentence(int(declared))})
            await response(scope, receive, send)
            return

        # Check 2: count what really arrives.
        received = 0

        # In short: hands the app the body chunk by chunk and adds up the bytes, so a request
        # that lied about its length (or sent none) is still stopped at the limit.
        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(status_code=413, detail=sentence(None))
            return message

        await self.app(scope, counting_receive, send)


# Note: the docstring says "token-bucket", but the code is a sliding window counter.
# It remembers the time of each recent request per client and counts the ones that
# fall inside the last `window_seconds`. Only paths starting with /v1/ingest are limited.
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple token-bucket rate limiter for ingest endpoint."""

    # max_requests: how many requests one client may make inside the window.
    # window_seconds: the length of the window. main.py passes both from settings.
    def __init__(self, app, max_requests: int = 1000, window_seconds: int = 60):
        super().__init__(app)
        self._max = max_requests
        self._window = window_seconds
        # client address -> times (seconds since 1970) of its recent requests. It lives in
        # this process's memory only, so it is empty again after a restart.
        self._counts: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Step 1: other paths are not limited at all.
        if not request.url.path.startswith("/v1/ingest"):
            return await call_next(request)

        # Step 2: identify the caller by its network address ("unknown" if there is none).
        client = request.client.host if request.client else "unknown"
        now = time.time()

        # Step 3: forget this client's requests that are older than the window.
        # Clean old entries
        self._counts[client] = [
            t for t in self._counts[client]
            if now - t < self._window
        ]

        # Step 4: if the client already used up its allowance inside the window,
        # refuse with 429 (Too Many Requests). A refused request is not recorded.
        if len(self._counts[client]) >= self._max:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded: {self._max} requests per {self._window}s"},
            )

        # Step 5: record this request and let it through.
        self._counts[client].append(now)
        return await call_next(request)


# In short: for every request, note how long it took and its status code, and add
# them to the in-memory counters that the platform metrics read.
class RequestMetricsMiddleware(BaseHTTPMiddleware):
    """Record API request count, server errors and latency.

    Purely in-process (see services/runtime_metrics.py). Measuring the request
    path must not add a database write to the request path, or the monitoring
    becomes the dominant cost of the thing it monitors.

    Recording happens in a `finally` so a handler that raises is still counted --
    an endpoint that always 500s would otherwise be invisible in the metrics
    precisely when it matters most.
    """

    async def dispatch(self, request: Request, call_next):
        # perf_counter is a high-resolution timer, good for measuring short durations.
        start = time.perf_counter()
        # Assume 500 until we see a real answer. If call_next raises an error, this
        # value is what gets recorded.
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            # COUNTERS is one shared object holding the totals (see runtime_metrics.py).
            # The duration is converted from seconds to milliseconds.
            from app.services.runtime_metrics import COUNTERS
            COUNTERS.record_api_request(
                duration_ms=(time.perf_counter() - start) * 1000,
                status_code=status_code,
            )
