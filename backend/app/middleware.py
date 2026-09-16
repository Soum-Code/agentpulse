"""API key authentication and rate limiting middleware."""

from __future__ import annotations

import hmac
import logging
import time
from collections import defaultdict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("agentpulse.middleware")


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Validate X-API-Key header on ingest endpoints."""

    # Liveness and readiness are reachable without a key on purpose. They exist
    # for Kubernetes probes, load balancers and uptime monitors, none of which
    # carry credentials -- requiring a key made every such probe report the
    # service permanently unhealthy, which is the exact opposite of what these
    # endpoints are for.
    #
    # /v1/health/evaluator is deliberately NOT public: it reports worker counts,
    # inference backend distribution and degradation reasons. That is
    # operational detail, not a yes/no probe answer.
    PUBLIC_EXACT = {
        "/", "/docs", "/openapi.json",
        "/v1/health", "/v1/health/live", "/v1/health/ready",
    }
    PUBLIC_PREFIXES = ("/v1/ws/", "/static", "/assets")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

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
        request.state.authenticated = (
            (bool(presented) and hmac.compare_digest(presented, settings.api_key))
            or (settings.local_dev_mode and request.method == "GET")
        )

        # Skip auth for health check, docs, dashboard, and WebSocket
        if path in self.PUBLIC_EXACT or path.startswith(self.PUBLIC_PREFIXES):
            return await call_next(request)

        # In local dev mode, skip auth for GET requests (dashboard reads)
        if settings.local_dev_mode and request.method == "GET":
            return await call_next(request)

        # Require API key for mutating requests, or all requests when local_dev_mode is False
        if not presented:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
        if request.state.authenticated:
            return await call_next(request)
        if await _is_valid_issued_key(presented):
            request.state.authenticated = True
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})


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
    from app.database import get_session
    from app.services.api_keys import verify_key

    try:
        async with get_session() as session:
            return await verify_key(session, presented) is not None
    except Exception as exc:  # noqa: BLE001 - authentication must not 500
        logger.error("API key lookup failed: %s", exc)
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple token-bucket rate limiter for ingest endpoint."""

    def __init__(self, app, max_requests: int = 1000, window_seconds: int = 60):
        super().__init__(app)
        self._max = max_requests
        self._window = window_seconds
        self._counts: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/v1/ingest"):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean old entries
        self._counts[client] = [
            t for t in self._counts[client]
            if now - t < self._window
        ]

        if len(self._counts[client]) >= self._max:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded: {self._max} requests per {self._window}s"},
            )

        self._counts[client].append(now)
        return await call_next(request)


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
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            from app.services.runtime_metrics import COUNTERS
            COUNTERS.record_api_request(
                duration_ms=(time.perf_counter() - start) * 1000,
                status_code=status_code,
            )
