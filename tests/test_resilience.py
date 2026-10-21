"""Tests for transport resilience, fallback mechanisms, and security middlewares."""

import asyncio
import json
import os
import subprocess
import sys
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
        time.sleep(server.delay)
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
        self.delay = 0.0    # seconds to wait before answering
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


class TestClientWithoutARunningLoop:
    """A plain script, Flask or Celery has no event loop, so nothing used to start the transport."""

    def test_sync_monitor_sends_its_spans_from_a_thread(self, backend):
        from agentpulse import AgentPulse

        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=20)

        @pulse.monitor(agent_id="sync_node")
        def node(state):
            return {"ok": True}

        try:
            node({})
            node({})
            assert len(backend.wait_for_spans(2)) == 2
        finally:
            pulse._stop_in_thread()

    def test_langgraph_adapter_and_manual_spans_are_sent_too(self, backend):
        from agentpulse import AgentPulse
        from agentpulse.integrations.langgraph import LangGraphAdapter

        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=20)
        adapter = LangGraphAdapter(pulse)
        try:
            adapter.end_agent(adapter.start_agent("planner", input_state={"q": 1}), {"a": 1})
            pulse.end_span(pulse.start_span("manual"))
            assert len(backend.wait_for_spans(2)) == 2
        finally:
            pulse._stop_in_thread()

    def test_stopping_flushes_what_is_still_waiting(self, backend):
        from agentpulse import AgentPulse

        # Slow flush loop: the spans below are still in the buffer when the stop comes.
        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=60_000)

        @pulse.monitor(agent_id="sync_node")
        def node(state):
            return {}

        for _ in range(3):
            node({})
        pulse._stop_in_thread()

        assert len(backend.span_ids()) == 3
        assert pulse._bg_thread is None

    def test_disabled_sdk_starts_no_thread(self):
        from agentpulse import AgentPulse

        pulse = AgentPulse(enabled=False)
        pulse.monitor(agent_id="x")
        assert pulse._bg_thread is None

    @pytest.mark.parametrize("host", ["127.0.0.1", "localhost"])
    def test_spans_are_flushed_at_interpreter_exit(self, backend, host):
        """The real thing: a script that ends right after its last call, with no shutdown().

        With a host name the last send has to look the name up while the interpreter is
        exiting, when no executor thread can be started any more.
        """
        url = backend.url.replace("127.0.0.1", host)
        script = "\n".join([
            "from agentpulse import AgentPulse",
            f"pulse = AgentPulse(endpoint={url!r}, flush_interval_ms=60000)",
            "@pulse.monitor(agent_id='script_node')",
            "def node(state):",
            "    return {}",
            "node({}); node({})",
        ])
        env = {**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)}
        subprocess.run([sys.executable, "-c", script], check=True, env=env, timeout=60)

        assert len(backend.span_ids()) == 2

    def test_start_and_shutdown_inside_a_loop_still_work_after_a_thread_start(self, backend):
        """@monitor runs at import time (no loop), asyncio.run(main()) comes later."""
        from agentpulse import AgentPulse

        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=20)

        @pulse.monitor(agent_id="async_node")
        async def node(state):
            return {}

        assert pulse._bg_thread is not None

        async def main():
            await pulse.start()           # the transport already runs; this must not start a second one
            await node({})
            await node({})
            await pulse.shutdown()        # stops it on its own thread and flushes

        asyncio.run(main())

        assert len(backend.span_ids()) == 2
        assert pulse._bg_thread is None

    @pytest.mark.filterwarnings("ignore::ResourceWarning")  # the session the closed loop left
    def test_a_loop_that_asyncio_run_closed_is_replaced(self, backend):
        """asyncio.run(pulse.start()) leaves the sender on a closed loop; use afterwards must still work."""
        from agentpulse import AgentPulse

        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=20)
        asyncio.run(pulse.start())

        @pulse.monitor(agent_id="sync_node")
        def node(state):
            return {}

        try:
            node({})
            assert len(backend.wait_for_spans(1)) == 1
        finally:
            pulse._stop_in_thread()

    def test_start_and_shutdown_in_one_loop_use_no_thread(self, backend):
        from agentpulse import AgentPulse

        pulse = AgentPulse(endpoint=backend.url, flush_interval_ms=20)

        async def main():
            await pulse.start()

            @pulse.monitor(agent_id="async_node")
            async def node(state):
                return {}

            await node({})
            await pulse.shutdown()

        asyncio.run(main())

        assert pulse._bg_thread is None
        assert len(backend.span_ids()) == 1


class TestTransportStop:
    def _transport(self, backend, tmp_path, **overrides):
        config = AgentPulseConfig(
            endpoint=backend.url, flush_interval_ms=20, max_retries=1,
            fallback_file=str(tmp_path / "fallback.jsonl"), **overrides,
        )
        return AsyncTransport(config)

    def test_stop_lets_the_send_in_progress_finish(self, backend, tmp_path):
        """The batch the flush loop has already taken is not in the buffer: cancelling lost it."""
        backend.delay = 0.4
        transport = self._transport(backend, tmp_path)

        async def main():
            await transport.start()
            transport.enqueue(_span(1))
            await asyncio.sleep(0.15)   # the loop has taken the span and is waiting for the reply
            assert transport.stats["buffered"] == 0
            await transport.stop()

        asyncio.run(main())

        assert transport.stats["total_sent"] == 1
        assert transport.stats["total_fallback"] == 0

    def test_stop_does_not_wait_out_a_long_flush_interval(self, backend, tmp_path):
        transport = self._transport(backend, tmp_path)
        transport._config.flush_interval_ms = 60_000

        async def main():
            await transport.start()
            started = time.monotonic()
            await transport.stop()
            return time.monotonic() - started

        assert asyncio.run(main()) < 5

    def test_a_send_that_is_cancelled_goes_to_the_fallback_file(self, backend, tmp_path):
        backend.delay = 2.0
        transport = self._transport(backend, tmp_path)

        async def main():
            await transport.start()
            transport.enqueue(_span(7))
            flushing = asyncio.create_task(transport._flush())
            await asyncio.sleep(0.2)
            flushing.cancel()
            with pytest.raises(asyncio.CancelledError):
                await flushing
            await transport.stop()

        asyncio.run(main())

        assert "span000000000007" in (tmp_path / "fallback.jsonl").read_text()


class TestTransportRetries:
    def _run(self, backend, tmp_path, statuses):
        backend.statuses = list(statuses)
        config = AgentPulseConfig(
            endpoint=backend.url, flush_interval_ms=20, max_retries=3,
            fallback_file=str(tmp_path / "fallback.jsonl"),
        )
        transport = AsyncTransport(config)

        async def main():
            await transport.start()
            transport.enqueue(_span(3))
            await transport.stop()

        asyncio.run(main())
        return transport

    def test_a_502_from_a_restarting_backend_is_retried(self, backend, tmp_path):
        """Caddy answers 502/503 for a few seconds during a deploy; one retry later it works."""
        transport = self._run(backend, tmp_path, [502])

        assert backend.span_ids() == ["span000000000003"]
        assert transport.stats["total_sent"] == 1
        assert transport.stats["total_fallback"] == 0

    def test_a_client_error_is_not_retried(self, backend, tmp_path):
        transport = self._run(backend, tmp_path, [400, 202])

        assert backend.span_ids() == []          # the 202 behind the 400 was never asked for
        assert transport.stats["total_fallback"] == 1


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
