"""Async HTTP transport with batching, retries, and local fallback.

Design:
- Spans are buffered and flushed in batches (reduces HTTP overhead).
- Uses aiohttp connection pooling for persistent connections.
- On network failure, spans are written to a local JSONL file.
- Transport never blocks the caller — all work is fire-and-forget.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional

import aiohttp

from agentpulse.config import AgentPulseConfig
from agentpulse.schemas.events import IngestRequest, SpanPayload

logger = logging.getLogger("agentpulse.transport")


class AsyncTransport:
    """Non-blocking telemetry transport to AgentPulse backend."""

    def __init__(self, config: AgentPulseConfig) -> None:
        self._config = config
        self._buffer: list[SpanPayload] = []
        self._session: Optional[aiohttp.ClientSession] = None
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self._total_sent = 0
        self._total_failed = 0
        self._total_fallback = 0

    async def start(self) -> None:
        """Start the transport: create HTTP session and flush loop."""
        if self._running:
            return
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds),
            headers=self._build_headers(),
        )
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(
            "AgentPulse transport started → %s", self._config.endpoint,
        )

    async def stop(self) -> None:
        """Stop the transport: flush remaining spans and close session."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush()
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
        """Add a span to the send buffer. Non-blocking."""
        self._buffer.append(span)
        # Flush immediately if buffer is full
        if len(self._buffer) >= self._config.batch_size:
            if self._running:
                asyncio.create_task(self._flush())

    async def _flush_loop(self) -> None:
        """Periodically flush buffered spans."""
        interval = self._config.flush_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            if self._buffer:
                await self._flush()

    async def _flush(self) -> None:
        """Send all buffered spans to the backend."""
        async with self._lock:
            if not self._buffer:
                return
            batch = self._buffer.copy()
            self._buffer.clear()

        request = IngestRequest(
            spans=batch,
            sdk_version="0.1.0",
            service_name=self._config.service_name,
        )

        success = await self._send_with_retry(request)
        if not success:
            self._write_fallback(batch)

    async def _send_with_retry(self, request: IngestRequest) -> bool:
        """Send with exponential backoff retries."""
        url = f"{self._config.endpoint}/v1/ingest"

        for attempt in range(self._config.max_retries):
            try:
                if not self._session:
                    return False

                async with self._session.post(
                    url,
                    json=request.model_dump(mode="json"),
                ) as resp:
                    if resp.status in (200, 202):
                        self._total_sent += len(request.spans)
                        return True
                    elif resp.status == 429:
                        # Rate limited — back off
                        wait = 2 ** attempt
                        logger.warning(
                            "Rate limited, retrying in %ds (attempt %d/%d)",
                            wait, attempt + 1, self._config.max_retries,
                        )
                        await asyncio.sleep(wait)
                    else:
                        body = await resp.text()
                        logger.warning(
                            "Ingest failed: HTTP %d — %s", resp.status, body[:200],
                        )
                        self._total_failed += len(request.spans)
                        return False

            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                wait = 2 ** attempt * 0.5
                logger.warning(
                    "Transport error: %s, retrying in %.1fs (attempt %d/%d)",
                    exc, wait, attempt + 1, self._config.max_retries,
                )
                await asyncio.sleep(wait)

        self._total_failed += len(request.spans)
        return False

    def _write_fallback(self, spans: list[SpanPayload]) -> None:
        """Write spans to local JSONL file as fallback."""
        try:
            path = Path(self._config.fallback_file)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                for span in spans:
                    f.write(span.model_dump_json() + "\n")
            self._total_fallback += len(spans)
            logger.info(
                "Wrote %d spans to fallback file: %s",
                len(spans), self._config.fallback_file,
            )
        except OSError as exc:
            logger.error("Fallback write failed: %s", exc)

    def _build_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["X-API-Key"] = self._config.api_key
        return headers

    @property
    def stats(self) -> dict[str, int]:
        return {
            "buffered": len(self._buffer),
            "total_sent": self._total_sent,
            "total_failed": self._total_failed,
            "total_fallback": self._total_fallback,
        }
