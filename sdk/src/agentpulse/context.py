"""Trace context propagation for multi-agent workflows.

The context propagates trace_id and parent_span_id through the agent
execution graph so all spans in a single workflow share the same trace.
"""

# What this file is for:
#   Keeps track of "which trace and which parent span are we in right now?", so the spans
#   made by different agents and calls in one run can be linked into one trace tree.
#   TraceContext holds those ids. A context variable remembers the current one.
#
# How it fits in:
#   decorators.py (@monitor), integrations/llm.py and integrations/langgraph.py call
#   ensure_context() to find the trace to join. client.py uses TraceContext directly.
#   The ids themselves are made by utils.py (generate_trace_id, generate_span_id).

from __future__ import annotations

# contextvars: a variable whose value is kept separately for each thread and each asyncio
# task (a new task starts with a copy of its creator's value). A change made in one run is
# therefore not seen by another run going on at the same time.
import contextvars
from dataclasses import dataclass, field
from typing import Optional

from agentpulse.utils import generate_span_id, generate_trace_id

# In short: holds the TraceContext of the current task. None means none has been set yet.
# Context variable for implicit propagation within async tasks
_current_context: contextvars.ContextVar[Optional["TraceContext"]] = (
    contextvars.ContextVar("agentpulse_context", default=None)
)


# TraceContext = the ids that tie spans together: which trace we are in, and which span is
# the parent of the next span to be created.
@dataclass
class TraceContext:
    """Holds trace identity for correlation across agent spans.
    
    Propagation strategies:
    1. Explicit: Pass trace_id in LangGraph state dict
    2. Implicit: Use Python contextvars (works within same async context)
    3. Manual: User creates and passes TraceContext explicitly
    """

    # A new random trace id is made for each TraceContext unless one is given.
    trace_id: str = field(default_factory=generate_trace_id)
    # The span that new spans should hang under. None means they sit at the top of the trace.
    parent_span_id: Optional[str] = None
    # Optional name of the pipeline. It is copied into child contexts.
    pipeline_id: Optional[str] = None
    # How many span ids this context has handed out. The leading underscore marks it as
    # internal, and repr=False keeps it out of the printed form.
    _span_count: int = field(default=0, repr=False)

    # Only makes a fresh span id and counts it. It does not change parent_span_id.
    def create_child_span_id(self) -> str:
        """Generate a new span ID and increment the span counter."""
        self._span_count += 1
        return generate_span_id()

    @property
    def span_count(self) -> int:
        """How many span ids this context has handed out so far."""
        return self._span_count

    # Same trace and pipeline, but spans created under the new context will name
    # parent_span_id as their parent. The counter starts again at 0.
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


# Returns a token. Pass it to reset_current_context() later to put the old value back.
def set_current_context(ctx: TraceContext) -> contextvars.Token:
    """Set the active trace context."""
    return _current_context.set(ctx)


def reset_current_context(token: contextvars.Token) -> None:
    """Restore whatever context was active before `set_current_context`.

    Without this, a decorator that pushes a child context leaks it to whatever
    runs next in the same task -- the following sibling node would attach itself
    under the previous node instead of its real parent.
    """
    _current_context.reset(token)


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
    # Step 1: the previous node's @monitor wrapper stores the trace id (and the span id to use
    # as parent) in the state dict under two special keys. If a trace id is there, continue
    # that trace.
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
            # Also make it the current context, so code called inside this node (for example a
            # wrapped LLM client) joins the same trace. The token is ignored, so nothing here
            # undoes this.
            set_current_context(ctx)
            return ctx

    # Step 2: no ids in the state, so reuse the context already active in this task, if any.
    # On this path the pipeline_id argument is ignored.
    # Try contextvar-based propagation
    existing = get_current_context()
    if existing:
        return existing

    # Step 3: nothing found, so this is the first span of a new trace. Start the trace and
    # make it current, so later calls in the same task join it.
    # Create new root context
    ctx = TraceContext(pipeline_id=pipeline_id)
    set_current_context(ctx)
    return ctx
