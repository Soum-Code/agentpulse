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

# What this file is for:
#   Records LLM calls made through an OpenAI or Anthropic client object, with no agent
#   framework. instrument_client() swaps the client's completion method for a wrapper:
#   chat.completions.create for OpenAI, messages.create for Anthropic. The wrapper calls
#   the real method, times it, and queues one span for each call. The span holds the
#   model name and token counts, and the prompt and answer text only if the privacy
#   settings allow it.
#
# How it fits in:
#   AgentPulse.instrument_llm() in client.py calls instrument_client(). This file uses
#   context.py to find the trace, utils.py for hashes and summaries, and the transport
#   (transport.py) to queue the finished span.

from __future__ import annotations

# functools.wraps makes a wrapper look like the method it replaces (same name and docs).
# random is for the sampling coin flip. time.perf_counter() is a stopwatch.
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


# Raised by instrument_client() when the object is not an OpenAI or Anthropic client.
# It is a TypeError subclass, so `except TypeError` catches it too.
class UnsupportedClientError(TypeError):
    """The object passed in is not an OpenAI or Anthropic client."""


# ── provider-specific extraction ─────────────────────────────────────────────
#
# Kept as plain functions returning primitives so that adding a third provider
# means writing two of these, not touching the wrapper logic.


# In: the keyword arguments of one call (model=..., messages=[...]); positional arguments
# are not read. Out: the prompt as one text with a "role: content" line per message, or
# None if there is no text.
def _openai_prompt(kwargs: dict) -> Optional[str]:
    # Step 1: the messages must be a list. If not, there is no prompt.
    messages = kwargs.get("messages")
    if not isinstance(messages, list):
        return None
    parts = []
    # Step 2: go through the messages, skipping anything that is not a dict.
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
        # Step 3: one "role: content" line for each message that has text. A missing role
        # counts as "user".
        if content:
            parts.append(f"{m.get('role', 'user')}: {content}")
    # The lines are joined with newlines. An empty result becomes None.
    return "\n".join(parts) or None


# Out: the text of the first choice (response.choices[0].message.content), or None if it
# cannot be read, for example when the response has no choices.
def _openai_completion(response: Any) -> Optional[str]:
    try:
        choice = response.choices[0]
        return getattr(choice.message, "content", None)
    except Exception:
        return None


# Out: (prompt_tokens, completion_tokens) = tokens in the prompt, tokens in the answer.
# Both are None when the response has no usage information.
def _openai_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None)


# Same idea as _openai_prompt. Anthropic takes the system prompt in its own `system`
# argument, not inside messages, so it is added first as a "system: ..." line. Only a
# plain-text system prompt is used; one given as a list of blocks is left out.
def _anthropic_prompt(kwargs: dict) -> Optional[str]:
    parts = []
    system = kwargs.get("system")
    if isinstance(system, str) and system:
        parts.append(f"system: {system}")
    # `or []` makes a missing messages argument act like an empty list.
    for m in kwargs.get("messages") or []:
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        # A list of typed blocks: keep only the text blocks (see _openai_prompt).
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        if content:
            parts.append(f"{m.get('role', 'user')}: {content}")
    return "\n".join(parts) or None


# Out: the text of all the answer's "text" blocks, joined with spaces. Blocks of any
# other type are skipped. None if there is no text or the response cannot be read.
def _anthropic_completion(response: Any) -> Optional[str]:
    try:
        blocks = response.content
        return " ".join(
            b.text for b in blocks if getattr(b, "type", None) == "text"
        ) or None
    except Exception:
        return None


# Out: (input_tokens, output_tokens). Both are None when the response has no usage info.
def _anthropic_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)


# The two supported providers. The key is the library name (the first part of the
# client class's module name). "path" is the chain of attribute names from the client to
# the method that gets wrapped, for example client.chat.completions.create for OpenAI.
# The other three entries are the reader functions above: how to get the prompt from the
# call's arguments, the answer text from the response, and the token counts.
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


# Out: "openai", "anthropic", or None when the object is neither.
def detect_provider(client: Any) -> Optional[str]:
    """Which SDK is this, decided by module path rather than isinstance.

    isinstance would need openai and anthropic imported to test against, which
    would make this module require both libraries to instrument either one.
    """
    # Step 1: the module the client's class comes from. Its first part is the library name.
    module = type(client).__module__ or ""
    root = module.split(".")[0]
    # Step 2: it counts only if that library name is one of the two supported ones.
    return root if root in _PROVIDERS else None


# Example: for the path ("chat", "completions", "create") this returns the object
# client.chat.completions and the name "create".
def _resolve(client: Any, path: tuple[str, ...]) -> tuple[Any, str]:
    """Walk to the object owning the method, so it can be replaced on it."""
    owner = client
    for part in path[:-1]:
        owner = getattr(owner, part)
    return owner, path[-1]


# Makes the span at the start of a call: finds the trace and parent (ensure_context),
# gives it a new span id and stamps the start time. Kind is LLM. The status starts as
# SUCCESS; _record_error() changes it to ERROR if the call fails.
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


# Fills in the rest of the span after the call returned: timing, model, hashes, the text
# (only if the privacy settings allow it) and token counts. Changes `span` in place.
def _finalise(
    span: SpanPayload,
    provider: dict,
    kwargs: dict,
    response: Any,
    duration_ms: float,
    privacy,
    config,
) -> None:
    # Step 1: end time, latency, and the model name taken from the call's own `model`
    # argument (it is not read from the response).
    span.end_time = utc_now()
    span.latency_ms = round(duration_ms, 2)
    span.model = kwargs.get("model")

    # Step 2: get the prompt and the answer text with this provider's reader functions.
    # With no response there is no answer.
    prompt = provider["prompt"](kwargs)
    completion = provider["completion"](response) if response is not None else None

    # Step 3: record the prompt and the answer.
    # Hashes are always recorded; the text itself only when the capture policy
    # allows it. This is the same split the decorator uses -- a prompt is the
    # most sensitive thing this SDK ever sees, and the flags exist for it.
    # max_len = the longest text allowed for one field (max_field_length in the settings).
    # The hash covers the whole text. The summary is cut to max_len, then redact_text()
    # masks emails, phone numbers and similar (see privacy.py).
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

    # Step 4: token counts (tokens in the prompt, tokens in the answer) from the response.
    tokens_in, tokens_out = provider["usage"](response) if response is not None else (None, None)
    span.tokens_in = tokens_in
    span.tokens_out = tokens_out

    # Step 5: there was a response but no answer text. Besides streams, this also happens
    # when the reply has no text part, for example a reply that only asks to call a tool.
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
    # Step 1: which provider is this? If it is neither OpenAI nor Anthropic, stop with an
    # error rather than silently recording nothing.
    name = detect_provider(client)
    if name is None:
        raise UnsupportedClientError(
            f"{type(client).__module__}.{type(client).__name__} is not an OpenAI or "
            "Anthropic client. Pass the client object itself, for example "
            "OpenAI() or AsyncAnthropic()."
        )

    # Step 2: find the method to replace. _resolve() gives the object that owns it (for
    # example client.chat.completions) and its name ("create"). `original` is the real method.
    provider = _PROVIDERS[name]
    owner, method_name = _resolve(client, provider["path"])
    original = getattr(owner, method_name)

    # Step 3: a method that was wrapped before carries the marker set at the end of this
    # function. Then do nothing, so one call does not produce two spans.
    if getattr(original, "__agentpulse_wrapped__", False):
        logger.debug("Client already instrumented; leaving it alone")
        return client

    # Step 4: the agent id shown on the spans: the one given, else "openai_client" or
    # "anthropic_client". is_async decides which wrapper is built below (an async method
    # must be awaited).
    span_agent_id = agent_id or f"{name}_client"
    is_async = _looks_async(original)

    # True when this call must not be recorded: the SDK is switched off, or sampling picks
    # this call to skip (same rule as @monitor: a random number above sampling_rate skips).
    def _should_skip() -> bool:
        if not config.enabled:
            return True
        return config.sampling_rate < 1.0 and random.random() > config.sampling_rate

    # Step 5a: the wrapper for a normal method. With fail_open on, the caller sees no change:
    # the real response is returned untouched, and an error from the real call is raised again.
    @functools.wraps(original)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        if _should_skip():
            return original(*args, **kwargs)
        span = None
        start = time.perf_counter()
        # Build the span before the call, so it exists even if the call fails. If building
        # fails, _fail_open() logs it (or raises it) and the call runs without a span.
        try:
            span = _build_span(span_agent_id, config.pipeline_id)
        except Exception as exc:
            _fail_open(exc, config)
            return original(*args, **kwargs)

        # Call the real method. On an error, record an error span, then raise the same error.
        try:
            response = original(*args, **kwargs)
        except Exception as exc:
            _record_error(span, exc, start, transport, config)
            raise
        # Success: fill in the span, queue it, and give back the untouched response.
        _try_emit(span, provider, kwargs, response, start, transport, privacy, config)
        return response

    # Step 5b: the same wrapper for an `async def` method, with await.
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

    # Step 6: pick the wrapper that matches the method, mark it so that Step 3 can spot it
    # next time, and put it in place on the owner object. From now on, calling the method
    # (for example client.chat.completions.create) runs the wrapper.
    wrapper = async_wrapper if is_async else sync_wrapper
    wrapper.__agentpulse_wrapped__ = True
    setattr(owner, method_name, wrapper)
    logger.info("Instrumented %s client (agent_id=%s)", name, span_agent_id)
    return client


# True if `fn` is an `async def` method, so that the async wrapper is used. It also checks
# the function underneath (its __wrapped__ or __func__ attribute): see the comment inside.
def _looks_async(fn: Callable) -> bool:
    import asyncio
    import inspect

    if asyncio.iscoroutinefunction(fn):
        return True
    # The provider SDKs wrap their methods, so the coroutine flag can sit on the
    # underlying function rather than the bound attribute.
    inner = getattr(fn, "__wrapped__", None) or getattr(fn, "__func__", None)
    return bool(inner and inspect.iscoroutinefunction(inner))


# One rule for errors inside the SDK's own code: if fail_open is on, log the error and
# carry on; if it is off, raise it.
def _fail_open(exc: Exception, config) -> None:
    if config.fail_open:
        logger.error("AgentPulse LLM instrumentation error (fail-open): %s", exc, exc_info=True)
        return
    raise exc


def _record_error(span, exc, start, transport, config) -> None:
    """The failed call is still telemetry, and often the interesting kind."""
    try:
        # Finish the span as a failed call: end time, latency, status ERROR, and the error as
        # "TypeName: message" cut to 500 characters (not redacted). It has no prompt or answer
        # text, only the error. Then queue it.
        span.end_time = utc_now()
        span.latency_ms = round((time.perf_counter() - start) * 1000, 2)
        span.status = SpanStatus.ERROR
        span.error_message = f"{type(exc).__name__}: {exc}"[:500]
        transport.enqueue(span)
    # If recording itself fails: log it (fail_open on) or raise it (fail_open off).
    except Exception as inner:
        _fail_open(inner, config)


# The success path: fill in the span (_finalise) and queue it. If that fails, _fail_open()
# logs it (fail_open on, so the caller still gets the response) or raises it.
def _try_emit(span, provider, kwargs, response, start, transport, privacy, config) -> None:
    try:
        _finalise(
            span, provider, kwargs, response,
            (time.perf_counter() - start) * 1000, privacy, config,
        )
        transport.enqueue(span)
    except Exception as exc:
        _fail_open(exc, config)
