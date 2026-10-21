"""Unit tests for LangGraph adapter and framework integrations."""

import asyncio
import logging
from typing import TypedDict

import pytest
from agentpulse.client import AgentPulse
from agentpulse.config import AgentPulseConfig
from agentpulse.integrations.langgraph import LangGraphAdapter, instrument_graph, create_langgraph_monitor
from agentpulse.integrations.base import BaseIntegration
from agentpulse.integrations.langchain import LangChainAdapter
from agentpulse.integrations.crewai import CrewAIAdapter


class MockStateGraph:
    def __init__(self):
        self.nodes = {}

    def add_node(self, name, fn):
        self.nodes[name] = fn


@pytest.fixture
def fresh_context():
    """No current trace context before the test, and none left behind after it."""
    from agentpulse.context import _current_context
    token = _current_context.set(None)
    yield
    _current_context.reset(token)


@pytest.fixture
def pulse_client():
    config = AgentPulseConfig(service_name="test_service", enabled=False)
    return AgentPulse(config=config)


class TestLangGraphIntegration:
    def test_adapter_instantiation(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        assert isinstance(adapter, BaseIntegration)

    def test_start_and_end_agent(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        state = {"query": "test query", "step": 1}
        
        span_id = adapter.start_agent("researcher", role="Planner", input_state=state)
        assert span_id is not None
        assert span_id in adapter._active_spans

        output_state = {"result": "papers found", "count": 3}
        adapter.end_agent(span_id, output_state=output_state, status="success")
        assert span_id not in adapter._active_spans
        assert len(pulse_client._transport._buffer) == 1
        
        span = pulse_client._transport._buffer[0]
        assert span.agent_id == "researcher"
        assert span.agent_role == "Planner"

    def test_start_and_end_tool(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        span_id = adapter.start_tool("search_api", tool_args={"q": "rag"})
        assert span_id is not None
        assert span_id in adapter._active_spans

        adapter.end_tool(span_id, result={"docs": 5}, status="success")
        assert span_id not in adapter._active_spans
        assert len(pulse_client._transport._buffer) == 1
        assert pulse_client._transport._buffer[0].tool_name == "search_api"

    def test_independent_runs_get_separate_traces_and_leave_no_context(self, pulse_client, fresh_context):
        from agentpulse.context import get_current_context
        adapter = LangGraphAdapter(pulse_client)

        for _ in range(2):
            span_id = adapter.start_agent("planner", input_state={"q": 1})
            adapter.end_agent(span_id, output_state={"a": 1})

        first, second = pulse_client._transport._buffer
        assert first.trace_id != second.trace_id
        assert get_current_context() is None

    def test_tool_and_nested_agent_join_the_enclosing_agents_trace(self, pulse_client, fresh_context):
        from agentpulse.context import get_current_context
        adapter = LangGraphAdapter(pulse_client)

        outer = adapter.start_agent("planner", input_state={})
        tool = adapter.start_tool("search")
        adapter.end_tool(tool, result={"hits": 1})
        inner = adapter.start_agent("writer", input_state={})
        adapter.end_agent(inner)
        adapter.end_agent(outer)

        tool_span, inner_span, outer_span = pulse_client._transport._buffer
        assert tool_span.trace_id == inner_span.trace_id == outer_span.trace_id
        assert inner_span.parent_span_id == outer_span.span_id
        assert get_current_context() is None

    def test_start_agent_without_a_state_does_not_raise(self, pulse_client):
        """input_state=None is the documented default."""
        adapter = LangGraphAdapter(pulse_client)
        span_id = adapter.start_agent("planner")
        adapter.end_agent(span_id)

        (span,) = pulse_client._transport._buffer
        assert span.agent_id == "planner"
        assert span.input_hash is None

    def test_capture_error_on_a_tool_span_closes_it_as_a_failed_tool_call(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        tool_span_id = adapter.start_tool("search_api")
        adapter.capture_error(tool_span_id, ValueError("503 from search"))

        (span,) = pulse_client._transport._buffer
        assert span.tool_name == "search_api"
        assert span.status.value == "error"
        assert "503 from search" in span.error_message
        assert tool_span_id not in adapter._active_spans

    def test_instrument_node_sync(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        
        @adapter.instrument_node("writer", role="Author")
        def writer_fn(state):
            return {"report": "final report"}

        res = writer_fn({"draft": "raw draft"})
        assert res == {"report": "final report"}
        assert len(pulse_client._transport._buffer) == 1
        assert pulse_client._transport._buffer[0].agent_id == "writer"

    @pytest.mark.asyncio
    async def test_instrument_node_async(self, pulse_client):
        adapter = LangGraphAdapter(pulse_client)
        
        @adapter.instrument_node("analyst", role="Synthesizer")
        async def analyst_fn(state):
            return {"analysis": "key findings"}

        res = await analyst_fn({"data": "raw data"})
        assert res == {"analysis": "key findings"}
        assert len(pulse_client._transport._buffer) == 1
        assert pulse_client._transport._buffer[0].agent_id == "analyst"

    def test_instrument_graph(self, pulse_client):
        graph = MockStateGraph()
        graph.add_node("node1", lambda s: {"step": 1})
        graph.add_node("node2", lambda s: {"step": 2})

        adapter = LangGraphAdapter(pulse_client)
        adapter.instrument_graph(graph, {"node1": "Role 1", "node2": "Role 2"})

        res = graph.nodes["node1"]({"start": True})
        assert res == {"step": 1}
        assert len(pulse_client._transport._buffer) == 1

    def test_instrument_graph_that_wraps_nothing_says_so(self, pulse_client, caplog):
        graph = MockStateGraph()
        graph.add_node("opaque", object())  # neither callable nor a langgraph node

        with caplog.at_level(logging.WARNING, logger="agentpulse.integrations.langgraph"):
            LangGraphAdapter(pulse_client).instrument_graph(graph)

        assert "0 of 1" in caplog.text

    def test_post_mvp_stubs_raise_not_implemented(self):
        with pytest.raises(NotImplementedError):
            LangChainAdapter()
        with pytest.raises(NotImplementedError):
            CrewAIAdapter()


class _CountState(TypedDict):
    n: int


def _real_graph(*, sync_only):
    """A real langgraph StateGraph: add_node stores each node as a StateNodeSpec."""
    StateGraph = pytest.importorskip("langgraph.graph").StateGraph
    from langgraph.graph import END

    def plan(state):
        return {"n": state["n"] + 1}

    async def write(state):
        return {"n": state["n"] + 1}

    def write_sync(state):
        return {"n": state["n"] + 1}

    graph = StateGraph(_CountState)
    graph.add_node("plan", plan)
    graph.add_node("write", write_sync if sync_only else write)
    graph.set_entry_point("plan")
    graph.add_edge("plan", "write")
    graph.add_edge("write", END)
    return graph


class TestInstrumentGraphOnRealLangGraph:
    """instrument_graph used to skip every node of a real StateGraph without saying so."""

    def _spans(self, pulse_client):
        return [(s.agent_id, s.agent_role) for s in pulse_client._transport._buffer]

    def test_sync_graph_records_one_span_per_node_run(self, pulse_client, caplog):
        graph = _real_graph(sync_only=True)
        with caplog.at_level(logging.INFO, logger="agentpulse.integrations.langgraph"):
            LangGraphAdapter(pulse_client).instrument_graph(
                graph, {"plan": "Planner"}
            )
        assert "2 of 2" in caplog.text
        app = graph.compile()

        assert app.invoke({"n": 0}) == {"n": 2}
        assert self._spans(pulse_client) == [("plan", "Planner"), ("write", "write")]

        app.invoke({"n": 0})
        assert len(pulse_client._transport._buffer) == 4

    def test_async_run_with_a_sync_and_an_async_node_records_one_span_each(self, pulse_client):
        graph = _real_graph(sync_only=False)
        LangGraphAdapter(pulse_client).instrument_graph(graph)
        app = graph.compile()

        assert asyncio.run(app.ainvoke({"n": 0})) == {"n": 2}
        assert sorted(a for a, _ in self._spans(pulse_client)) == ["plan", "write"]

    def test_instrumenting_twice_does_not_double_the_spans(self, pulse_client):
        graph = _real_graph(sync_only=True)
        adapter = LangGraphAdapter(pulse_client)
        adapter.instrument_graph(graph)
        adapter.instrument_graph(graph)

        graph.compile().invoke({"n": 0})
        assert len(pulse_client._transport._buffer) == 2

    def test_a_failing_node_is_recorded_as_an_error_and_still_raises(self, pulse_client):
        StateGraph = pytest.importorskip("langgraph.graph").StateGraph

        def boom(state):
            raise ValueError("bad tool reply")

        graph = StateGraph(_CountState)
        graph.add_node("boom", boom)
        graph.set_entry_point("boom")
        graph.set_finish_point("boom")
        LangGraphAdapter(pulse_client).instrument_graph(graph)

        with pytest.raises(ValueError, match="bad tool reply"):
            graph.compile().invoke({"n": 0})
        (span,) = pulse_client._transport._buffer
        assert span.status.value == "error"
