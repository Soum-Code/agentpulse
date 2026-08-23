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

from __future__ import annotations

import asyncio
import functools
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from agentpulse.config import AgentPulseConfig
from agentpulse.context import TraceContext, ensure_context, set_current_context
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

    def decorator(func: Callable) -> Callable:
        _agent_id = agent_id or func.__name__
        _agent_role = agent_role

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            """Wrapper for async agent node functions."""
            if not config.enabled:
                return await func(*args, **kwargs)

            # Sampling
            if config.sampling_rate < 1.0 and random.random() > config.sampling_rate:
                return await func(*args, **kwargs)

            # Extract state (first positional arg for LangGraph nodes)
            state = args[0] if args and isinstance(args[0], dict) else {}

            try:
                span = _build_pre_span(state, _agent_id, _agent_role, span_kind, event_type, config)
                start = time.perf_counter()

                # Execute the actual agent node
                result = await func(*args, **kwargs)

                duration_ms = (time.perf_counter() - start) * 1000
                _finalize_span(span, result, duration_ms, state, config, privacy, capture_state)

                # Fire-and-forget: enqueue span without awaiting
                transport.enqueue(span)

                # Propagate trace context in state for downstream nodes
                if isinstance(result, dict):
                    result["__agentpulse_trace_id"] = span.trace_id
                    result["__agentpulse_parent_span_id"] = span.span_id

                return result

            except Exception as exc:
                # Fail-open: if SDK errors, let the agent continue
                if config.fail_open:
                    logger.error(
                        "AgentPulse SDK error (fail-open): %s", exc, exc_info=True,
                    )
                    return await func(*args, **kwargs)
                raise

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            """Wrapper for sync agent node functions."""
            if not config.enabled:
                return func(*args, **kwargs)

            if config.sampling_rate < 1.0 and random.random() > config.sampling_rate:
                return func(*args, **kwargs)

            state = args[0] if args and isinstance(args[0], dict) else {}

            try:
                span = _build_pre_span(state, _agent_id, _agent_role, span_kind, event_type, config)
                start = time.perf_counter()

                result = func(*args, **kwargs)

                duration_ms = (time.perf_counter() - start) * 1000
                _finalize_span(span, result, duration_ms, state, config, privacy, capture_state)

                transport.enqueue(span)

                if isinstance(result, dict):
                    result["__agentpulse_trace_id"] = span.trace_id
                    result["__agentpulse_parent_span_id"] = span.span_id

                return result

            except Exception as exc:
                if config.fail_open:
                    logger.error(
                        "AgentPulse SDK error (fail-open): %s", exc, exc_info=True,
                    )
                    return func(*args, **kwargs)
                raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def _build_pre_span(
    state: dict,
    agent_id: str,
    agent_role: str | None,
    span_kind: SpanKind,
    event_type: EventType,
    config: AgentPulseConfig,
) -> SpanPayload:
    """Create the initial span payload before execution."""
    ctx = ensure_context(state, pipeline_id=config.pipeline_id)
    span_id = ctx.create_child_span_id()

    return SpanPayload(
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
    span.end_time = utc_now()
    span.latency_ms = round(duration_ms, 2)

    if capture_state and isinstance(input_state, dict):
        sanitized_input = sanitize_state(input_state)
        serialized = safe_serialize(sanitized_input)
        span.input_hash = hash_content(serialized) if serialized else None

        if privacy.should_capture_input() and serialized:
            span.input_summary = privacy.redact_text(
                extract_summary(serialized, max_length=config.capture_policy.max_field_length)
            )

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
    if isinstance(result, dict):
        span.model = result.get("model") or result.get("__model")
        tokens = result.get("__token_usage", {})
        if isinstance(tokens, dict):
            span.tokens_in = tokens.get("input") or tokens.get("prompt_tokens")
            span.tokens_out = tokens.get("output") or tokens.get("completion_tokens")
