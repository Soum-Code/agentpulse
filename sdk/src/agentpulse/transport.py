"""Async HTTP transport with batching, retries, and local fallback.

Design:
- Spans are buffered and flushed in batches (reduces HTTP overhead).
- Uses aiohttp connection pooling for persistent connections.
- On network failure, spans are written to a local JSONL file.
- Transport never blocks the caller — all work is fire-and-forget.
"""

# What this file is for:
#   Holds AsyncTransport, the part of the SDK that really sends spans to the AgentPulse API.
#   Agent code only drops a finished span into a buffer (a waiting list in memory). A
#   background loop later posts the waiting spans in batches to <endpoint>/v1/ingest. If a
#   batch cannot be sent (every try fails, or the API answers with an error), it is
#   appended to a local file instead.
#
# How it fits in:
#   client.py makes one AsyncTransport, starts it and stops it. client.py (end_span),
#   decorators.py, integrations/llm.py and integrations/langgraph.py call enqueue(). It reads
#   the settings from config.py and wraps spans in IngestRequest (schemas/events.py). The API
#   side of the same call is routers/ingest.py in the backend.

from __future__ import annotations

# asyncio runs the background loop and the sleeps. aiohttp is the HTTP client. (json and
# time are imported but not used in this file.)
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional

import aiohttp

from agentpulse.config import AgentPulseConfig
from agentpulse.schemas.events import IngestRequest, SpanPayload

# Messages written with this logger carry the name "agentpulse.transport", so an application
# can turn them up or down on their own.
logger = logging.getLogger("agentpulse.transport")


# The life of a span here: enqueue() puts it in the buffer, _flush() takes the whole buffer,
# _send_with_retry() posts it, and if that fails _write_fallback() saves it to a file.
# "Non-blocking" means enqueue() does no network work and returns at once.
class AsyncTransport:
    """Non-blocking telemetry transport to AgentPulse backend."""

    def __init__(self, config: AgentPulseConfig) -> None:
        # The settings (endpoint, batch size, retries, ...) from config.py.
        self._config = config
        # Spans waiting to be sent, oldest first.
        self._buffer: list[SpanPayload] = []
        # The aiohttp HTTP session. It keeps connections open and reuses them. It is None until
        # start() runs and again after stop().
        self._session: Optional[aiohttp.ClientSession] = None
        # The background task that runs _flush_loop().
        self._flush_task: Optional[asyncio.Task] = None
        # True from start() until stop().
        self._running = False
        # Lets only one _flush() at a time take spans out of the buffer.
        self._lock = asyncio.Lock()
        # Counters, in numbers of spans, shown by the stats property: sent and accepted, failed
        # to send, written to the fallback file, and dropped because the buffer was full.
        self._total_sent = 0
        self._total_failed = 0
        self._total_fallback = 0
        self._total_dropped = 0
        # True after the "buffer is full" warning was logged, so it is logged only once.
        self._warned_overflow = False

    async def start(self) -> None:
        """Start the transport: create HTTP session and flush loop."""
        # Calling start() again while it is running does nothing.
        if self._running:
            return
        # Step 1: open the HTTP session. timeout_seconds is the total time allowed for one
        # request. The headers (JSON content type, and the API key if set) go on every request.
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds),
            headers=self._build_headers(),
        )
        self._running = True
        # Step 2: start the background loop. create_task() schedules it on the running event
        # loop (asyncio's task runner); this call does not wait for it.
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(
            "AgentPulse transport started → %s", self._config.endpoint,
        )

    async def stop(self) -> None:
        """Stop the transport: flush remaining spans and close session."""
        # Step 1: stop the background loop. cancel() asks the task to end, and awaiting it
        # waits until it has. A cancelled task raises CancelledError; that is the expected
        # result here, so it is ignored.
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        # Step 2: send what is still waiting in the buffer.
        await self._flush()
        # Step 3: close the HTTP session, then log the totals.
        if self._session:
            await self._session.close()
            self._session = None
        logger.info(
            "AgentPulse transport stopped. Sent: %d, Failed: %d, Fallback: %d",
            self._total_sent,
            self._total_failed,
            self._total_fallback,
        )

    def enqueue(self, span: SpanPayload) -> None:
        """Add a span to the send buffer. Non-blocking, and bounded.

        The bound matters when the flush loop is not running -- `_ensure_transport`
        returns quietly if there is no event loop to start it on, and then nothing
        ever drains this. Without a ceiling the agent's own process grows until it
        dies, which is the one thing this SDK promises not to do.

        The oldest span goes first: if telemetry is backing up, the recent spans
        are the ones worth keeping. Dropping is counted and reported rather than
        done quietly -- a silent drop would make the console look merely idle.
        """
        # Step 1: the memory cap (max_buffered_spans in config.py). getattr falls back to 10,000
        # if the config object has no such setting.
        limit = getattr(self._config, "max_buffered_spans", 10_000)
        # Step 2: buffer at the cap. pop(0) removes the oldest span (the first in the list) and
        # it is counted as dropped. The warning is logged only the first time.
        if len(self._buffer) >= limit:
            self._buffer.pop(0)
            self._total_dropped += 1
            if not self._warned_overflow:
                self._warned_overflow = True
                logger.warning(
                    "AgentPulse span buffer reached %d and is dropping the oldest "
                    "span per new one. The transport is not draining -- usually "
                    "because it was never started (no running event loop when "
                    "AgentPulse was constructed), or because the backend is "
                    "unreachable. Telemetry is being lost; the agent is not "
                    "affected. Reported once; see stats['total_dropped'] for the count.",
                    limit,
                )

        # Step 3: add the new span at the end.
        self._buffer.append(span)
        # Step 4: send early. Here "full" means batch_size spans are waiting (10 by default),
        # not the max_buffered_spans cap above. create_task() starts _flush() in the background
        # without waiting for it. This only happens while the transport is running; before
        # start() (or after stop()) spans just wait in the buffer.
        # Flush immediately if buffer is full
        if len(self._buffer) >= self._config.batch_size:
            if self._running:
                asyncio.create_task(self._flush())

    # Runs in the background from start() to stop(). Every flush_interval_ms milliseconds
    # (100 by default) it sends whatever is waiting, so a quiet period does not leave spans
    # sitting in the buffer. The loop ends when _running turns False or the task is cancelled.
    async def _flush_loop(self) -> None:
        """Periodically flush buffered spans."""
        interval = self._config.flush_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            if self._buffer:
                await self._flush()

    async def _flush(self) -> None:
        """Send all buffered spans to the backend."""
        # Step 1: under the lock, copy every waiting span into `batch` and empty the buffer.
        # The lock is let go before the network call below, so a flush that is waiting for the
        # network does not stop a second flush from taking the spans that arrive meanwhile.
        async with self._lock:
            if not self._buffer:
                return
            batch = self._buffer.copy()
            self._buffer.clear()

        # Step 2: wrap the batch in the request body. sdk_version is written here as "0.1.0".
        request = IngestRequest(
            spans=batch,
            sdk_version="0.1.0",
            service_name=self._config.service_name,
        )

        # Step 3: send it. If every attempt fails, save the batch to the fallback file. The
        # batch is no longer in the buffer, so this file is its only remaining copy.
        success = await self._send_with_retry(request)
        if not success:
            self._write_fallback(batch)

    async def _send_with_retry(self, request: IngestRequest) -> bool:
        """Send with exponential backoff retries."""
        # Returns True when the API accepted the batch, False otherwise (the caller then writes
        # the fallback file). "Backoff" = wait longer after each failed try.
        url = f"{self._config.endpoint}/v1/ingest"

        # One pass of this loop is one attempt. max_retries is the number of attempts (3 by
        # default), not the number of extra tries after the first.
        for attempt in range(self._config.max_retries):
            try:
                # No HTTP session (never started, or already stopped): give up at once. This
                # path does not add to the failed counter.
                if not self._session:
                    return False

                # model_dump(mode="json") turns the request into plain JSON types: times and
                # enums become text. The reply body (accepted / failed counts) is not read;
                # only the HTTP status is used.
                async with self._session.post(
                    url,
                    json=request.model_dump(mode="json"),
                ) as resp:
                    # 200 or 202 (the API answers 202 Accepted): done. Count the spans as sent.
                    if resp.status in (200, 202):
                        self._total_sent += len(request.spans)
                        return True
                    # 429 = "too many requests": wait 2 ** attempt seconds (1 s, then 2 s, then
                    # 4 s, ...) and try again.
                    elif resp.status == 429:
                        # Rate limited — back off
                        wait = 2 ** attempt
                        logger.warning(
                            "Rate limited, retrying in %ds (attempt %d/%d)",
                            wait, attempt + 1, self._config.max_retries,
                        )
                        await asyncio.sleep(wait)
                    # Any other status (400, 401, 500, ...): no retry, give up on this batch at
                    # once. Log the first 200 characters of the reply, count the spans as
                    # failed and return False.
                    else:
                        body = await resp.text()
                        logger.warning(
                            "Ingest failed: HTTP %d — %s", resp.status, body[:200],
                        )
                        self._total_failed += len(request.spans)
                        return False

            # A network problem: aiohttp.ClientError covers connection errors, and TimeoutError
            # means the request took longer than timeout_seconds. Wait 2 ** attempt * 0.5
            # seconds (0.5 s, then 1 s, then 2 s, ...) and try again.
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                wait = 2 ** attempt * 0.5
                logger.warning(
                    "Transport error: %s, retrying in %.1fs (attempt %d/%d)",
                    exc, wait, attempt + 1, self._config.max_retries,
                )
                await asyncio.sleep(wait)

        # Every attempt failed (the waits above also happen after the last attempt). Count the
        # spans as failed; the caller writes them to the fallback file.
        self._total_failed += len(request.spans)
        return False

    # JSONL = "JSON Lines": a text file with one JSON object per line. Mode "a" appends, so
    # lines written earlier stay. The folder is created if it does not exist. Nothing in the
    # SDK reads this file back or sends its spans again.
    def _write_fallback(self, spans: list[SpanPayload]) -> None:
        """Write spans to local JSONL file as fallback."""
        # Only OSError is caught (disk full, no permission, bad path). It is logged and the
        # spans are lost, but the agent code is not affected.
        try:
            path = Path(self._config.fallback_file)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                # model_dump_json() writes one span as JSON text.
                for span in spans:
                    f.write(span.model_dump_json() + "\n")
            self._total_fallback += len(spans)
            logger.info(
                "Wrote %d spans to fallback file: %s",
                len(spans), self._config.fallback_file,
            )
        except OSError as exc:
            logger.error("Fallback write failed: %s", exc)

    # Headers sent with every request. The body is JSON. If an API key is set, it goes in the
    # X-API-Key header, which the API's middleware.py checks.
    def _build_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["X-API-Key"] = self._config.api_key
        return headers

    # A snapshot of the counters in a new dict. "buffered" is how many spans are waiting
    # right now; the rest are running totals in spans. AgentPulse.stats returns this.
    @property
    def stats(self) -> dict[str, int]:
        return {
            "buffered": len(self._buffer),
            "total_sent": self._total_sent,
            "total_failed": self._total_failed,
            "total_fallback": self._total_fallback,
            # Spans discarded because the buffer hit its ceiling. Non-zero means
            # telemetry was lost, which is worth knowing before concluding the
            # console is simply quiet.
            "total_dropped": self._total_dropped,
        }
