"""Size limits on POST /v1/ingest: body bytes, spans per request, field lengths.

In short: a request over a limit gets 413 and {"detail": "<one plain sentence>"}, nothing is
stored, and the defaults are wide enough for everything the SDK can send. The limits are in
backend/app/config.py (ingest_max_*), each with an AGENTPULSE_INGEST_MAX_* environment variable,
and 0 switches one off. The WebSocket limits are in tests/test_websocket_limits.py.
"""

import json
import os
import sys
import uuid

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func
from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

from app.config import BackendConfig, settings
from app.database import get_session, init_db
from app.main import create_app
from app.models import Span


def _span(trace_id: str, n: int = 0, **fields) -> dict:
    return {"trace_id": trace_id, "span_id": f"{trace_id}-{n}", "agent_id": "limit-tester", **fields}


@pytest_asyncio.fixture
async def client():
    """An app with its own middleware stack, and a key that the dev-mode backend accepts."""
    await init_db()
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key}
    ) as c:
        yield c


async def _stored(trace_id: str) -> int:
    async with get_session() as session:
        return (
            await session.execute(
                select(func.count()).select_from(Span).where(Span.trace_id == trace_id)
            )
        ).scalar_one()


# ── the defaults fit what the SDK sends ───────────────────────────────────────────────────


def test_the_defaults_fit_the_sdks_worst_case_span_and_a_full_batch():
    """The numbers in config.py are derived from the SDK. If the SDK's ceilings ever move, this
    fails and says the defaults must be looked at again."""
    from agentpulse.config import CapturePolicy
    from agentpulse.schemas.events import IngestRequest, SpanPayload

    cfg = BackendConfig()
    # Every text field as long as the SDK can make it: max_field_length plus the
    # "...[TRUNCATED]" marker (14 characters); error_message is cut at 500 by the SDK.
    text = "x" * (CapturePolicy().max_field_length + len("...[TRUNCATED]"))
    worst = SpanPayload(
        trace_id="t" * 32, span_id="s" * 16, agent_id="a" * 64,
        input_summary=text, output_summary=text, tool_args=text,
        tool_result_summary="r" * 203, error_message="e" * 500,
        metadata={"output_captured": True},
    )
    one = worst.model_dump(mode="json")
    assert max(len(one[f]) for f in ("input_summary", "output_summary", "tool_args")) <= cfg.ingest_max_text_chars
    assert len(one["agent_id"]) <= cfg.ingest_max_label_chars
    assert len(json.dumps(one["metadata"])) <= cfg.ingest_max_metadata_chars

    # A request of exactly the allowed number of such spans must also fit in the body limit.
    body = json.dumps(IngestRequest(spans=[worst] * cfg.ingest_max_spans).model_dump(mode="json"))
    assert len(body.encode()) <= cfg.ingest_max_body_bytes


@pytest.mark.asyncio
async def test_a_worst_case_sdk_span_is_accepted(client):
    from agentpulse.schemas.events import SpanPayload

    trace_id = uuid.uuid4().hex
    text = "x" * 2014
    span = SpanPayload(
        trace_id=trace_id, span_id=uuid.uuid4().hex[:16], agent_id="sdk-worst-case",
        input_summary=text, output_summary=text, tool_args=text,
        tool_result_summary="r" * 203, error_message="e" * 500,
    )
    reply = await client.post("/v1/ingest", json={"spans": [span.model_dump(mode="json")]})
    assert reply.status_code == 202
    assert reply.json()["accepted"] == 1


# ── spans per request ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_too_many_spans_is_413_with_a_plain_sentence_and_stores_nothing(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_spans", 3)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(trace_id, n) for n in range(4)]}
    )
    assert reply.status_code == 413
    detail = reply.json()["detail"]
    assert isinstance(detail, str)
    assert "4" in detail and "3" in detail and "batches" in detail
    assert await _stored(trace_id) == 0


@pytest.mark.asyncio
async def test_exactly_the_span_limit_is_accepted(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_spans", 3)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(trace_id, n) for n in range(3)]}
    )
    assert reply.status_code == 202
    assert await _stored(trace_id) == 3


@pytest.mark.asyncio
async def test_zero_switches_the_span_limit_off(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_spans", 0)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(trace_id, n) for n in range(5)]}
    )
    assert reply.status_code == 202


# ── field lengths ────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field", ["input_summary", "output_summary", "error_message", "tool_args", "tool_result_summary"]
)
async def test_a_text_field_over_the_limit_is_413_and_names_the_span_and_field(client, monkeypatch, field):
    monkeypatch.setattr(settings, "ingest_max_text_chars", 50)
    trace_id = uuid.uuid4().hex
    huge = "SECRET-LOOKING-CONTENT-" * 20
    spans = [_span(trace_id, 0), _span(trace_id, 1, **{field: huge})]
    reply = await client.post("/v1/ingest", json={"spans": spans})
    assert reply.status_code == 413
    detail = reply.json()["detail"]
    assert isinstance(detail, str)
    assert field in detail and "Span 1" in detail and "50" in detail
    # The reply names the span by position and never copies the offending value back.
    assert "SECRET-LOOKING-CONTENT" not in reply.text
    assert await _stored(trace_id) == 0, "the first span was fine but the batch is refused as a whole"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["agent_id", "agent_role", "pipeline_id", "model", "tool_name", "span_id", "trace_id"])
async def test_a_label_field_over_the_limit_is_413(client, monkeypatch, field):
    # 40 is above the 34-character ids the helper builds, so only the field under test is too long.
    monkeypatch.setattr(settings, "ingest_max_label_chars", 40)
    spans = [_span(uuid.uuid4().hex)]
    spans[0][field] = "L" * 41
    reply = await client.post("/v1/ingest", json={"spans": spans})
    assert reply.status_code == 413
    assert field in reply.json()["detail"]


@pytest.mark.asyncio
async def test_a_service_name_over_the_limit_is_413(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_label_chars", 40)
    reply = await client.post(
        "/v1/ingest", json={"service_name": "n" * 41, "spans": [_span(uuid.uuid4().hex)]}
    )
    assert reply.status_code == 413
    assert "service_name" in reply.json()["detail"]


@pytest.mark.asyncio
async def test_metadata_over_the_limit_is_413(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_metadata_chars", 100)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(trace_id, 0, metadata={"blob": "m" * 200})]}
    )
    assert reply.status_code == 413
    assert "metadata" in reply.json()["detail"]
    assert await _stored(trace_id) == 0


@pytest.mark.asyncio
async def test_a_field_exactly_at_the_limit_is_accepted(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_text_chars", 50)
    monkeypatch.setattr(settings, "ingest_max_label_chars", 40)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest",
        json={"spans": [_span(trace_id, 0, input_summary="i" * 50, agent_role="r" * 40)]},
    )
    assert reply.status_code == 202


@pytest.mark.asyncio
async def test_zero_switches_the_field_limits_off(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_text_chars", 0)
    monkeypatch.setattr(settings, "ingest_max_label_chars", 0)
    monkeypatch.setattr(settings, "ingest_max_metadata_chars", 0)
    reply = await client.post(
        "/v1/ingest",
        json={"spans": [_span(uuid.uuid4().hex, 0, input_summary="i" * 50_000, agent_role="r" * 5_000,
                              metadata={"blob": "m" * 50_000})]},
    )
    assert reply.status_code == 202


# ── body bytes ───────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_body_over_the_limit_is_413_from_its_content_length(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 2000)
    trace_id = uuid.uuid4().hex
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(trace_id, 0, input_summary="b" * 5000)]}
    )
    assert reply.status_code == 413
    detail = reply.json()["detail"]
    assert isinstance(detail, str) and "2000" in detail
    assert await _stored(trace_id) == 0


@pytest.mark.asyncio
async def test_a_chunked_body_over_the_limit_is_413_while_it_streams(client, monkeypatch):
    """No Content-Length: the bytes are counted as the route reads them."""
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 2000)
    trace_id = uuid.uuid4().hex
    body = json.dumps({"spans": [_span(trace_id, 0, input_summary="c" * 5000)]}).encode()

    async def chunks():
        for i in range(0, len(body), 500):
            yield body[i : i + 500]

    reply = await client.post(
        "/v1/ingest", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert reply.status_code == 413
    assert "2000" in reply.json()["detail"]
    assert await _stored(trace_id) == 0


@pytest.mark.asyncio
async def test_a_body_under_the_limit_still_works(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 5000)
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(uuid.uuid4().hex, 0, input_summary="ok")]}
    )
    assert reply.status_code == 202


@pytest.mark.asyncio
async def test_zero_switches_the_body_limit_off(client, monkeypatch):
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 0)
    reply = await client.post(
        "/v1/ingest", json={"spans": [_span(uuid.uuid4().hex, 0, input_summary="z" * 9000)]}
    )
    assert reply.status_code == 202


@pytest.mark.asyncio
async def test_only_ingest_is_body_limited(client, monkeypatch):
    """The limit is for POST /v1/ingest. Another route reads its body as before."""
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 10)
    reply = await client.get("/v1/metrics")
    assert reply.status_code == 200


@pytest.mark.asyncio
async def test_a_request_without_a_valid_key_is_401_not_413(monkeypatch):
    """The key check runs first, so nobody who cannot write makes the server look at their body."""
    await init_db()
    monkeypatch.setattr(settings, "ingest_max_body_bytes", 10)
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as anonymous:
        reply = await anonymous.post("/v1/ingest", json={"spans": [_span("x" * 32, 0)]})
    assert reply.status_code == 401


@pytest.mark.asyncio
async def test_the_simulate_route_still_runs_through_the_limits(client):
    """POST /v1/simulate builds its spans and reaches ingest_spans. All five scenarios are well
    inside the defaults, including the longest query the route accepts."""
    for scenario in ("clean", "hallucination", "tool_mismatch", "drift", "disagreement"):
        reply = await client.post("/v1/simulate", json={"scenario": scenario, "query": "q" * 500})
        assert reply.status_code == 200, (scenario, reply.text)
        assert reply.json()["failed"] == 0


# ── the settings ─────────────────────────────────────────────────────────────────────────


def test_the_defaults():
    cfg = BackendConfig()
    assert cfg.ingest_max_body_bytes == 10 * 1024 * 1024
    assert cfg.ingest_max_spans == 1000
    assert cfg.ingest_max_text_chars == 10_000
    assert cfg.ingest_max_label_chars == 256
    assert cfg.ingest_max_metadata_chars == 16_384
    assert cfg.ws_max_message_bytes == 1024
    assert cfg.ws_max_connections == 200
    assert cfg.ws_max_connections_per_ip == 20


def test_each_limit_has_its_environment_variable(monkeypatch):
    names = {
        "AGENTPULSE_INGEST_MAX_BODY_BYTES": "ingest_max_body_bytes",
        "AGENTPULSE_INGEST_MAX_SPANS": "ingest_max_spans",
        "AGENTPULSE_INGEST_MAX_TEXT_CHARS": "ingest_max_text_chars",
        "AGENTPULSE_INGEST_MAX_LABEL_CHARS": "ingest_max_label_chars",
        "AGENTPULSE_INGEST_MAX_METADATA_CHARS": "ingest_max_metadata_chars",
        "AGENTPULSE_WS_MAX_MESSAGE_BYTES": "ws_max_message_bytes",
        "AGENTPULSE_WS_MAX_CONNECTIONS": "ws_max_connections",
        "AGENTPULSE_WS_MAX_CONNECTIONS_PER_IP": "ws_max_connections_per_ip",
    }
    for i, env_name in enumerate(names, start=1):
        monkeypatch.setenv(env_name, str(i * 7))
    cfg = BackendConfig()
    assert {attr: getattr(cfg, attr) for attr in names.values()} == {
        attr: i * 7 for i, attr in enumerate(names.values(), start=1)
    }


def test_a_typo_falls_back_to_the_default_and_does_not_stop_the_backend(monkeypatch, caplog):
    monkeypatch.setenv("AGENTPULSE_INGEST_MAX_SPANS", "1000x")
    monkeypatch.setenv("AGENTPULSE_WS_MAX_CONNECTIONS", "")
    with caplog.at_level("ERROR", logger="agentpulse.config"):
        cfg = BackendConfig()
    assert cfg.ingest_max_spans == 1000
    assert cfg.ws_max_connections == 200
    assert "AGENTPULSE_INGEST_MAX_SPANS" in caplog.text


def test_a_negative_number_means_off(monkeypatch):
    monkeypatch.setenv("AGENTPULSE_INGEST_MAX_SPANS", "-1")
    assert BackendConfig().ingest_max_spans == 0
