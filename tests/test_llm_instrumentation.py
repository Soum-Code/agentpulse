"""Tests for framework-independent LLM client instrumentation.

The OpenAI and Anthropic SDKs are not installed as test dependencies, and
requiring them would make this suite refuse to run over a feature that works by
duck-typing. The fakes below reproduce the two things the instrumentation
actually reads -- the module a client's class comes from, and the shape of the
response object -- which is the whole contract.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import pytest
from agentpulse.client import AgentPulse
from agentpulse.context import TraceContext, set_current_context
from agentpulse.integrations.llm import (
    UnsupportedClientError,
    detect_provider,
    instrument_client,
)
from agentpulse.schemas.enums import SpanKind, SpanStatus


# ── fakes ────────────────────────────────────────────────────────────────────

class _Usage:
    def __init__(self, a, b, openai_style=True):
        if openai_style:
            self.prompt_tokens, self.completion_tokens = a, b
        else:
            self.input_tokens, self.output_tokens = a, b


class _Message:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Message(content)


class _OpenAIResponse:
    def __init__(self, content="the completion"):
        self.choices = [_Choice(content)]
        self.usage = _Usage(11, 22, openai_style=True)


class _TextBlock:
    type = "text"

    def __init__(self, text):
        self.text = text


class _AnthropicResponse:
    def __init__(self, text="the completion"):
        self.content = [_TextBlock(text)]
        self.usage = _Usage(33, 44, openai_style=False)


class _Completions:
    def __init__(self, response=None, raises=None):
        self._response, self._raises = response, raises
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._raises:
            raise self._raises
        return self._response


class _AsyncCompletions(_Completions):
    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._raises:
            raise self._raises
        return self._response


class _Chat:
    def __init__(self, completions):
        self.completions = completions


def _openai_client(response=None, raises=None, is_async=False):
    cls = _AsyncCompletions if is_async else _Completions
    completions = cls(response if response is not None else _OpenAIResponse(), raises)

    class FakeOpenAI:
        def __init__(self):
            self.chat = _Chat(completions)

    # Detection reads the module a client's class was defined in, exactly as it
    # would for the real SDK.
    FakeOpenAI.__module__ = "openai._client"
    return FakeOpenAI(), completions


def _anthropic_client(response=None, raises=None, is_async=False):
    cls = _AsyncCompletions if is_async else _Completions
    messages = cls(response if response is not None else _AnthropicResponse(), raises)

    class FakeAnthropic:
        def __init__(self):
            self.messages = messages

    FakeAnthropic.__module__ = "anthropic._client"
    return FakeAnthropic(), messages


class _RecordingTransport:
    """Stands in for AsyncTransport: the wrapper only ever calls enqueue."""

    def __init__(self):
        self.spans = []

    def enqueue(self, span):
        self.spans.append(span)


def _pulse(capture=True):
    return AgentPulse(
        endpoint="http://localhost:8000",
        capture_inputs=capture,
        capture_outputs=capture,
    )


def _wire(client, pulse):
    transport = _RecordingTransport()
    instrument_client(
        client,
        transport=transport,
        config=pulse.config,
        privacy=pulse._privacy,
    )
    return transport


# ── detection ────────────────────────────────────────────────────────────────

class TestDetection:
    def test_identifies_providers_by_module(self):
        oai, _ = _openai_client()
        ant, _ = _anthropic_client()
        assert detect_provider(oai) == "openai"
        assert detect_provider(ant) == "anthropic"

    def test_unknown_object_is_not_a_provider(self):
        assert detect_provider(object()) is None

    def test_instrumenting_a_non_client_raises(self):
        """Silently instrumenting nothing is the failure mode to avoid.

        The user would see no spans and no error, and conclude the backend was
        broken rather than that the wrong object was passed.
        """
        with pytest.raises(UnsupportedClientError):
            instrument_client(
                object(), transport=_RecordingTransport(),
                config=_pulse().config, privacy=_pulse()._privacy,
            )


# ── span content ─────────────────────────────────────────────────────────────

class TestSpanContent:
    def test_openai_call_emits_one_llm_span(self):
        pulse = _pulse()
        client, inner = _openai_client()
        transport = _wire(client, pulse)

        result = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "what is the capital of France?"}],
        )

        assert isinstance(result, _OpenAIResponse)
        assert len(transport.spans) == 1
        span = transport.spans[0]
        assert span.span_kind == SpanKind.LLM
        assert span.model == "gpt-4o-mini"
        assert span.tokens_in == 11 and span.tokens_out == 22
        assert span.latency_ms is not None
        assert span.status == SpanStatus.SUCCESS
        # The call still reached the real method, unchanged.
        assert inner.calls[0]["model"] == "gpt-4o-mini"

    def test_prompt_and_completion_become_the_grounding_pair(self):
        """This is the reason the feature exists.

        Grounding compares input_summary against output_summary; a wrapped LLM
        call is where both are available without any framework.
        """
        pulse = _pulse(capture=True)
        client, _ = _openai_client(_OpenAIResponse("Paris is the capital."))
        transport = _wire(client, pulse)

        client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "capital of France?"}],
        )

        span = transport.spans[0]
        assert "capital of France?" in span.input_summary
        assert "Paris is the capital." in span.output_summary

    def test_capture_off_keeps_hashes_and_drops_text(self):
        """The flags are for prompts above all else, so they are honoured here."""
        pulse = _pulse(capture=False)
        client, _ = _openai_client()
        transport = _wire(client, pulse)

        client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "secret prompt"}],
        )

        span = transport.spans[0]
        assert span.input_summary is None
        assert span.output_summary is None
        assert span.input_hash is not None
        assert span.output_hash is not None
        assert span.tokens_in == 11

    def test_anthropic_system_prompt_is_included(self):
        pulse = _pulse()
        client, _ = _anthropic_client(_AnthropicResponse("an answer"))
        transport = _wire(client, pulse)

        client.messages.create(
            model="claude-sonnet-4",
            system="you are terse",
            messages=[{"role": "user", "content": "explain gravity"}],
        )

        span = transport.spans[0]
        assert "you are terse" in span.input_summary
        assert "explain gravity" in span.input_summary
        assert span.output_summary == "an answer"
        assert span.tokens_in == 33 and span.tokens_out == 44

    def test_content_blocks_are_flattened_to_their_text(self):
        pulse = _pulse()
        client, _ = _openai_client()
        transport = _wire(client, pulse)

        client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "describe this"},
                {"type": "image_url", "image_url": {"url": "data:..."}},
            ]}],
        )

        span = transport.spans[0]
        assert "describe this" in span.input_summary
        assert "data:" not in span.input_summary


# ── behaviour under failure and repetition ───────────────────────────────────

class TestRobustness:
    def test_failed_call_is_recorded_and_still_raises(self):
        """A failing LLM call is telemetry, and often the interesting kind."""
        pulse = _pulse()
        client, _ = _openai_client(raises=RuntimeError("rate limited"))
        transport = _wire(client, pulse)

        with pytest.raises(RuntimeError, match="rate limited"):
            client.chat.completions.create(model="gpt-4o", messages=[])

        assert len(transport.spans) == 1
        span = transport.spans[0]
        assert span.status == SpanStatus.ERROR
        assert "rate limited" in span.error_message

    def test_instrumenting_twice_does_not_double_count(self):
        pulse = _pulse()
        client, _ = _openai_client()
        transport = _wire(client, pulse)
        instrument_client(
            client, transport=transport,
            config=pulse.config, privacy=pulse._privacy,
        )

        client.chat.completions.create(model="gpt-4o", messages=[])
        assert len(transport.spans) == 1

    def test_streaming_response_is_recorded_without_output(self):
        """A stream's content is not available at call time.

        Consuming it to capture the text would change the caller's behaviour, so
        the span is emitted with the call recorded and the absence marked --
        rather than dropping the call or silently reporting an empty output.
        """
        pulse = _pulse()

        class _Stream:
            pass

        client, _ = _openai_client(_Stream())
        transport = _wire(client, pulse)

        client.chat.completions.create(model="gpt-4o", messages=[], stream=True)

        span = transport.spans[0]
        assert span.output_summary is None
        assert span.metadata.get("output_captured") is False

    def test_disabled_sdk_leaves_the_call_alone(self):
        pulse = AgentPulse(endpoint="http://localhost:8000", enabled=False)
        client, inner = _openai_client()
        transport = _wire(client, pulse)

        client.chat.completions.create(model="gpt-4o", messages=[])

        assert transport.spans == []
        assert len(inner.calls) == 1


# ── async ────────────────────────────────────────────────────────────────────

class TestAsyncClients:
    def test_async_client_is_awaited_and_recorded(self):
        pulse = _pulse()
        client, _ = _openai_client(is_async=True)
        transport = _wire(client, pulse)

        async def run():
            return await client.chat.completions.create(
                model="gpt-4o", messages=[{"role": "user", "content": "hi"}],
            )

        result = asyncio.run(run())
        assert isinstance(result, _OpenAIResponse)
        assert len(transport.spans) == 1
        assert transport.spans[0].span_kind == SpanKind.LLM


# ── trace shape ──────────────────────────────────────────────────────────────

class TestTraceShape:
    def test_llm_span_joins_the_active_trace(self):
        pulse = _pulse()
        client, _ = _openai_client()
        transport = _wire(client, pulse)

        ctx = TraceContext(trace_id="a" * 32)
        set_current_context(ctx)
        client.chat.completions.create(model="gpt-4o", messages=[])

        assert transport.spans[0].trace_id == "a" * 32

    def test_llm_span_nests_under_a_monitored_function(self):
        """The waterfall is a tree only if nested calls know their parent.

        Before the decorator pushed a child context, a call made inside a
        monitored node became its sibling rather than its child.
        """
        pulse = _pulse()
        client, _ = _openai_client()
        transport = _wire(client, pulse)
        set_current_context(TraceContext(trace_id="b" * 32))

        agent_spans = []
        pulse._transport = type(
            "T", (), {"enqueue": lambda _self, s: agent_spans.append(s)}
        )()

        @pulse.monitor(agent_id="researcher")
        def researcher(state):
            client.chat.completions.create(model="gpt-4o", messages=[])
            return {"done": True}

        researcher({})

        llm_span = transport.spans[0]
        agent_span = agent_spans[0]
        assert llm_span.trace_id == agent_span.trace_id
        assert llm_span.parent_span_id == agent_span.span_id
