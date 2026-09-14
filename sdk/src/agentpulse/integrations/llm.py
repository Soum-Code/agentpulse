"""Instrument OpenAI and Anthropic clients directly, without a framework.

Why this exists
---------------
Until now AgentPulse could only see a pipeline built with LangGraph. The
`@monitor` decorator reads its first positional argument as a LangGraph state
dict, and the only real adapter in `integrations/` is the LangGraph one --
`langchain.py` and `crewai.py` raise NotImplementedError. Anyone writing agents
with the OpenAI or Anthropic SDK directly, or with a framework we have no
adapter for, could not use the product at all.

Every one of those agents calls an LLM. Wrapping that call reaches all of them
with one implementation, and it happens to be the most useful place to stand:
the prompt and the completion are exactly the input/output pair the grounding
evaluator needs, so instrumenting here is what makes the grounding signal
available to a user who is not on LangGraph.

What it does not do
-------------------
This wraps a client *instance* rather than patching the library's module
globals. Global patching reaches calls made by code you do not control, which
sounds like a feature until an unrelated library's LLM calls start appearing in
your traces and you cannot turn them off. Wrapping the instance you pass in
keeps the blast radius visible.

Streaming responses are recorded as spans with timing, model and status, but no
output text: the content is not available at call time and consuming the stream
to capture it would change the caller's behaviour. Grounding needs an output, so
a streamed call produces no grounding score. That is stated rather than hidden.
"""

from __future__ import annotations

import functools
import logging
import random
import time
from typing import Any, Callable, Optional

from agentpulse.context import ensure_context
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload
from agentpulse.utils import extract_summary, hash_content, utc_now

logger = logging.getLogger("agentpulse.llm")


class UnsupportedClientError(TypeError):
    """The object passed in is not an OpenAI or Anthropic client."""


# ── provider-specific extraction ─────────────────────────────────────────────
#
# Kept as plain functions returning primitives so that adding a third provider
# means writing two of these, not touching the wrapper logic.


def _openai_prompt(kwargs: dict) -> Optional[str]:
    messages = kwargs.get("messages")
    if not isinstance(messages, list):
        return None
    parts = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        # Vision and tool-call messages carry a list of typed blocks; take the
        # text ones and ignore image payloads, which are not what grounding
        # compares and would bloat the span.
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        if content:
            parts.append(f"{m.get('role', 'user')}: {content}")
    return "\n".join(parts) or None


def _openai_completion(response: Any) -> Optional[str]:
    try:
        choice = response.choices[0]
        return getattr(choice.message, "content", None)
    except Exception:
        return None


def _openai_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None)


def _anthropic_prompt(kwargs: dict) -> Optional[str]:
    parts = []
    system = kwargs.get("system")
    if isinstance(system, str) and system:
        parts.append(f"system: {system}")
    for m in kwargs.get("messages") or []:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        if content:
            parts.append(f"{m.get('role', 'user')}: {content}")
    return "\n".join(parts) or None


def _anthropic_completion(response: Any) -> Optional[str]:
    try:
        blocks = response.content
        return " ".join(
            b.text for b in blocks if getattr(b, "type", None) == "text"
        ) or None
    except Exception:
        return None


def _anthropic_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)


_PROVIDERS = {
    "openai": {
        "path": ("chat", "completions", "create"),
        "prompt": _openai_prompt,
        "completion": _openai_completion,
        "usage": _openai_usage,
    },
    "anthropic": {
        "path": ("messages", "create"),
        "prompt": _anthropic_prompt,
        "completion": _anthropic_completion,
        "usage": _anthropic_usage,
    },
}


def detect_provider(client: Any) -> Optional[str]:
    """Which SDK is this, decided by module path rather than isinstance.

    isinstance would need openai and anthropic imported to test against, which
    would make this module require both libraries to instrument either one.
    """
    module = type(client).__module__ or ""
    root = module.split(".")[0]
    return root if root in _PROVIDERS else None


def _resolve(client: Any, path: tuple[str, ...]) -> tuple[Any, str]:
    """Walk to the object owning the method, so it can be replaced on it."""
    owner = client
    for part in path[:-1]:
        owner = getattr(owner, part)
    return owner, path[-1]


def _build_span(agent_id: str, pipeline_id: Optional[str]) -> SpanPayload:
    ctx = ensure_context(pipeline_id=pipeline_id)
    return SpanPayload(
        trace_id=ctx.trace_id,
        span_id=ctx.create_child_span_id(),
        parent_span_id=ctx.parent_span_id,
        agent_id=agent_id,
        pipeline_id=pipeline_id,
        event_type=EventType.LLM_CALL,
        span_kind=SpanKind.LLM,
        start_time=utc_now(),
        status=SpanStatus.SUCCESS,
    )


def _finalise(
    span: SpanPayload,
    provider: dict,
    kwargs: dict,
    response: Any,
    duration_ms: float,
    privacy,
    config,
) -> None:
    span.end_time = utc_now()
    span.latency_ms = round(duration_ms, 2)
    span.model = kwargs.get("model")

    prompt = provider["prompt"](kwargs)
    completion = provider["completion"](response) if response is not None else None

    # Hashes are always recorded; the text itself only when the capture policy
    # allows it. This is the same split the decorator uses -- a prompt is the
    # most sensitive thing this SDK ever sees, and the flags exist for it.
    max_len = config.capture_policy.max_field_length
    if prompt:
        span.input_hash = hash_content(prompt)
        if privacy.should_capture_input():
            span.input_summary = privacy.redact_text(extract_summary(prompt, max_length=max_len))
    if completion:
        span.output_hash = hash_content(completion)
        if privacy.should_capture_output():
            span.output_summary = privacy.redact_text(
                extract_summary(completion, max_length=max_len)
            )

    tokens_in, tokens_out = provider["usage"](response) if response is not None else (None, None)
    span.tokens_in = tokens_in
    span.tokens_out = tokens_out

    if completion is None and response is not None:
        # Most often a stream. Recorded so the call is not missing from the
        # trace, and marked so an empty output_summary is not read as a bug.
        span.metadata["output_captured"] = False


def instrument_client(
    client: Any,
    transport,
    config,
    privacy,
    agent_id: Optional[str] = None,
) -> Any:
    """Wrap a client's completion method so every call emits a span.

    Returns the same client object. Calling it twice is a no-op rather than
    double-wrapping, which would otherwise emit two spans per call.
    """
    name = detect_provider(client)
    if name is None:
        raise UnsupportedClientError(
            f"{type(client).__module__}.{type(client).__name__} is not an OpenAI or "
            "Anthropic client. Pass the client object itself, for example "
            "OpenAI() or AsyncAnthropic()."
        )

    provider = _PROVIDERS[name]
    owner, method_name = _resolve(client, provider["path"])
    original = getattr(owner, method_name)

    if getattr(original, "__agentpulse_wrapped__", False):
        logger.debug("Client already instrumented; leaving it alone")
        return client

    span_agent_id = agent_id or f"{name}_client"
    is_async = _looks_async(original)

    def _should_skip() -> bool:
        if not config.enabled:
            return True
        return config.sampling_rate < 1.0 and random.random() > config.sampling_rate

    @functools.wraps(original)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        if _should_skip():
            return original(*args, **kwargs)
        span = None
        start = time.perf_counter()
        try:
            span = _build_span(span_agent_id, config.pipeline_id)
        except Exception as exc:
            _fail_open(exc, config)
            return original(*args, **kwargs)

        try:
            response = original(*args, **kwargs)
        except Exception as exc:
            _record_error(span, exc, start, transport, config)
            raise
        _try_emit(span, provider, kwargs, response, start, transport, privacy, config)
        return response

    @functools.wraps(original)
    async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
        if _should_skip():
            return await original(*args, **kwargs)
        span = None
        start = time.perf_counter()
        try:
            span = _build_span(span_agent_id, config.pipeline_id)
        except Exception as exc:
            _fail_open(exc, config)
            return await original(*args, **kwargs)

        try:
            response = await original(*args, **kwargs)
        except Exception as exc:
            _record_error(span, exc, start, transport, config)
            raise
        _try_emit(span, provider, kwargs, response, start, transport, privacy, config)
        return response

    wrapper = async_wrapper if is_async else sync_wrapper
    wrapper.__agentpulse_wrapped__ = True
    setattr(owner, method_name, wrapper)
    logger.info("Instrumented %s client (agent_id=%s)", name, span_agent_id)
    return client


def _looks_async(fn: Callable) -> bool:
    import asyncio
    import inspect

    if asyncio.iscoroutinefunction(fn):
        return True
    # The provider SDKs wrap their methods, so the coroutine flag can sit on the
    # underlying function rather than the bound attribute.
    inner = getattr(fn, "__wrapped__", None) or getattr(fn, "__func__", None)
    return bool(inner and inspect.iscoroutinefunction(inner))


def _fail_open(exc: Exception, config) -> None:
    if config.fail_open:
        logger.error("AgentPulse LLM instrumentation error (fail-open): %s", exc, exc_info=True)
        return
    raise exc


def _record_error(span, exc, start, transport, config) -> None:
    """The failed call is still telemetry, and often the interesting kind."""
    try:
        span.end_time = utc_now()
        span.latency_ms = round((time.perf_counter() - start) * 1000, 2)
        span.status = SpanStatus.ERROR
        span.error_message = f"{type(exc).__name__}: {exc}"[:500]
        transport.enqueue(span)
    except Exception as inner:
        _fail_open(inner, config)


def _try_emit(span, provider, kwargs, response, start, transport, privacy, config) -> None:
    try:
        _finalise(
            span, provider, kwargs, response,
            (time.perf_counter() - start) * 1000, privacy, config,
        )
        transport.enqueue(span)
    except Exception as exc:
        _fail_open(exc, config)
