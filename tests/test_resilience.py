"""Tests for transport resilience, fallback mechanisms, and security middlewares."""

import asyncio
import json
import os
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from agentpulse.config import AgentPulseConfig
from agentpulse.transport import AsyncTransport
from agentpulse.schemas.events import SpanPayload, SpanKind, SpanStatus, EventType
from app.middleware import RateLimitMiddleware, APIKeyMiddleware


class _IngestHandler(BaseHTTPRequestHandler):
    """Plays the backend's /v1/ingest: answers with the next scripted status, 202 by default."""

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        server = self.server
        status = server.statuses.pop(0) if server.statuses else 202
        if status in (200, 202):
            server.batches.append(json.loads(body))
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


class _FakeBackend(ThreadingHTTPServer):
    def __init__(self):
        super().__init__(("127.0.0.1", 0), _IngestHandler)
        self.batches = []   # request bodies that were answered 200/202
        self.statuses = []  # scripted answers, used up front to back
        self.url = f"http://127.0.0.1:{self.server_address[1]}"
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def span_ids(self):
        return [s["span_id"] for batch in self.batches for s in batch["spans"]]

    def wait_for_spans(self, count, timeout=5.0):
        deadline = time.monotonic() + timeout
        while len(self.span_ids()) < count and time.monotonic() < deadline:
            time.sleep(0.02)
        return self.span_ids()


@pytest.fixture
def backend():
    server = _FakeBackend()
    yield server
    server.shutdown()
    server.server_close()


def _span(n=0):
    return SpanPayload(
        trace_id="t" * 16, span_id=f"span{n:012d}", agent_id="agent",
        span_kind=SpanKind.AGENT, event_type=EventType.AGENT_EXECUTION,
    )


class TestTransportThreads:
    def test_enqueue_from_a_worker_thread_while_the_transport_runs(self, backend):
        """A sync node under asyncio.to_thread (or LangGraph's executor) enqueues from a thread.

        enqueue used to call asyncio.create_task once batch_size spans were waiting, which
        raises "no running event loop" in any thread but the loop's own.
        """
        config = AgentPulseConfig(
            endpoint=backend.url, batch_size=2, flush_interval_ms=20, max_retries=1,
        )
        transport = AsyncTransport(config)
        errors = []

        def produce():
            try:
                for n in range(6):
                    transport.enqueue(_span(n))
            except Exception as exc:  # the bug: RuntimeError
                errors.append(exc)

        async def main():
            await transport.start()
            await asyncio.to_thread(produce)
            await transport.stop()

        asyncio.run(main())

        assert errors == []
        assert sorted(backend.span_ids()) == [f"span{n:012d}" for n in range(6)]
        assert transport.stats["total_sent"] == 6

    def test_sync_monitored_node_run_in_a_thread_runs_once_and_is_not_broken(self, backend):
        from agentpulse.context import _current_context
        from agentpulse.decorators import create_monitor_decorator
        from agentpulse.privacy import PrivacyFilter

        _current_context.set(None)
        config = AgentPulseConfig(
            endpoint=backend.url, batch_size=2, flush_interval_ms=20, max_retries=1,
            fail_open=False,  # an SDK error would reach the caller instead of only the log
        )
        transport = AsyncTransport(config)
        calls = []

        @create_monitor_decorator(transport, config, PrivacyFilter(config.capture_policy))
        def node(state):
            calls.append(1)
            return {"done": True}

        async def main():
            await transport.start()
            for _ in range(5):
                assert (await asyncio.to_thread(node, {}))["done"] is True
            await transport.stop()

        asyncio.run(main())

        assert len(calls) == 5
        assert len(backend.span_ids()) == 5


class TestTransportResilience:
    def test_local_fallback_write(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fallback_file = os.path.join(tmpdir, "telemetry_fallback.jsonl")
            config = AgentPulseConfig(
                endpoint="http://localhost:9999",  # non-existent port
                fallback_file=fallback_file,
            )
            transport = AsyncTransport(config)
            
            span = SpanPayload(
                trace_id="test_trace_1234567890abcdef",
                span_id="test_span_456789",
                agent_id="test_agent",
                span_kind=SpanKind.AGENT,
                event_type=EventType.AGENT_EXECUTION,
                status=SpanStatus.SUCCESS,
            )

            # Test direct fallback write
            transport._write_fallback([span])
            
            assert os.path.exists(fallback_file)
            with open(fallback_file, "r", encoding="utf-8") as f:
                content = f.read()
                assert "test_trace_123" in content
                assert "test_agent" in content


class TestSecurityMiddlewares:
    def test_rate_limit_middleware(self):
        app = FastAPI()
        app.add_middleware(RateLimitMiddleware, max_requests=2, window_seconds=60)

        @app.post("/v1/ingest")
        async def ingest(request: Request):
            return {"status": "ok"}

        client = TestClient(app)

        # First 2 requests succeed
        res1 = client.post("/v1/ingest", json={})
        assert res1.status_code == 200
        res2 = client.post("/v1/ingest", json={})
        assert res2.status_code == 200

        # 3rd request gets rate-limited (HTTP 429)
        res3 = client.post("/v1/ingest", json={})
        assert res3.status_code == 429
