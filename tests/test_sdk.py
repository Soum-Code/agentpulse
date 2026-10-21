"""Tests for AgentPulse SDK components."""

import asyncio
import json
import os
import sys

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import pytest
from agentpulse.config import AgentPulseConfig, CapturePolicy
from agentpulse.context import TraceContext, ensure_context, set_current_context
from agentpulse.decorators import create_monitor_decorator
from agentpulse.privacy import PrivacyFilter
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload, IngestRequest
from agentpulse.transport import AsyncTransport
from agentpulse.utils import (
    generate_trace_id,
    generate_span_id,
    hash_content,
    safe_serialize,
    sanitize_state,
    extract_summary,
)


# ─── Utils Tests ──────────────────────────────────────────────────────

class TestUtils:
    def test_generate_trace_id_format(self):
        tid = generate_trace_id()
        assert len(tid) == 32
        assert all(c in "0123456789abcdef" for c in tid)

    def test_generate_span_id_format(self):
        sid = generate_span_id()
        assert len(sid) == 16
        assert all(c in "0123456789abcdef" for c in sid)

    def test_hash_content(self):
        h = hash_content("test content")
        assert h.startswith("sha256:")
        assert len(h) == 23  # "sha256:" + 16 chars

    def test_hash_content_deterministic(self):
        h1 = hash_content("same input")
        h2 = hash_content("same input")
        assert h1 == h2

    def test_hash_content_different(self):
        h1 = hash_content("input a")
        h2 = hash_content("input b")
        assert h1 != h2

    def test_safe_serialize_dict(self):
        result = safe_serialize({"key": "value"})
        assert result is not None
        assert "key" in result

    def test_safe_serialize_none(self):
        assert safe_serialize(None) is None

    def test_safe_serialize_truncation(self):
        result = safe_serialize("x" * 5000, max_length=100)
        assert result is not None
        assert len(result) <= 120  # 100 + truncation message
        assert "TRUNCATED" in result

    def test_safe_serialize_non_serializable(self):
        result = safe_serialize(lambda: None)
        assert result is not None  # Falls back to str()

    def test_sanitize_state_removes_private_keys(self):
        state = {
            "messages": ["hello"],
            "api_key": "secret",
            "__internal": "private",
        }
        result = sanitize_state(state)
        assert "messages" in result
        assert "api_key" not in result
        assert "__internal" not in result

    def test_sanitize_state_not_dict(self):
        assert sanitize_state("not a dict") == {}

    def test_extract_summary_short(self):
        assert extract_summary("short text") == "short text"

    def test_extract_summary_long(self):
        text = "x" * 500
        result = extract_summary(text, max_length=100)
        assert len(result) == 103  # 100 + "..."

    def test_extract_summary_none(self):
        assert extract_summary(None) is None


# ─── Config Tests ─────────────────────────────────────────────────────

class TestConfig:
    def test_default_config(self):
        config = AgentPulseConfig()
        assert config.endpoint == "http://localhost:8000"
        assert config.enabled is True
        assert config.fail_open is True
        assert config.sampling_rate == 1.0

    def test_capture_policy_defaults(self):
        policy = CapturePolicy()
        assert policy.capture_inputs is False
        assert policy.capture_outputs is False
        assert policy.max_field_length == 2000
        assert len(policy.redact_patterns) > 0

    def test_env_override(self):
        os.environ["AGENTPULSE_ENDPOINT"] = "http://custom:9000"
        os.environ["AGENTPULSE_ENABLED"] = "false"
        try:
            config = AgentPulseConfig()
            assert config.endpoint == "http://custom:9000"
            assert config.enabled is False
        finally:
            del os.environ["AGENTPULSE_ENDPOINT"]
            del os.environ["AGENTPULSE_ENABLED"]


# ─── Privacy Tests ────────────────────────────────────────────────────

class TestPrivacy:
    def test_email_redaction(self):
        policy = CapturePolicy()
        pf = PrivacyFilter(policy)
        result = pf.redact_text("Contact user@example.com for info")
        assert "user@example.com" not in result
        assert "[REDACTED]" in result

    def test_phone_redaction(self):
        policy = CapturePolicy()
        pf = PrivacyFilter(policy)
        result = pf.redact_text("Call 555-123-4567")
        assert "555-123-4567" not in result

    def test_api_key_redaction(self):
        policy = CapturePolicy()
        pf = PrivacyFilter(policy)
        result = pf.redact_text("Using api_key=sk-12345abc")
        assert "sk-12345abc" not in result

    def test_secrets_in_json_text_are_redacted(self):
        """@monitor turns state into JSON before redacting, so the key is followed by a quote."""
        pf = PrivacyFilter(CapturePolicy())
        text = (
            '{"openai_api_key": "sk-proj-AbCd1234EfGh5678", "password": "hunter2", '
            '"access_token": "tok123", "query": "weather in Pune"}'
        )
        result = pf.redact_text(text)
        for secret in ("sk-proj-AbCd1234EfGh5678", "hunter2", "tok123"):
            assert secret not in result
        assert "weather in Pune" in result  # fields that are not secrets stay

    def test_quoted_secret_with_spaces_is_redacted_whole(self):
        pf = PrivacyFilter(CapturePolicy())
        result = pf.redact_text('{"password": "correct horse battery", "step": 2}')
        assert "horse" not in result
        assert '"step": 2' in result

    def test_bare_sk_key_is_redacted(self):
        pf = PrivacyFilter(CapturePolicy())
        result = pf.redact_text("use sk-proj-AbCd1234EfGh5678 now")
        assert "sk-proj-AbCd1234EfGh5678" not in result
        assert result.startswith("use ") and result.endswith(" now")

    def test_bearer_token_is_redacted(self):
        pf = PrivacyFilter(CapturePolicy())
        result = pf.redact_text("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2lnbmF0dXJl")
        assert "eyJhbGciOiJIUzI1NiJ9" not in result

    def test_ordinary_prose_is_left_alone(self):
        pf = PrivacyFilter(CapturePolicy())
        text = "The bearer of bad news said the password was wrong and max_tokens was 500."
        assert pf.redact_text(text) == text

    def test_truncation(self):
        policy = CapturePolicy(max_field_length=50)
        pf = PrivacyFilter(policy)
        result = pf.redact_text("x" * 200)
        assert len(result) < 200
        assert "TRUNCATED" in result

    def test_filter_dict_excludes_keys(self):
        policy = CapturePolicy()
        pf = PrivacyFilter(policy)
        data = {"name": "John", "password": "secret123", "api_key": "key"}
        result = pf.filter_dict(data)
        assert result["password"] == "[FILTERED]"
        assert result["api_key"] == "[FILTERED]"
        assert result["name"] == "John"

    def test_none_input(self):
        policy = CapturePolicy()
        pf = PrivacyFilter(policy)
        assert pf.redact_text(None) is None
        assert pf.redact_text("") == ""


# ─── Context Tests ────────────────────────────────────────────────────

class TestContext:
    def test_create_context(self):
        ctx = TraceContext()
        assert len(ctx.trace_id) == 32
        assert ctx.parent_span_id is None
        assert ctx.span_count == 0

    def test_create_child_span(self):
        ctx = TraceContext()
        sid = ctx.create_child_span_id()
        assert len(sid) == 16
        assert ctx.span_count == 1

    def test_child_context(self):
        parent = TraceContext()
        child = parent.child(parent_span_id="abc123")
        assert child.trace_id == parent.trace_id
        assert child.parent_span_id == "abc123"

    def test_ensure_context_from_state(self):
        state = {
            "__agentpulse_trace_id": "test_trace_id_0123456789abcdef",
            "__agentpulse_parent_span_id": "parent_span_id1",
        }
        ctx = ensure_context(state)
        assert ctx.trace_id == "test_trace_id_0123456789abcdef"
        assert ctx.parent_span_id == "parent_span_id1"

    def test_ensure_context_creates_new(self):
        from agentpulse.context import _current_context
        _current_context.set(None)  # Reset any leaked context from prior test
        ctx = ensure_context(state=None)
        assert ctx is not None
        assert len(ctx.trace_id) == 32


# ─── Schema Tests ─────────────────────────────────────────────────────

class TestSchemas:
    def test_span_payload_creation(self):
        span = SpanPayload(
            trace_id="a" * 32,
            span_id="b" * 16,
            agent_id="test_agent",
        )
        assert span.trace_id == "a" * 32
        assert span.agent_id == "test_agent"
        assert span.status == SpanStatus.SUCCESS

    def test_span_payload_serialization(self):
        span = SpanPayload(
            trace_id="a" * 32,
            span_id="b" * 16,
            agent_id="test_agent",
            latency_ms=42.5,
        )
        data = span.model_dump(mode="json")
        assert data["latency_ms"] == 42.5

    def test_ingest_request(self):
        span = SpanPayload(
            trace_id="a" * 32,
            span_id="b" * 16,
            agent_id="test",
        )
        req = IngestRequest(spans=[span])
        assert len(req.spans) == 1
        assert req.sdk_version == "0.1.0"


# ─── @monitor Tests ───────────────────────────────────────────────────

def _monitor(**config_kwargs):
    """A decorator wired to a transport that is never started, so spans stay in its buffer."""
    config = AgentPulseConfig(**config_kwargs)
    transport = AsyncTransport(config)
    decorator = create_monitor_decorator(
        transport, config, PrivacyFilter(config.capture_policy), agent_id="node",
    )
    return decorator, transport


class TestMonitorErrorPath:
    """A failing user function is the user's error, not an SDK error: run it once, record it."""

    def test_raising_sync_node_runs_once_and_records_an_error_span(self):
        decorator, transport = _monitor()
        calls = []

        @decorator
        def node(state):
            calls.append(1)
            raise ValueError("llm timeout")

        with pytest.raises(ValueError, match="llm timeout"):
            node({"q": "x"})

        assert len(calls) == 1
        assert len(transport._buffer) == 1
        span = transport._buffer[0]
        assert span.status == SpanStatus.ERROR
        assert "ValueError: llm timeout" in span.error_message
        assert span.latency_ms is not None

    def test_raising_async_node_runs_once_and_records_an_error_span(self):
        decorator, transport = _monitor()
        calls = []

        @decorator
        async def node(state):
            calls.append(1)
            raise ValueError("llm timeout")

        with pytest.raises(ValueError, match="llm timeout"):
            asyncio.run(node({"q": "x"}))

        assert len(calls) == 1
        assert [s.status for s in transport._buffer] == [SpanStatus.ERROR]

    def test_sdk_failure_after_a_good_call_does_not_run_the_node_again(self, monkeypatch):
        import agentpulse.decorators as decorators

        def broken(*args, **kwargs):
            raise RuntimeError("sdk bug")

        monkeypatch.setattr(decorators, "_finalize_span", broken)
        decorator, transport = _monitor()
        calls = []

        @decorator
        def node(state):
            calls.append(1)
            return {"ok": True}

        assert node({}) == {"ok": True}
        assert len(calls) == 1

    def test_sdk_failure_is_raised_when_fail_open_is_off(self, monkeypatch):
        import agentpulse.decorators as decorators

        def broken(*args, **kwargs):
            raise RuntimeError("sdk bug")

        monkeypatch.setattr(decorators, "_finalize_span", broken)
        decorator, _ = _monitor(fail_open=False)
        calls = []

        @decorator
        def node(state):
            calls.append(1)
            return {}

        with pytest.raises(RuntimeError, match="sdk bug"):
            node({})
        assert len(calls) == 1


@pytest.fixture
def fresh_context():
    """No current trace context before the test, and none left behind after it."""
    from agentpulse.context import _current_context
    token = _current_context.set(None)
    yield
    _current_context.reset(token)


class TestImplicitContextIsNotSticky:
    """ensure_context() only looks the context up; it must not keep a trace alive for the thread."""

    def test_separate_calls_get_separate_traces(self, fresh_context):
        first = ensure_context()
        second = ensure_context()
        assert first.trace_id != second.trace_id

    def test_nothing_is_left_current_after_reading_ids_from_state(self, fresh_context):
        from agentpulse.context import get_current_context
        ensure_context({"__agentpulse_trace_id": "t" * 32, "__agentpulse_parent_span_id": "p" * 16})
        assert get_current_context() is None

    def test_independent_top_level_monitor_calls_are_separate_traces(self, fresh_context):
        decorator, transport = _monitor()

        @decorator
        def node(state):
            return {}

        node({})
        node({})
        assert len({s.trace_id for s in transport._buffer}) == 2

    def test_nested_monitored_call_is_a_child_in_the_same_trace(self, fresh_context):
        from agentpulse.context import get_current_context
        decorator, transport = _monitor()

        @decorator
        def inner(state):
            return {}

        @decorator
        def outer(state):
            inner({})
            return {}

        outer({})
        inner_span, outer_span = transport._buffer  # the inner span is queued first
        assert inner_span.trace_id == outer_span.trace_id
        assert inner_span.parent_span_id == outer_span.span_id
        assert outer_span.parent_span_id is None
        assert get_current_context() is None  # nothing left behind

    def test_async_runs_in_one_task_are_separate_traces(self, fresh_context):
        decorator, transport = _monitor()

        @decorator
        async def node(state):
            return {}

        async def main():
            for _ in range(3):
                await node({})

        asyncio.run(main())
        assert len({s.trace_id for s in transport._buffer}) == 3
