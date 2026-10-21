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
import socket
import time
from pathlib import Path
from typing import Optional

import aiohttp

from agentpulse.config import AgentPulseConfig
from agentpulse.schemas.events import IngestRequest, SpanPayload

# Messages written with this logger carry the name "agentpulse.transport", so an application
# can turn them up or down on their own.
logger = logging.getLogger("agentpulse.transport")


# aiohttp's resolver asks the event loop for getaddrinfo(), and the loop answers by handing
# the lookup to an executor thread. While the interpreter is exiting that executor is already
# shut down, so the last send of a script (the exit flush) could not look up a host name.
# This object stands in for the loop with the same two methods and answers on the calling
# thread instead. It is only used when the transport runs on a thread of its own, where
# waiting for a lookup holds up nothing but the sender.
class _InlineLoop:
    async def getaddrinfo(self, *args, **kwargs):
        return socket.getaddrinfo(*args, **kwargs)

    async def getnameinfo(self, *args, **kwargs):
        return socket.getnameinfo(*args, **kwargs)


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
        # The background task that runs _flush_loop(), and the event loop it runs on.
        self._flush_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # Set by stop() to wake the flush loop from its wait at once. Made in start(), on the loop.
        self._wake: Optional[asyncio.Event] = None
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
        # Set by AgentPulse when this transport runs on a thread of its own: host names are
        # then looked up on that thread (see _InlineLoop).
        self.resolve_inline = False

    async def start(self) -> None:
        """Start the transport: create HTTP session and flush loop."""
        # Calling start() again while it is running does nothing.
        if self._running:
            return
        # Step 1: open the HTTP session. timeout_seconds is the total time allowed for one
        # request. The headers (JSON content type, and the API key if set) go on every request.
        connector = None
        if self.resolve_inline:
            connector = aiohttp.TCPConnector(resolver=aiohttp.ThreadedResolver(loop=_InlineLoop()))
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds),
            headers=self._build_headers(),
            connector=connector,
        )
        self._running = True
        # Step 2: start the background loop. create_task() schedules it on the running event
        # loop (asyncio's task runner); this call does not wait for it.
        self._loop = asyncio.get_running_loop()
        self._wake = asyncio.Event()
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(
            "AgentPulse transport started → %s", self._config.endpoint,
        )

    def forget_closed_loop(self) -> bool:
        """Drop the sender if the event loop it was started on has been closed.

        asyncio.run(pulse.start()) closes its loop when it returns. The session and the flush
        task go down with it while _running stays True, so nothing would ever send again and
        start() would think the transport is still running. Returns True if it dropped them,
        so that start() can run again. The buffer is kept.
        """
        if not (self._running and self._loop is not None and self._loop.is_closed()):
            return False
        self._running = False
        self._session = None
        self._flush_task = None
        self._loop = None
        return True

    async def stop(self) -> None:
        """Stop the transport: flush remaining spans and close session."""
        # Step 1: stop the background loop. It is woken and left to finish: a send it has
        # already started must run to its end, because the batch it took is no longer in the
        # buffer and cancelling the send would lose those spans.
        self._running = False
        try:
            if self._flush_task:
                self._wake.set()
                await self._flush_task
            # Final flush
            # Step 2: send what is still waiting in the buffer.
            await self._flush()
        finally:
            # Step 3: close the HTTP session (also when stop() itself is cancelled, for example
            # because it ran out of time), then log the totals.
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

        The bound matters when the flush loop is not running -- the client was never
        started, or the backend is unreachable -- and nothing drains this. Without a
        ceiling the agent's own process grows until it dies, which is the one thing
        this SDK promises not to do.

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
                    "because it was never started (call `await pulse.start()`), or "
                    "because the backend is unreachable. Telemetry is being lost; the agent is not "
                    "affected. Reported once; see stats['total_dropped'] for the count.",
                    limit,
                )

        # Step 3: add the new span at the end. That is all: sending is left to _flush_loop,
        # which wakes every flush_interval_ms. enqueue() can be called from any thread (a sync
        # node run by asyncio.to_thread or by LangGraph's executor, a Flask worker), where
        # there is no event loop to start a send on, so it must not touch asyncio. list.append
        # is safe across threads.
        self._buffer.append(span)

    # Runs in the background from start() to stop(). Every flush_interval_ms milliseconds
    # (100 by default) it sends whatever is waiting. This is the only thing that sends while
    # the transport runs. The loop ends when _running turns False (stop() also wakes it from
    # its wait) or the task is cancelled.
    async def _flush_loop(self) -> None:
        """Periodically flush buffered spans."""
        interval = self._config.flush_interval_ms / 1000.0
        while self._running:
            try:
                await asyncio.wait_for(self._wake.wait(), interval)
            except asyncio.TimeoutError:
                pass
            if self._buffer:
                await self._flush()

    async def _flush(self) -> None:
        """Send all buffered spans to the backend."""
        # Step 1: under the lock, take every waiting span into `batch` and leave a new empty
        # list behind. Swapping the two lists in one step means a span that another thread
        # enqueues at the same moment lands either in `batch` or in the new buffer, never in
        # the gap between a copy and a clear. The lock is let go before the network call below,
        # so a flush that is waiting for the network does not stop a second flush from taking
        # the spans that arrive meanwhile.
        async with self._lock:
            if not self._buffer:
                return
            batch, self._buffer = self._buffer, []

        # Steps 2 and 3 are guarded: whatever goes wrong with one batch must not end the flush
        # loop that every later batch depends on.
        try:
            # Step 2: wrap the batch in the request body. sdk_version is written here as "0.1.0".
            request = IngestRequest(
                spans=batch,
                sdk_version="0.1.0",
                service_name=self._config.service_name,
            )

            # Step 3: send it. If every attempt fails, save the batch to the fallback file. The
            # batch is no longer in the buffer, so this file is its only remaining copy. The same
            # goes for a send that is cancelled half way (a stop that ran out of time).
            try:
                success = await self._send_with_retry(request)
            except asyncio.CancelledError:
                self._write_fallback(batch)
                raise
            if not success:
                self._write_fallback(batch)
        except Exception as exc:
            # For example a span whose metadata holds an object that cannot be turned into
            # JSON (start_span(**kwargs) accepts anything). Sending it again would fail the same
            # way, so the batch is counted as failed and dropped; the loop carries on.
            self._total_failed += len(batch)
            logger.error("AgentPulse dropped a batch of %d spans: %s", len(batch), exc)

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
                    # 429 = "too many requests", or a 5xx (the backend is restarting or behind a
                    # proxy that is, for example 502/503 during a deploy): wait 2 ** attempt
                    # seconds (1 s, then 2 s, then 4 s, ...) and try again. Sending a batch twice
                    # is safe, because the backend skips span ids it already has.
                    elif resp.status == 429 or resp.status >= 500:
                        # Rate limited or backend unavailable — back off
                        wait = 2 ** attempt
                        logger.warning(
                            "Ingest answered HTTP %d, retrying in %ds (attempt %d/%d)",
                            resp.status, wait, attempt + 1, self._config.max_retries,
                        )
                        await asyncio.sleep(wait)
                    # Any other status (400, 401, ...): no retry, give up on this batch at
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
        # Any error is caught (disk full, no permission, bad path, a span that cannot be turned
        # into JSON). It is logged and the spans are lost, but the agent code and the flush loop
        # are not affected.
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
        except Exception as exc:
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
