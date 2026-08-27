"""API key authentication and rate limiting middleware."""

from __future__ import annotations

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

    PUBLIC_EXACT = {"/", "/docs", "/openapi.json", "/v1/health"}
    PUBLIC_PREFIXES = ("/v1/ws/", "/static", "/assets")

    async def dispatch(self, request: Request, call_next):
        # Skip auth for health check, docs, dashboard, and WebSocket
        path = request.url.path
        if path in self.PUBLIC_EXACT or path.startswith(self.PUBLIC_PREFIXES):
            return await call_next(request)

        # In local dev mode, skip auth for GET requests (dashboard reads)
        if settings.local_dev_mode and request.method == "GET":
            return await call_next(request)

        # Require API key for mutating requests, or all requests when local_dev_mode is False
        api_key = request.headers.get("X-API-Key")
        if not api_key or api_key != settings.api_key:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})

        return await call_next(request)


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
