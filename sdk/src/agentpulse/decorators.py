"""Core @monitor decorator for instrumenting agent nodes.

Usage:
    from agentpulse import AgentPulse

    pulse = AgentPulse(endpoint="http://localhost:8000")

    @pulse.monitor(agent_id="researcher", role="researcher")
    async def researcher_node(state):
        ...
        return {"messages": [...]}

Design decisions:
- Supports both sync and async functions
- Fire-and-forget telemetry via asyncio.create_task (never blocks agent)
- Propagates trace_id through LangGraph state dict
- Falls back gracefully on any SDK error (fail-open by default)
"""

# What this file is for:
#   Builds the @pulse.monitor(...) decorator. A decorator wraps a function so extra work
#   happens around it. Here the extra work is: start a span, run your agent function,
#   measure how long it took, record what went in and came out (only as far as the
#   privacy settings allow), and queue the span for sending. It handles both normal
#   (sync) and async functions.
#
# How it fits in:
#   AgentPulse.monitor() in client.py calls create_monitor_decorator(). This file uses
#   context.py (which trace we are in), privacy.py (what text may be kept), utils.py
#   (hashing and JSON helpers) and the transport (the sender) through its enqueue().

from __future__ import annotations

import asyncio
# functools.wraps copies the original function's name and docs onto the wrapper.
import functools
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from agentpulse.config import AgentPulseConfig
from agentpulse.context import (
    TraceContext,
    ensure_context,
    reset_current_context,
    set_current_context,
)
from agentpulse.privacy import PrivacyFilter
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload
from agentpulse.transport import AsyncTransport
from agentpulse.utils import (
    extract_summary,
    generate_span_id,
    hash_content,
    safe_serialize,
    sanitize_state,
    utc_now,
)

logger = logging.getLogger("agentpulse.decorator")


def create_monitor_decorator(
    transport: AsyncTransport,
    config: AgentPulseConfig,
    privacy: PrivacyFilter,
    agent_id: Optional[str] = None,
    agent_role: Optional[str] = None,
    span_kind: SpanKind = SpanKind.AGENT,
    event_type: EventType = EventType.AGENT_EXECUTION,
    capture_state: bool = True,
) -> Callable:
    """Create a monitor decorator bound to a specific transport + config.
    
    This is the factory used by AgentPulse.monitor() — it closes over
    the transport and config so the decorator itself is lightweight.
    """

    # Layout: create_monitor_decorator(...) returns decorator, and decorator(func) returns a
    # wrapper. The inner functions can use transport, config and the other arguments above
    # because they are defined inside this function (this is called a closure).
    def decorator(func: Callable) -> Callable:
        # If no agent_id was given, the function's own name is used as the agent id.
        _agent_id = agent_id or func.__name__
        _agent_role = agent_role

        # Version for `async def` functions. Steps 1-8 below run on each call, except that
        # Steps 1 and 2 can skip recording and just call your function.
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            """Wrapper for async agent node functions."""
            # Step 1: SDK switched off, so just call your function and record nothing.
            if not config.enabled:
                return await func(*args, **kwargs)

            # Sampling
            # Step 2: random.random() gives a number from 0 to 1. If it is above sampling_rate, this
            # call is skipped and not recorded. With a rate of 0.25, about a quarter of calls are
            # kept.
            if config.sampling_rate < 1.0 and random.random() > config.sampling_rate:
                return await func(*args, **kwargs)

            # Extract state (first positional arg for LangGraph nodes)
            # Step 3: if the first argument is a dict, treat it as the agent's state. Otherwise use
            # an empty dict.
            state = args[0] if args and isinstance(args[0], dict) else {}

            # Step 4: the SDK's own work before the call. Only this part is fail-open: your
            # function has not run yet, so on an SDK error it is simply called without a span.
            try:
                # Create the span (trace id, span id, parent, start time) before your function
                # runs, then start the stopwatch. time.perf_counter() is a clock for measuring
                # durations: the gap between two readings is the time that passed.
                span, ctx = _build_pre_span(state, _agent_id, _agent_role, span_kind, event_type, config)
                start = time.perf_counter()
                # Run your function while this span is the "current parent", so spans made
                # inside it become its children. Anything instrumented inside it -- an LLM call
                # wrapped by integrations.llm, a nested monitored function -- then hangs off this
                # node instead of becoming its sibling, which is what makes the trace a tree
                # rather than a flat list.
                token = _push_child_context(ctx, span.span_id)
            except Exception as exc:
                _fail_open(exc, config)
                return await func(*args, **kwargs)

            # Step 5: your function, called exactly once and outside any SDK try block. If it
            # raises, that is your error and not an SDK error: the failed run is recorded as an
            # ERROR span and the same exception goes on to the caller. The finally block puts the
            # previous context back whether it worked or not.
            try:
                result = await func(*args, **kwargs)
            except Exception as exc:
                _record_error(span, exc, start, state, transport, config, privacy, capture_state)
                raise
            finally:
                _pop_context(token)

            # Steps 6-8: the SDK's own work after the call, fail-open again. The function has
            # already run, so an error here is logged (or raised when fail_open is off) and the
            # function is never called a second time.
            try:
                _record_success(span, result, start, state, transport, config, privacy, capture_state)
            except Exception as exc:
                _fail_open(exc, config)
            return result

        # Version for normal functions. Same steps as the async one above, without await.
        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            """Wrapper for sync agent node functions."""
            if not config.enabled:
                return func(*args, **kwargs)

            if config.sampling_rate < 1.0 and random.random() > config.sampling_rate:
                return func(*args, **kwargs)

            state = args[0] if args and isinstance(args[0], dict) else {}

            try:
                span, ctx = _build_pre_span(state, _agent_id, _agent_role, span_kind, event_type, config)
                start = time.perf_counter()
                # See the async wrapper: this is what parents nested spans.
                token = _push_child_context(ctx, span.span_id)
            except Exception as exc:
                _fail_open(exc, config)
                return func(*args, **kwargs)

            try:
                result = func(*args, **kwargs)
            except Exception as exc:
                _record_error(span, exc, start, state, transport, config, privacy, capture_state)
                raise
            finally:
                _pop_context(token)

            try:
                _record_success(span, result, start, state, transport, config, privacy, capture_state)
            except Exception as exc:
                _fail_open(exc, config)
            return result

        # Hand back the wrapper that matches your function: async def gets async_wrapper, anything
        # else gets sync_wrapper.
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# One rule for errors inside the SDK's own code: if fail_open is on, log the error and carry
# on; if it is off, raise it. (integrations/llm.py has the same rule; it cannot be imported
# here because that package imports client.py, which imports this file.)
def _fail_open(exc: Exception, config: AgentPulseConfig) -> None:
    if config.fail_open:
        logger.error("AgentPulse SDK error (fail-open): %s", exc, exc_info=True)
        return
    raise exc


def _record_success(
    span: SpanPayload,
    result: Any,
    start: float,
    state: dict,
    transport: AsyncTransport,
    config: AgentPulseConfig,
    privacy: PrivacyFilter,
    capture_state: bool,
) -> None:
    """Finish the span of a call that returned, queue it, and pass the trace on in the result."""
    # Duration in milliseconds = (stop reading - start reading) * 1000. Then fill in end time,
    # latency, hashes and (if the privacy settings allow) the text summaries, plus model and
    # token counts taken from the result.
    duration_ms = (time.perf_counter() - start) * 1000
    _finalize_span(span, result, duration_ms, state, config, privacy, capture_state)

    # Fire-and-forget: enqueue span without awaiting
    transport.enqueue(span)

    # Propagate trace context in state for downstream nodes: add two extra keys to the dict your
    # function returned. ensure_context() in the next node reads them from its state, so the
    # next span joins this trace with this span as its parent.
    if isinstance(result, dict):
        result["__agentpulse_trace_id"] = span.trace_id
        result["__agentpulse_parent_span_id"] = span.span_id


def _record_error(
    span: SpanPayload,
    exc: Exception,
    start: float,
    state: dict,
    transport: AsyncTransport,
    config: AgentPulseConfig,
    privacy: PrivacyFilter,
    capture_state: bool,
) -> None:
    """The failed call is still telemetry, and often the interesting kind."""
    try:
        # Same as a finished span, with no output, status ERROR and the error as "TypeName:
        # message" (masked like any other text, then cut to 500 characters).
        duration_ms = (time.perf_counter() - start) * 1000
        _finalize_span(span, None, duration_ms, state, config, privacy, capture_state)
        span.status = SpanStatus.ERROR
        span.error_message = privacy.redact_text(f"{type(exc).__name__}: {exc}")[:500]
        transport.enqueue(span)
    # If recording itself fails: log it (fail_open on) or raise it (fail_open off).
    except Exception as inner:
        _fail_open(inner, config)


def _push_child_context(ctx: TraceContext, span_id: str):
    """Make `span_id` the parent for anything instrumented inside this call.

    `ctx` is the context the span was built from. ctx.child(span_id) is the same trace, with
    span_id as the parent for new spans. The token that comes back is what `_pop_context`
    needs to put the previous context back.
    """
    return set_current_context(ctx.child(span_id))


def _pop_context(token) -> None:
    """Undo _push_child_context."""
    reset_current_context(token)


def _build_pre_span(
    state: dict,
    agent_id: str,
    agent_role: str | None,
    span_kind: SpanKind,
    event_type: EventType,
    config: AgentPulseConfig,
) -> tuple[SpanPayload, TraceContext]:
    """Create the initial span payload before execution, and the context it belongs to."""
    # Step 1: find the trace to join (from the state, from the current context, or a new one).
    ctx = ensure_context(state, pipeline_id=config.pipeline_id)
    # Step 2: a new span id. Step 3 (below): the span starts with the current time and status
    # SUCCESS; the rest is filled in after the function has run.
    span_id = ctx.create_child_span_id()

    span = SpanPayload(
        trace_id=ctx.trace_id,
        span_id=span_id,
        parent_span_id=ctx.parent_span_id,
        agent_id=agent_id,
        agent_role=agent_role,
        pipeline_id=config.pipeline_id,
        event_type=event_type,
        span_kind=span_kind,
        start_time=utc_now(),
        status=SpanStatus.SUCCESS,
    )
    return span, ctx


def _finalize_span(
    span: SpanPayload,
    result: Any,
    duration_ms: float,
    input_state: dict,
    config: AgentPulseConfig,
    privacy: PrivacyFilter,
    capture_state: bool,
) -> None:
    """Finalize span with execution results."""
    # Step 1: stamp the end time and the duration (in milliseconds, rounded to 2 decimals).
    span.end_time = utc_now()
    span.latency_ms = round(duration_ms, 2)

    # Step 2: the input. sanitize_state() drops keys named api_key, token, secret, password or
    # authorization (exact names, any letter case) and every key that starts with an underscore
    # (which includes the two trace keys). It swaps values that cannot be turned into JSON for
    # their type name. The cleaned state is then turned into JSON text.
    if capture_state and isinstance(input_state, dict):
        sanitized_input = sanitize_state(input_state)
        serialized = safe_serialize(sanitized_input)
        # The hash is kept even when text capture is off (but not when capture_state is False,
        # which skips this whole block). It lets you tell whether two inputs were the same
        # without storing them. safe_serialize() has already cut long text at 2000 characters,
        # so only the start of a long input counts toward the hash.
        span.input_hash = hash_content(serialized) if serialized else None

        # The text itself is kept only if capture_inputs is on. It is cut to max_field_length
        # (but never longer than the 2000 characters kept above), then redact_text() masks
        # emails, phone numbers and similar (see privacy.py).
        if privacy.should_capture_input() and serialized:
            span.input_summary = privacy.redact_text(
                extract_summary(serialized, max_length=config.capture_policy.max_field_length)
            )

    # Step 3: the output, same idea as the input. A dict result is cleaned with sanitize_state();
    # any other result type is turned into text as it is.
    if capture_state and result is not None:
        if isinstance(result, dict):
            sanitized_output = sanitize_state(result)
            serialized = safe_serialize(sanitized_output)
        else:
            serialized = safe_serialize(result)

        span.output_hash = hash_content(serialized) if serialized else None

        if privacy.should_capture_output() and serialized:
            span.output_summary = privacy.redact_text(
                extract_summary(serialized, max_length=config.capture_policy.max_field_length)
            )

    # Extract model info from state or result metadata
    # Step 4: only the returned dict is read here, not the input state. The model name comes
    # from its "model" or "__model" key. Token counts come from "__token_usage", which holds
    # input/prompt_tokens and output/completion_tokens.
    if isinstance(result, dict):
        span.model = result.get("model") or result.get("__model")
        tokens = result.get("__token_usage", {})
        if isinstance(tokens, dict):
            span.tokens_in = tokens.get("input") or tokens.get("prompt_tokens")
            span.tokens_out = tokens.get("output") or tokens.get("completion_tokens")
