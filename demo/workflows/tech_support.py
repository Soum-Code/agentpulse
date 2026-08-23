"""Workflow B: Technical Support Multi-Agent Pipeline.

DAG Architecture:
Router ──▶ Knowledge Retriever (Real KB Lookup) ──▶ Diagnostic ──▶ Verifier ──▶ Response Agent

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


class TechSupportState(TypedDict):
    """Execution state passed through the Technical Support DAG."""

    ticket_id: str
    user_issue: str
    category: Optional[str]
    kb_articles: List[Dict[str, Any]]
    diagnosis: Optional[str]
    verification_notes: Optional[str]
    final_response: Optional[str]
    tool_records: List[Dict[str, Any]]
    model_id: str
    strategy: str


def create_tech_support_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Technical Support LangGraph workflow."""
    reasoning_strat = strategy or DirectStrategy()
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Router ─────────────────────────────────────────────────
    def router_node(state: TechSupportState) -> Dict[str, Any]:
        task_prompt = f"Classify this support ticket into category (AUTH, RATE_LIMIT, DB, CONFIG): '{state['user_issue']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"category": output.final_answer.strip()}

    # ── Node 2: Knowledge Retriever (Genuine KB Tool Execution) ────────
    def kb_retriever_node(state: TechSupportState) -> Dict[str, Any]:
        t_start = time.perf_counter()
        results: List[RetrievedDocument] = local_retriever.search(
            query=state["user_issue"],
            top_k=2,
            domain_filter="support",
        )
        t_end = time.perf_counter()

        tool_record = {
            "tool_name": "support_kb_search",
            "arguments": {"query": state["user_issue"], "category": state.get("category")},
            "result_count": len(results),
            "result_summary": f"Retrieved {len(results)} relevant KB runbooks.",
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        doc_dicts = [r.to_dict() for r in results]
        return {
            "kb_articles": doc_dicts,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Diagnostic Agent ───────────────────────────────────────
    def diagnostic_node(state: TechSupportState) -> Dict[str, Any]:
        context_text = "\n\n".join([f"[{a['title']}]: {a['content']}" for a in state["kb_articles"]])
        task_prompt = f"Diagnose root cause and formulate solution steps for ticket: '{state['user_issue']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"diagnosis": output.final_answer}

    # ── Node 4: Verifier ───────────────────────────────────────────────
    def verifier_node(state: TechSupportState) -> Dict[str, Any]:
        context_text = f"Diagnosis:\n{state['diagnosis']}\n\nKB References:\n" + "\n".join([a['content'] for a in state["kb_articles"]])
        task_prompt = "Verify that the proposed diagnosis does not violate security policies and is backed by the KB."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_notes": output.final_answer}

    # ── Node 5: Response Agent ─────────────────────────────────────────
    def response_node(state: TechSupportState) -> Dict[str, Any]:
        context_text = f"Verified Diagnosis:\n{state['diagnosis']}\n\nVerification:\n{state['verification_notes']}"
        task_prompt = f"Draft a polite, professional customer resolution message for ticket '{state['ticket_id']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"final_response": output.final_answer}

    # Build Graph
    workflow = StateGraph(TechSupportState)
    workflow.add_node("router", router_node)
    workflow.add_node("kb_retriever", kb_retriever_node)
    workflow.add_node("diagnostic", diagnostic_node)
    workflow.add_node("verifier", verifier_node)
    workflow.add_node("response_agent", response_node)

    workflow.set_entry_point("router")
    workflow.add_edge("router", "kb_retriever")
    workflow.add_edge("kb_retriever", "diagnostic")
    workflow.add_edge("diagnostic", "verifier")
    workflow.add_edge("verifier", "response_agent")
    workflow.add_edge("response_agent", END)

    # Instrument all nodes with AgentPulse
    langgraph_adapter.instrument_graph(
        workflow,
        agent_roles={
            "router": "Ticket Classification Router",
            "kb_retriever": "Support Knowledge Base Searcher",
            "diagnostic": "Root Cause Diagnostic Engine",
            "verifier": "Solution Policy Verifier",
            "response_agent": "Customer Response Formatter",
        },
    )

    return workflow.compile()
