"""Tests for transport resilience, fallback mechanisms, and security middlewares."""

import os
import tempfile
import pytest
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from agentpulse.config import AgentPulseConfig
from agentpulse.transport import AsyncTransport
from agentpulse.schemas.events import SpanPayload, SpanKind, SpanStatus, EventType
from app.middleware import RateLimitMiddleware, APIKeyMiddleware


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
