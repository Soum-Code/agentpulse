"""In-process counters for AgentPulse's own operation.

Answers questions about the *platform*, not about the agents it monitors —
`/v1/metrics` already reports the latter and the two should not be conflated.

WHY IN-MEMORY RATHER THAN A TABLE. Ingestion and API request counts change on
every request. Writing a row per request would make the observability system the
most expensive thing in the request path, and would make the database grow for
the sake of watching the database grow. Counters live in process memory; only
signals that must cross a process boundary (worker liveness, retention runs) are
persisted.

THE HONEST LIMITATION, stated rather than hidden: these counters reset when the
process restarts. `process_started_at` and `uptime_seconds` are reported
alongside them so a reader can tell whether "12 ingestion failures" means twelve
in ten minutes or twelve since last Tuesday. Rates over a short window are
computed separately from a bounded ring of timestamps, so they stay meaningful
regardless of uptime.

Everything here is thread-safe: FastAPI serves requests on an event loop but the
evaluation path uses a thread pool, and a torn counter would be a bug in the
thing meant to detect bugs.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

# Rolling windows are bounded so memory is constant under sustained load.
RATE_WINDOW_SECONDS = 60.0
MAX_EVENTS = 20_000
MAX_LATENCY_SAMPLES = 2_000


class _Counters:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.process_started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._start_monotonic = time.monotonic()

        # Cumulative totals since process start.
        self.ingest_requests = 0
        self.ingest_request_errors = 0
        self.spans_accepted = 0
        self.spans_failed = 0
        self.spans_duplicate = 0
        self.jobs_enqueued = 0
        self.enqueue_failures = 0
        self.api_requests = 0
        self.api_errors = 0

        # Rolling windows for rate calculation.
        self._ingest_events: deque[float] = deque(maxlen=MAX_EVENTS)
        self._span_events: deque[float] = deque(maxlen=MAX_EVENTS)
        self._api_events: deque[float] = deque(maxlen=MAX_EVENTS)

        # Bounded latency samples, kept for percentiles.
        self._api_latency_ms: deque[float] = deque(maxlen=MAX_LATENCY_SAMPLES)

    # recording

    def record_ingest(self, *, accepted: int, failed: int, duplicates: int,
                      queued: int, enqueue_failed: bool = False) -> None:
        now = time.monotonic()
        with self._lock:
            self.ingest_requests += 1
            self.spans_accepted += accepted
            self.spans_failed += failed
            self.spans_duplicate += duplicates
            self.jobs_enqueued += queued
            if failed:
                self.ingest_request_errors += 1
            if enqueue_failed:
                self.enqueue_failures += 1
            self._ingest_events.append(now)
            for _ in range(accepted):
                self._span_events.append(now)

    def record_api_request(self, *, duration_ms: float, status_code: int) -> None:
        now = time.monotonic()
        with self._lock:
            self.api_requests += 1
            if status_code >= 500:
                self.api_errors += 1
            self._api_events.append(now)
            self._api_latency_ms.append(duration_ms)

    # reading

    def _rate(self, events: deque[float], now: float) -> float:
        cutoff = now - RATE_WINDOW_SECONDS
        recent = sum(1 for t in events if t >= cutoff)
        return round(recent / RATE_WINDOW_SECONDS, 3)

    @staticmethod
    def _percentile(values: list[float], p: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k], 2)

    def snapshot(self) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            latencies = list(self._api_latency_ms)
            data = {
                "process_started_at": self.process_started_at.isoformat(),
                "uptime_seconds": round(now - self._start_monotonic, 1),
                "ingestion": {
                    "requests_total": self.ingest_requests,
                    "requests_with_failures_total": self.ingest_request_errors,
                    "spans_accepted_total": self.spans_accepted,
                    "spans_failed_total": self.spans_failed,
                    "spans_duplicate_total": self.spans_duplicate,
                    "jobs_enqueued_total": self.jobs_enqueued,
                    "enqueue_failures_total": self.enqueue_failures,
                    "requests_per_sec_1m": self._rate(self._ingest_events, now),
                    "spans_per_sec_1m": self._rate(self._span_events, now),
                },
                "api": {
                    "requests_total": self.api_requests,
                    "server_errors_total": self.api_errors,
                    "requests_per_sec_1m": self._rate(self._api_events, now),
                    "latency_ms": {
                        "samples": len(latencies),
                        "p50": self._percentile(latencies, 50),
                        "p95": self._percentile(latencies, 95),
                        "p99": self._percentile(latencies, 99),
                    },
                },
                "note": (
                    "counters are in-process and reset on restart; read them "
                    "against uptime_seconds. Rates are over a 60s window."
                ),
            }
        return data

    def reset(self) -> None:
        """Test-only. Never called by application code."""
        with self._lock:
            self.__init__()  # noqa: PLC2801 - deliberate full reset


COUNTERS = _Counters()
