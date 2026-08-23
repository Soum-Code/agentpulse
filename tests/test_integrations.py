"""Unit tests for LangGraph adapter and framework integrations."""

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

    def test_post_mvp_stubs_raise_not_implemented(self):
        with pytest.raises(NotImplementedError):
            LangChainAdapter()
        with pytest.raises(NotImplementedError):
            CrewAIAdapter()
