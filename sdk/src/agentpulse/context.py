"""Trace context propagation for multi-agent workflows.

The context propagates trace_id and parent_span_id through the agent
execution graph so all spans in a single workflow share the same trace.
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass, field
from typing import Optional

from agentpulse.utils import generate_span_id, generate_trace_id

# Context variable for implicit propagation within async tasks
_current_context: contextvars.ContextVar[Optional["TraceContext"]] = (
    contextvars.ContextVar("agentpulse_context", default=None)
)


@dataclass
class TraceContext:
    """Holds trace identity for correlation across agent spans.
    
    Propagation strategies:
    1. Explicit: Pass trace_id in LangGraph state dict
    2. Implicit: Use Python contextvars (works within same async context)
    3. Manual: User creates and passes TraceContext explicitly
    """

    trace_id: str = field(default_factory=generate_trace_id)
    parent_span_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    _span_count: int = field(default=0, repr=False)

    def create_child_span_id(self) -> str:
        """Generate a new span ID and increment the span counter."""
        self._span_count += 1
        return generate_span_id()

    @property
    def span_count(self) -> int:
        return self._span_count

    def child(self, parent_span_id: str) -> TraceContext:
        """Create a child context for nested agent calls."""
        return TraceContext(
            trace_id=self.trace_id,
            parent_span_id=parent_span_id,
            pipeline_id=self.pipeline_id,
            _span_count=0,
        )


def get_current_context() -> TraceContext | None:
    """Get the active trace context from contextvars."""
    return _current_context.get()


def set_current_context(ctx: TraceContext) -> contextvars.Token:
    """Set the active trace context."""
    return _current_context.set(ctx)


def ensure_context(
    state: dict | None = None,
    pipeline_id: str | None = None,
) -> TraceContext:
    """Get or create a trace context.
    
    Resolution order:
    1. Extract from LangGraph state dict (explicit propagation)
    2. Get from contextvars (implicit propagation)
    3. Create new context (root of a new trace)
    """
    # Try state-based propagation (LangGraph)
    if state and isinstance(state, dict):
        trace_id = state.get("__agentpulse_trace_id")
        parent_id = state.get("__agentpulse_parent_span_id")
        if trace_id:
            ctx = TraceContext(
                trace_id=trace_id,
                parent_span_id=parent_id,
                pipeline_id=pipeline_id,
            )
            set_current_context(ctx)
            return ctx

    # Try contextvar-based propagation
    existing = get_current_context()
    if existing:
        return existing

    # Create new root context
    ctx = TraceContext(pipeline_id=pipeline_id)
    set_current_context(ctx)
    return ctx
