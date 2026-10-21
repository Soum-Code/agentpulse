"""Explicit LangGraph Adapter for AgentPulse.

Instruments LangGraph StateGraph nodes, tool calls, and state transitions
without blocking execution flow.
"""

# What this file is for:
#   Connects AgentPulse to LangGraph (a library that runs agents as a graph of "nodes":
#   each node is a function that gets the shared state dict and returns changes to it).
#   LangGraphAdapter wraps node functions so that every run of a node becomes one span:
#   its timing, its status, and the first 200 characters of what went in and came out.
#   It can also record a tool call as a span (start_tool / end_tool).
#
# How it fits in:
#   Takes an AgentPulse object (client.py) and puts finished spans straight into its
#   transport. Uses context.py to find the trace and utils.py for summaries and hashes.
#   Used by the demo workflows, benchmarks/run_benchmarks.py and the tests.

from __future__ import annotations

# functools.wraps copies a function's name and docs onto its wrapper. inspect tells an
# `async def` function from a normal one. time.perf_counter() is a stopwatch.
import functools
import inspect
import logging
import time
from typing import Any, Callable, Optional

# AgentPulse (client.py) owns the transport that finished spans are queued into.
from agentpulse.client import AgentPulse
from agentpulse.context import TraceContext, ensure_context
from agentpulse.integrations.base import BaseIntegration
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload
from agentpulse.utils import extract_summary, hash_content, safe_serialize

logger = logging.getLogger("agentpulse.integrations.langgraph")


# One adapter works with one AgentPulse object. While a span is open, its details wait in
# _active_spans; the matching end_* call takes them out, builds the span and queues it.
#
# Differences from @monitor (decorators.py), all visible in the code below:
# - It does not use the privacy filter or the capture_* switches. The 200-character
#   summaries of input, output and tool result are filled in whatever those settings say,
#   and are never redacted. The input is not cleaned of keys such as password, and
#   error_message is not redacted either.
# - It ignores the enabled, sampling_rate and fail_open settings.
# - It does not write the trace keys into the node's result, and it does not make the
#   current span the parent of spans created inside the node. A parent comes only from
#   the parent_span_id argument, or from a parent that the context already holds.
class LangGraphAdapter(BaseIntegration):
    """LangGraph-specific observability adapter."""

    # pulse: the AgentPulse object whose transport receives the spans.
    # _active_spans: details of spans that are open, keyed by span id.
    def __init__(self, pulse: AgentPulse) -> None:
        self.pulse = pulse
        self._active_spans: dict[str, dict] = {}

    # Opens a span for one agent step. In: the agent id, an optional role and pipeline id,
    # the state the node received, and an optional parent span id. Out: the new span id.
    # Nothing is sent yet; end_agent() builds the span and queues it.
    def start_agent(
        self,
        agent_id: str,
        role: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        input_state: Optional[Any] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        # Step 1: find the trace to join: the two trace keys in input_state if they are there,
        # else the context already active in this task, else a new trace (see context.py).
        ctx = ensure_context(input_state)
        # Step 2: make a new span id for this step.
        span_id = ctx.create_child_span_id()
        
        # Step 3: remember the start details until end_agent() is called. The parent is the
        # parent_span_id argument if given, else the parent held by the context. The role
        # falls back to the agent id. start_time is a stopwatch reading (not a date) that is
        # only used later to work out the latency.
        self._active_spans[span_id] = {
            "trace_id": ctx.trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id or ctx.parent_span_id,
            "agent_id": agent_id,
            "role": role or agent_id,
            "pipeline_id": pipeline_id,
            "start_time": time.perf_counter(),
            # First 200 characters of the state as JSON text. Not redacted, and keys such as
            # password are not removed; the capture_* switches are not checked.
            "input_summary": extract_summary(safe_serialize(input_state)),
            # Fingerprint of the state text. If input_state is None, safe_serialize returns None
            # and hash_content(None) raises AttributeError, so always pass a state.
            "input_hash": hash_content(safe_serialize(input_state)),
        }
        return span_id

    # Closes the span that start_agent() opened: works out the latency, summarises the
    # output, builds the SpanPayload and puts it in the transport's buffer.
    def end_agent(
        self,
        span_id: str,
        output_state: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        # Step 1: take the saved details out of _active_spans (pop = read and remove). If there
        # are none (unknown span id, or this span was already closed), do nothing.
        span_meta = self._active_spans.pop(span_id, None)
        if not span_meta:
            return

        # Step 2: latency in milliseconds = (stopwatch now - stopwatch at start) * 1000.
        latency_ms = (time.perf_counter() - span_meta["start_time"]) * 1000

        # Step 3: the output as JSON text, its 200-character summary and its fingerprint.
        # All three stay None when there is no output (for example when the node failed).
        output_str = safe_serialize(output_state) if output_state is not None else None
        output_summary = extract_summary(output_str) if output_str else None
        output_hash = hash_content(output_str) if output_str else None

        # Step 4: build the span from the saved details. start_time and end_time are not
        # given, so the span keeps SpanPayload's default start_time (the moment this object
        # is built, which is the end of the step) and has no end_time. latency_ms holds the
        # real duration.
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
            # Only the exact text "error" gives an ERROR status. Any other text counts as success.
            status=SpanStatus.ERROR if status == "error" else SpanStatus.SUCCESS,
            error_message=str(error) if error else None,
        )

        # Step 5: queue the span. enqueue() only adds it to the transport's buffer. It leaves
        # this process once the transport is running (for example after `await pulse.start()`).
        self.pulse._transport.enqueue(span_payload)

    # Opens a span for one tool call (a search, a database lookup...). In: the tool name,
    # its arguments, the calling agent's id and an optional parent span id.
    # Out: the new span id. end_tool() closes it.
    def start_tool(
        self,
        tool_name: str,
        tool_args: Optional[dict] = None,
        agent_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        # Step 1: find the trace. No state is passed for a tool, so this uses the context
        # already active in this task, or starts a new trace if there is none.
        ctx = ensure_context()
        # Step 2: make a new span id for this tool call.
        span_id = ctx.create_child_span_id()
        
        # Step 3: remember the start details. Unlike start_agent, the parent is only the
        # parent_span_id argument (none if omitted); the context's parent is not used. The
        # agent id defaults to "tool_executor". The arguments are kept as JSON text, not
        # redacted.
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

    # Closes the span that start_tool() opened, with the tool's result (or its error).
    # Builds a TOOL span and puts it in the transport's buffer.
    def end_tool(
        self,
        span_id: str,
        result: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        # Step 1: take the saved details out. Unknown or already-closed span id: do nothing.
        span_meta = self._active_spans.pop(span_id, None)
        if not span_meta:
            return

        # Step 2: latency in milliseconds, and the result as JSON text.
        latency_ms = (time.perf_counter() - span_meta["start_time"]) * 1000
        result_str = safe_serialize(result)

        # Step 3: build the span. tool_result_summary is the first 200 characters of the
        # result text, not redacted. As in end_agent, start_time is left at its default (the
        # moment of building) and end_time is empty; latency_ms holds the real duration.
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

        # Step 4: queue the span (see end_agent).
        self.pulse._transport.enqueue(span_payload)

    # Required by BaseIntegration (base.py). Here the call is accepted and ignored: nothing
    # is recorded for a handoff between agents.
    def capture_handoff(
        self,
        from_agent: str,
        to_agent: str,
        state_payload: Optional[dict] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        pass

    # Closes a span that is still open and marks it as an error. The `context` argument
    # is not used.
    def capture_error(
        self,
        span_id: str,
        error: Exception,
        context: Optional[dict] = None,
    ) -> None:
        # An unknown or already-closed span id is ignored. This calls end_agent(), so it is
        # meant for agent spans: the saved details of a tool span have no "role" key, which
        # end_agent() reads, so it would fail with KeyError.
        if span_id in self._active_spans:
            self.end_agent(span_id, status="error", error=error)

    # Returns a decorator for ONE node function. Each call of the wrapped node opens a span,
    # runs the node, then closes the span as success, or as error if the node raised.
    # The same error is raised again afterwards, so the graph behaves as it did before.
    def instrument_node(
        self,
        agent_id: str,
        role: Optional[str] = None,
        pipeline_id: Optional[str] = None,
    ) -> Callable:
        """Create a decorator for a single LangGraph node function."""
        def decorator(fn: Callable) -> Callable:
            # Two wrappers with the same steps. An `async def` node needs an async wrapper so
            # that it can be awaited; a normal function gets a normal wrapper.
            if inspect.iscoroutinefunction(fn):
                @functools.wraps(fn)
                async def async_wrapper(state: Any, *args: Any, **kwargs: Any) -> Any:
                    # Step 1: open the span. The first argument of a node is its state.
                    span_id = self.start_agent(agent_id, role, pipeline_id, state)
                    try:
                        # Step 2: run the real node.
                        result = await fn(state, *args, **kwargs)
                        # Step 3a: it worked, so close the span as success. This call is inside
                        # the try, so an error raised while recording the span is not hidden:
                        # it reaches the caller.
                        self.end_agent(span_id, result, status="success")
                        return result
                    # Step 3b: the node raised. Close the span as an error, then raise the
                    # same error again.
                    except Exception as exc:
                        self.end_agent(span_id, status="error", error=exc)
                        raise
                async_wrapper.__agentpulse_wrapped__ = True
                return async_wrapper
            else:
                # The normal-function version: the same steps, without await.
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
                sync_wrapper.__agentpulse_wrapped__ = True
                return sync_wrapper
        return decorator

    # Wraps the nodes of a graph builder (a LangGraph StateGraph before .compile()).
    # In: the builder, an optional dict {node name: role}, and an optional pipeline id.
    # Out: the same builder, changed in place. The node name becomes the agent id.
    # It logs how many nodes it wrapped, and warns when a node had to be left alone or when
    # none could be wrapped, so that "no spans" is never a silent result.
    def instrument_graph(
        self,
        graph_builder: Any,
        agent_roles: Optional[dict[str, str]] = None,
        pipeline_id: Optional[str] = None,
    ) -> Any:
        """Instrument all nodes in a LangGraph StateGraph instance."""
        roles = agent_roles or {}
        # Step 1: an object without a `nodes` dict cannot be instrumented, so warn and
        # hand it back unchanged.
        if not hasattr(graph_builder, "nodes"):
            logger.warning("Cannot instrument graph: no 'nodes' dictionary found")
            return graph_builder

        # Step 2: go through the nodes. list(...) makes a copy of the names, so the loop can
        # safely change the dict while it runs.
        wrapped = 0
        names = list(graph_builder.nodes.keys())
        for node_name in names:
            node = graph_builder.nodes[node_name]
            # The role comes from agent_roles; a node with no entry uses its own name.
            role = roles.get(node_name, node_name)
            decorator = self.instrument_node(node_name, role=role, pipeline_id=pipeline_id)

            runnable = getattr(node, "runnable", node)
            if hasattr(runnable, "func") and hasattr(runnable, "afunc"):
                # Step 3a: a real langgraph node. In langgraph 1.x, add_node stores a
                # StateNodeSpec, which is not callable. Its .runnable (a RunnableCallable) holds
                # the node's function as .func (run by invoke) and .afunc (run by ainvoke; for a
                # sync node langgraph fills it with a shim that runs .func in a thread). Both
                # are replaced by wrapped versions, in place, so the graph keeps its retry
                # policy and the like. Only one of the two runs for a given call, so a node
                # still records one span per run. A node that already carries the marker set
                # by instrument_node (an earlier call, or wrapped by hand) is left alone.
                if not any(
                    getattr(fn, "__agentpulse_wrapped__", False)
                    for fn in (runnable.func, runnable.afunc)
                ):
                    for attr, is_async in (("func", False), ("afunc", True)):
                        fn = getattr(runnable, attr)
                        if fn is not None and inspect.iscoroutinefunction(fn) == is_async:
                            setattr(runnable, attr, decorator(fn))
                wrapped += 1
            elif callable(node) and not hasattr(node, "invoke"):
                # Step 3b: a plain function (what older langgraph versions and simple graph
                # builders keep). A callable with an `.invoke` method, such as a LangChain
                # runnable, is left as it is.
                graph_builder.nodes[node_name] = decorator(node)
                wrapped += 1
            else:
                logger.warning(
                    "AgentPulse could not instrument node %r (%s)", node_name, type(node).__name__,
                )

        # Step 4: say what happened, so a graph that records nothing is not a mystery.
        if names and not wrapped:
            logger.warning(
                "AgentPulse instrumented 0 of %d nodes: the graph will record no spans", len(names),
            )
        else:
            logger.info("AgentPulse instrumented %d of %d graph nodes", wrapped, len(names))
        return graph_builder


# Shortcut: makes a new LangGraphAdapter for `pulse`, then calls its instrument_graph().
def instrument_graph(
    graph_builder: Any,
    pulse: AgentPulse,
    agent_roles: Optional[dict[str, str]] = None,
    pipeline_id: Optional[str] = None,
) -> Any:
    """Convenience helper to instrument a LangGraph StateGraph."""
    adapter = LangGraphAdapter(pulse)
    return adapter.instrument_graph(graph_builder, agent_roles=agent_roles, pipeline_id=pipeline_id)


# Shortcut: makes a new LangGraphAdapter for `pulse` and returns its instrument_node()
# decorator, for example @create_langgraph_monitor(pulse, "writer") above one node.
def create_langgraph_monitor(
    pulse: AgentPulse,
    agent_id: str,
    role: Optional[str] = None,
    pipeline_id: Optional[str] = None,
) -> Callable:
    """Convenience helper to create a node monitor decorator."""
    adapter = LangGraphAdapter(pulse)
    return adapter.instrument_node(agent_id, role=role, pipeline_id=pipeline_id)
