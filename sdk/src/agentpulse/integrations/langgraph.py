"""Explicit LangGraph Adapter for AgentPulse.

Instruments LangGraph StateGraph nodes, tool calls, and state transitions
without blocking execution flow.
"""

from __future__ import annotations

import functools
import inspect
import logging
import time
from typing import Any, Callable, Optional

from agentpulse.client import AgentPulse
from agentpulse.context import TraceContext, ensure_context
from agentpulse.integrations.base import BaseIntegration
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload
from agentpulse.utils import extract_summary, hash_content, safe_serialize

logger = logging.getLogger("agentpulse.integrations.langgraph")


class LangGraphAdapter(BaseIntegration):
    """LangGraph-specific observability adapter."""

    def __init__(self, pulse: AgentPulse) -> None:
        self.pulse = pulse
        self._active_spans: dict[str, dict] = {}

    def start_agent(
        self,
        agent_id: str,
        role: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        input_state: Optional[Any] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        ctx = ensure_context(input_state)
        span_id = ctx.create_child_span_id()
        
        self._active_spans[span_id] = {
            "trace_id": ctx.trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id or ctx.parent_span_id,
            "agent_id": agent_id,
            "role": role or agent_id,
            "pipeline_id": pipeline_id,
            "start_time": time.perf_counter(),
            "input_summary": extract_summary(safe_serialize(input_state)),
            "input_hash": hash_content(safe_serialize(input_state)),
        }
        return span_id

    def end_agent(
        self,
        span_id: str,
        output_state: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        span_meta = self._active_spans.pop(span_id, None)
        if not span_meta:
            return

        latency_ms = (time.perf_counter() - span_meta["start_time"]) * 1000

        output_str = safe_serialize(output_state) if output_state is not None else None
        output_summary = extract_summary(output_str) if output_str else None
        output_hash = hash_content(output_str) if output_str else None

        span_payload = SpanPayload(
            trace_id=span_meta["trace_id"],
            span_id=span_id,
            parent_span_id=span_meta["parent_span_id"],
            agent_id=span_meta["agent_id"],
            agent_role=span_meta["role"],
            pipeline_id=span_meta["pipeline_id"],
            span_kind=SpanKind.AGENT,
            event_type=EventType.AGENT_EXECUTION,
            input_summary=span_meta["input_summary"],
            output_summary=output_summary,
            input_hash=span_meta["input_hash"],
            output_hash=output_hash,
            latency_ms=round(latency_ms, 2),
            status=SpanStatus.ERROR if status == "error" else SpanStatus.SUCCESS,
            error_message=str(error) if error else None,
        )

        self.pulse._transport.enqueue(span_payload)

    def start_tool(
        self,
        tool_name: str,
        tool_args: Optional[dict] = None,
        agent_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        ctx = ensure_context()
        span_id = ctx.create_child_span_id()
        
        self._active_spans[span_id] = {
            "trace_id": ctx.trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id,
            "agent_id": agent_id or "tool_executor",
            "tool_name": tool_name,
            "tool_args": safe_serialize(tool_args),
            "start_time": time.perf_counter(),
        }
        return span_id

    def end_tool(
        self,
        span_id: str,
        result: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        span_meta = self._active_spans.pop(span_id, None)
        if not span_meta:
            return

        latency_ms = (time.perf_counter() - span_meta["start_time"]) * 1000
        result_str = safe_serialize(result)

        span_payload = SpanPayload(
            trace_id=span_meta["trace_id"],
            span_id=span_id,
            parent_span_id=span_meta["parent_span_id"],
            agent_id=span_meta["agent_id"],
            span_kind=SpanKind.TOOL,
            event_type=EventType.TOOL_CALL,
            tool_name=span_meta.get("tool_name"),
            tool_args=span_meta.get("tool_args"),
            tool_result_summary=extract_summary(result_str),
            latency_ms=round(latency_ms, 2),
            status=SpanStatus.ERROR if status == "error" else SpanStatus.SUCCESS,
            error_message=str(error) if error else None,
        )

        self.pulse._transport.enqueue(span_payload)

    def capture_handoff(
        self,
        from_agent: str,
        to_agent: str,
        state_payload: Optional[dict] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        pass

    def capture_error(
        self,
        span_id: str,
        error: Exception,
        context: Optional[dict] = None,
    ) -> None:
        if span_id in self._active_spans:
            self.end_agent(span_id, status="error", error=error)

    def instrument_node(
        self,
        agent_id: str,
        role: Optional[str] = None,
        pipeline_id: Optional[str] = None,
    ) -> Callable:
        """Create a decorator for a single LangGraph node function."""
        def decorator(fn: Callable) -> Callable:
            if inspect.iscoroutinefunction(fn):
                @functools.wraps(fn)
                async def async_wrapper(state: Any, *args: Any, **kwargs: Any) -> Any:
                    span_id = self.start_agent(agent_id, role, pipeline_id, state)
                    try:
                        result = await fn(state, *args, **kwargs)
                        self.end_agent(span_id, result, status="success")
                        return result
                    except Exception as exc:
                        self.end_agent(span_id, status="error", error=exc)
                        raise
                return async_wrapper
            else:
                @functools.wraps(fn)
                def sync_wrapper(state: Any, *args: Any, **kwargs: Any) -> Any:
                    span_id = self.start_agent(agent_id, role, pipeline_id, state)
                    try:
                        result = fn(state, *args, **kwargs)
                        self.end_agent(span_id, result, status="success")
                        return result
                    except Exception as exc:
                        self.end_agent(span_id, status="error", error=exc)
                        raise
                return sync_wrapper
        return decorator

    def instrument_graph(
        self,
        graph_builder: Any,
        agent_roles: Optional[dict[str, str]] = None,
        pipeline_id: Optional[str] = None,
    ) -> Any:
        """Instrument all nodes in a LangGraph StateGraph instance."""
        roles = agent_roles or {}
        if not hasattr(graph_builder, "nodes"):
            logger.warning("Cannot instrument graph: no 'nodes' dictionary found")
            return graph_builder

        for node_name in list(graph_builder.nodes.keys()):
            node = graph_builder.nodes[node_name]
            role = roles.get(node_name, node_name)
            decorator = self.instrument_node(node_name, role=role, pipeline_id=pipeline_id)

            if callable(node) and not hasattr(node, "invoke"):
                graph_builder.nodes[node_name] = decorator(node)
        return graph_builder


def instrument_graph(
    graph_builder: Any,
    pulse: AgentPulse,
    agent_roles: Optional[dict[str, str]] = None,
    pipeline_id: Optional[str] = None,
) -> Any:
    """Convenience helper to instrument a LangGraph StateGraph."""
    adapter = LangGraphAdapter(pulse)
    return adapter.instrument_graph(graph_builder, agent_roles=agent_roles, pipeline_id=pipeline_id)


def create_langgraph_monitor(
    pulse: AgentPulse,
    agent_id: str,
    role: Optional[str] = None,
    pipeline_id: Optional[str] = None,
) -> Callable:
    """Convenience helper to create a node monitor decorator."""
    adapter = LangGraphAdapter(pulse)
    return adapter.instrument_node(agent_id, role=role, pipeline_id=pipeline_id)
