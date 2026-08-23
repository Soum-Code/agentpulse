"""Integration tests for 3 Real Multi-Agent Workflows."""

import pytest
from agentpulse import AgentPulse
from demo.workflows.retrieval import local_retriever
from demo.workflows.research_assistant import create_research_workflow
from demo.workflows.tech_support import create_tech_support_workflow
from demo.workflows.data_analysis import create_data_analysis_workflow
from llm_adapters import get_llm_adapter
from reasoning import DirectStrategy


def test_local_vector_retriever():
    results = local_retriever.search("Transformer self-attention mechanism", top_k=2)
    assert len(results) == 2
    assert results[0].similarity_score > 0.0
    assert "Transformer" in results[0].content or "attention" in results[0].content


def test_research_assistant_workflow():
    pulse = AgentPulse(service_name="test_research")
    adapter = get_llm_adapter("qwen-0.5b")
    workflow = create_research_workflow(pulse, adapter, strategy=DirectStrategy())

    initial_state = {
        "query": "How does multi-head attention improve transformers?",
        "plan": None,
        "retrieved_docs": [],
        "verification_status": None,
        "synthesis": None,
        "final_report": None,
        "tool_records": [],
        "model_id": "qwen-0.5b",
        "strategy": "DIRECT",
    }
    final_state = workflow.invoke(initial_state)

    assert final_state["final_report"] is not None
    assert len(final_state["retrieved_docs"]) > 0
    assert len(final_state["tool_records"]) > 0


def test_tech_support_workflow():
    pulse = AgentPulse(service_name="test_support")
    adapter = get_llm_adapter("qwen-0.5b")
    workflow = create_tech_support_workflow(pulse, adapter, strategy=DirectStrategy())

    initial_state = {
        "ticket_id": "TICK-401-A",
        "user_issue": "Getting HTTP 401 Unauthorized with API key",
        "category": None,
        "kb_articles": [],
        "diagnosis": None,
        "verification_notes": None,
        "final_response": None,
        "tool_records": [],
        "model_id": "qwen-0.5b",
        "strategy": "DIRECT",
    }
    final_state = workflow.invoke(initial_state)

    assert final_state["final_response"] is not None
    assert len(final_state["kb_articles"]) > 0


def test_data_analysis_workflow():
    pulse = AgentPulse(service_name="test_data")
    adapter = get_llm_adapter("qwen-0.5b")
    workflow = create_data_analysis_workflow(pulse, adapter, strategy=DirectStrategy())

    initial_state = {
        "analysis_goal": "Analyze query response latencies and identify P95",
        "plan": None,
        "raw_data": [],
        "computed_metrics": {},
        "verification_status": None,
        "executive_report": None,
        "tool_records": [],
        "model_id": "qwen-0.5b",
        "strategy": "DIRECT",
    }
    final_state = workflow.invoke(initial_state)

    assert final_state["executive_report"] is not None
    assert len(final_state["raw_data"]) > 0
    assert "mean_latency_ms" in final_state["computed_metrics"]
    assert "p95_latency_ms" in final_state["computed_metrics"]
