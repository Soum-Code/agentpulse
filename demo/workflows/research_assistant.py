"""Workflow A: Research Assistant Multi-Agent Pipeline.

DAG Architecture:
Planner ──▶ Retriever (Real Vector Search) ──▶ Verifier ──▶ Analyst ──▶ Writer

Fully instrumented with AgentPulse LangGraphAdapter, supporting real LLM adapters
and multiple reasoning strategies (Direct, CoT, AoT).
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import StateGraph, END

from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter
from demo.workflows.retrieval import local_retriever, RetrievedDocument
from llm_adapters.base import LLMAdapter
from reasoning.base import ReasoningStrategy
from reasoning.direct import DirectStrategy


class ResearchState(TypedDict):
    """Execution state passed through the Research Assistant DAG."""

    query: str
    plan: Optional[str]
    retrieved_docs: List[Dict[str, Any]]
    verification_status: Optional[str]
    synthesis: Optional[str]
    final_report: Optional[str]
    tool_records: List[Dict[str, Any]]
    model_id: str
    strategy: str


def create_research_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Research Assistant LangGraph workflow."""
    reasoning_strat = strategy or DirectStrategy()
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Planner ────────────────────────────────────────────────
    def planner_node(state: ResearchState) -> Dict[str, Any]:
        task_prompt = f"Decompose this research query into sub-topics: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"plan": output.final_answer}

    # ── Node 2: Retriever (Genuine Vector Retrieval Tool) ──────────────
    def retriever_node(state: ResearchState) -> Dict[str, Any]:
        t_start = time.perf_counter()
        results: List[RetrievedDocument] = local_retriever.search(
            query=state["query"],
            top_k=3,
            domain_filter="research",
        )
        t_end = time.perf_counter()

        tool_record = {
            "tool_name": "vector_retrieval_search",
            "arguments": {"query": state["query"], "top_k": 3},
            "result_count": len(results),
            "result_summary": f"Retrieved {len(results)} relevant documents from local index.",
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        doc_dicts = [r.to_dict() for r in results]
        return {
            "retrieved_docs": doc_dicts,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Verifier ───────────────────────────────────────────────
    def verifier_node(state: ResearchState) -> Dict[str, Any]:
        context_text = "\n\n".join([f"[{d['title']}]: {d['content']}" for d in state["retrieved_docs"]])
        task_prompt = "Verify that the retrieved documents directly address the user query and identify key factual claims."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_status": output.final_answer}

    # ── Node 4: Analyst ────────────────────────────────────────────────
    def analyst_node(state: ResearchState) -> Dict[str, Any]:
        context_text = "\n\n".join([f"[{d['title']}]: {d['content']}" for d in state["retrieved_docs"]])
        task_prompt = f"Analyze the verified evidence and synthesize key insights for: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"synthesis": output.final_answer}

    # ── Node 5: Writer ─────────────────────────────────────────────────
    def writer_node(state: ResearchState) -> Dict[str, Any]:
        context_text = f"Analysis Synthesis:\n{state['synthesis']}"
        task_prompt = f"Write an executive summary report answering: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"final_report": output.final_answer}

    # Build Graph
    workflow = StateGraph(ResearchState)
    workflow.add_node("planner", planner_node)
    workflow.add_node("retriever", retriever_node)
    workflow.add_node("verifier", verifier_node)
    workflow.add_node("analyst", analyst_node)
    workflow.add_node("writer", writer_node)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "retriever")
    workflow.add_edge("retriever", "verifier")
    workflow.add_edge("verifier", "analyst")
    workflow.add_edge("analyst", "writer")
    workflow.add_edge("writer", END)

    # Instrument all nodes with AgentPulse
    langgraph_adapter.instrument_graph(
        workflow,
        agent_roles={
            "planner": "Query Decomposition Planner",
            "retriever": "Vector Corpus Retriever",
            "verifier": "Factual Claim Verifier",
            "analyst": "Synthesis & Insight Engine",
            "writer": "Executive Report Author",
        },
    )

    return workflow.compile()
