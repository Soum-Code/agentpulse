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

# WHAT THIS FILE IS FOR
# A set of counters about AgentPulse itself, kept in memory. They count ingest requests,
# spans accepted / failed / duplicate, evaluation jobs put on the queue, API requests, and
# server errors (HTTP 500 and above). It also keeps recent timestamps, so it can say how
# many requests or spans arrived per second over the last minute, and recent request times,
# so it can give p50 / p95 / p99 latency. (p95 = a time that about 95 out of 100 requests
# stayed under.)
#
# HOW IT FITS IN
# routers/ingest.py calls COUNTERS.record_ingest. middleware.py (RequestMetricsMiddleware)
# calls COUNTERS.record_api_request. services/platform_health.py and services/readiness.py
# read COUNTERS.snapshot(). COUNTERS is the one shared object at the bottom of this file.
# This file uses only the Python standard library.

from __future__ import annotations

# threading.Lock = lets only one thread change the numbers at a time.
import threading
# time.monotonic = a clock that only moves forward, good for measuring how long something took.
import time
# deque = a list with a maximum length: when it is full, adding a new item drops the oldest.
from collections import deque
from datetime import datetime, timezone
from typing import Any

# Rolling windows are bounded so memory is constant under sustained load.
# The "per second" rates are worked out over the last 60 seconds.
RATE_WINDOW_SECONDS = 60.0
# The most timestamps kept in each rate window. If more events than this arrive inside the
# window, the oldest are dropped, so a rate cannot read above 20,000 / 60 = about 333 a second.
MAX_EVENTS = 20_000
# The most request times (in milliseconds) kept for the latency percentiles.
MAX_LATENCY_SAMPLES = 2_000


# Holds every counter. record_ingest, record_api_request and snapshot take self._lock, so two
# threads cannot damage a number. The leading underscore means "private": other files use the
# ready-made COUNTERS object at the bottom of this file and do not create their own.
class _Counters:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        # Wall-clock start time (UTC, no timezone label), shown in the report.
        self.process_started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        # The start on the monotonic clock. Used to work out how long the process has been up.
        self._start_monotonic = time.monotonic()

        # Cumulative totals since process start.
        # Number of ingest requests (calls to POST /v1/ingest).
        self.ingest_requests = 0
        # Ingest requests in which at least one span failed to save.
        self.ingest_request_errors = 0
        # Spans saved, plus spans that were already stored (duplicates). Failed spans are not
        # counted here.
        self.spans_accepted = 0
        # Spans that raised an error while being saved.
        self.spans_failed = 0
        # Spans whose span_id was already stored. Also counted in spans_accepted.
        self.spans_duplicate = 0
        # New evaluation jobs put on the queue.
        self.jobs_enqueued = 0
        # Ingest requests that had spans to queue and at least one accepted span, but created
        # no new job. Also counted when every span was a duplicate whose job already existed.
        self.enqueue_failures = 0
        # Every HTTP request seen by RequestMetricsMiddleware.
        self.api_requests = 0
        # Requests that ended with status code 500 or above.
        self.api_errors = 0

        # Rolling windows for rate calculation.
        # Each deque holds the monotonic time of past events. One entry per ingest request,
        # one per accepted span, and one per API request.
        self._ingest_events: deque[float] = deque(maxlen=MAX_EVENTS)
        self._span_events: deque[float] = deque(maxlen=MAX_EVENTS)
        self._api_events: deque[float] = deque(maxlen=MAX_EVENTS)

        # Bounded latency samples, kept for percentiles.
        # How long each recent API request took, in milliseconds.
        self._api_latency_ms: deque[float] = deque(maxlen=MAX_LATENCY_SAMPLES)

    # recording

    # Called once for each ingest request, after its spans are saved and its jobs queued
    # (routers/ingest.py). The numbers are for this one request: accepted / failed / duplicate
    # spans, and how many new jobs were queued. enqueue_failed is True when spans were due to
    # be queued, at least one was accepted, and no new job was made (this also happens when
    # every span was a duplicate whose job already existed).
    def record_ingest(self, *, accepted: int, failed: int, duplicates: int,
                      queued: int, enqueue_failed: bool = False) -> None:
        now = time.monotonic()
        # Hold the lock while changing the numbers, so the totals and windows stay consistent.
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
            # One timestamp per accepted span, so the span rate counts spans, not requests.
            for _ in range(accepted):
                self._span_events.append(now)

    # Called once for each API request, after it has finished (middleware.py).
    # duration_ms is how long it took; status_code is the HTTP status that was sent back.
    def record_api_request(self, *, duration_ms: float, status_code: int) -> None:
        now = time.monotonic()
        with self._lock:
            self.api_requests += 1
            # Only 5xx codes (server errors) count as errors. 4xx codes (caller mistakes) do not.
            if status_code >= 500:
                self.api_errors += 1
            self._api_events.append(now)
            self._api_latency_ms.append(duration_ms)

    # reading

    # Average events per second over the last 60 seconds: count the timestamps that are not
    # older than the window, and divide by 60. It always divides by 60, even when the
    # process is younger, so the rate reads low in the first minute after a start.
    def _rate(self, events: deque[float], now: float) -> float:
        cutoff = now - RATE_WINDOW_SECONDS
        recent = sum(1 for t in events if t >= cutoff)
        return round(recent / RATE_WINDOW_SECONDS, 3)

    # The p-th percentile of a list of numbers: sort them, then pick the one at position
    # p% of the way along. The position is rounded to the nearest whole place; there is no
    # averaging between two values. Example: p=50 gives the middle value (the median).
    # An empty list gives None.
    @staticmethod
    def _percentile(values: list[float], p: float) -> float | None:
        if not values:
            return None
        ordered = sorted(values)
        # k = the position to pick, counted from 0, kept inside the list.
        k = min(int(round(p / 100 * (len(ordered) - 1))), len(ordered) - 1)
        return round(ordered[k], 2)

    # Return all the numbers as one plain dictionary (it is sent out as JSON). Keys ending in
    # "_total" count since the process started; keys ending in "_1m" cover the last minute.
    def snapshot(self) -> dict[str, Any]:
        now = time.monotonic()
        # The lock is held while reading, so all the numbers describe the same moment.
        with self._lock:
            # Copy the latency deque into a list so it can be sorted for the percentiles.
            latencies = list(self._api_latency_ms)
            data = {
                "process_started_at": self.process_started_at.isoformat(),
                # Seconds since this process started, on the monotonic clock.
                "uptime_seconds": round(now - self._start_monotonic, 1),
                # Everything about the ingest route (POST /v1/ingest).
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
                # Everything about all HTTP requests, including the latency percentiles.
                "api": {
                    "requests_total": self.api_requests,
                    "server_errors_total": self.api_errors,
                    "requests_per_sec_1m": self._rate(self._api_events, now),
                    # "samples" = how many request times the percentiles use (the newest
                    # MAX_LATENCY_SAMPLES at most, not the whole time since start).
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
            # Running __init__ again sets every total to 0, empties every window, and
            # restarts the start time.
            self.__init__()  # noqa: PLC2801 - deliberate full reset


# The one shared counters object. Every file imports this and does not make its own, so they
# all add to the same numbers. There is one copy per process, so a different process (for
# example the worker) does not share these numbers with the API.
COUNTERS = _Counters()
