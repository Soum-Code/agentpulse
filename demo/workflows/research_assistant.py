"""Workflow A: Research Assistant Multi-Agent Pipeline.

DAG Architecture:
Planner ──▶ Retriever (Real Vector Search) ──▶ Verifier ──▶ Analyst ──▶ Writer

Fully instrumented with AgentPulse LangGraphAdapter, supporting real LLM adapters
and multiple reasoning strategies (Direct, CoT, AoT).
"""

# What this file is for: it builds one demo "pipeline" of 5 steps (agents) that answers a
# research question: split it into sub-topics, search a small set of documents, check the
# documents found, analyse them, and write an executive summary. The Retriever is ordinary
# Python (a vector search over local documents); the other four steps ask an LLM.
#
# How it fits in: the pipeline is a LangGraph graph (steps joined by arrows).
# create_research_workflow() asks AgentPulse's LangGraphAdapter to wrap the steps so that
# each step run is recorded as a span. Warning: with the langgraph installed in this repo's
# .venv (version 1.2.11) the wrap does not happen, so no spans are recorded (see the note
# above instrument_graph below). The search comes from retrieval.py. The function is called
# in tests/test_real_workflows.py and re-exported by demo/workflows/__init__.py.

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, TypedDict

# langgraph = a library that runs agent steps as a graph. StateGraph is the graph builder;
# END is the marker that means "stop here".
from langgraph.graph import StateGraph, END

# AgentPulse = this project's SDK client. LangGraphAdapter is meant to record a span per
# graph node (but see the note above instrument_graph below).
from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter
# local_retriever = the shared document search; RetrievedDocument = one search hit.
from demo.workflows.retrieval import local_retriever, RetrievedDocument
# LLMAdapter = the common interface for any LLM we can call (see llm_adapters/base.py).
from llm_adapters.base import LLMAdapter
# ReasoningStrategy = how a question is put to the LLM (Direct, CoT or AoT); see reasoning/.
from reasoning.base import ReasoningStrategy
from reasoning.direct import DirectStrategy


# The shared "notebook" that LangGraph hands from step to step. Each step reads some fields
# and returns a dict with only the fields it changed; LangGraph merges that into the state.
# (A TypedDict is a normal dict whose keys and value types are declared up front.)
class ResearchState(TypedDict):
    """Execution state passed through the Research Assistant DAG."""

    # Input: the user's research question.
    query: str
    # Written by the planner: the question split into sub-topics.
    plan: Optional[str]
    # Written by the retriever: the documents found, as plain dicts (title, content, score...).
    retrieved_docs: List[Dict[str, Any]]
    # Written by the verifier: the LLM's check of the documents.
    verification_status: Optional[str]
    # Written by the analyst: the key insights drawn from the documents.
    synthesis: Optional[str]
    # Written by the writer: the final executive summary.
    final_report: Optional[str]
    # One small log entry per tool-like step (only the retriever adds one here).
    tool_records: List[Dict[str, Any]]
    # Filled in by the caller. No step in this file reads these two.
    model_id: str
    strategy: str


# Builds the graph. In: an AgentPulse client, an LLM adapter, and an optional reasoning
# strategy (default Direct = ask the LLM once, no extra reasoning steps). Out: a compiled
# graph; call .invoke(initial_state) on it to run the 5 steps in order and get the final state.
def create_research_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Research Assistant LangGraph workflow."""
    # Use the strategy the caller gave, or Direct if there is none.
    reasoning_strat = strategy or DirectStrategy()
    # This adapter is meant to wrap each node below (see the end of the function) so that
    # it records spans.
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Planner ────────────────────────────────────────────────
    # Asks the LLM to split the question into sub-topics. Reads: query. Writes: plan.
    # (output.final_answer is the LLM's reply text.) The plan is not read by later steps.
    def planner_node(state: ResearchState) -> Dict[str, Any]:
        task_prompt = f"Decompose this research query into sub-topics: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"plan": output.final_answer}

    # ── Node 2: Retriever (Genuine Vector Retrieval Tool) ──────────────
    # Searches the local documents for the 3 closest to the query, looking only at
    # documents whose domain is "research". No LLM here. Reads: query. Writes:
    # retrieved_docs and one new entry in tool_records.
    def retriever_node(state: ResearchState) -> Dict[str, Any]:
        # Time the search so the tool record can report how long it took.
        t_start = time.perf_counter()
        results: List[RetrievedDocument] = local_retriever.search(
            query=state["query"],
            top_k=3,
            domain_filter="research",
        )
        t_end = time.perf_counter()

        # A tool record = a small log of one tool call: its name, inputs, how many results,
        # time taken and status. It is kept in the state under tool_records. This file does
        # not send it to AgentPulse as a separate span.
        tool_record = {
            "tool_name": "vector_retrieval_search",
            "arguments": {"query": state["query"], "top_k": 3},
            "result_count": len(results),
            "result_summary": f"Retrieved {len(results)} relevant documents from local index.",
            # perf_counter() counts in seconds; multiplying by 1000 gives milliseconds.
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        # Turn each hit into a plain dict so it can sit in the state. Then return the docs
        # plus the old tool_records list with the new entry added on the end (a returned
        # key replaces the old value in the state, so the old entries must be copied in).
        doc_dicts = [r.to_dict() for r in results]
        return {
            "retrieved_docs": doc_dicts,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Verifier ───────────────────────────────────────────────
    # Shows the found documents to the LLM and asks whether they answer the query and what
    # the key factual claims are. Reads: retrieved_docs. Writes: verification_status. The
    # analyst below does not read verification_status, so this answer cannot stop or change it.
    def verifier_node(state: ResearchState) -> Dict[str, Any]:
        # "context" = the evidence text the strategy adds to the prompt. Here: each document
        # as "[title]: content", with a blank line between documents.
        context_text = "\n\n".join([f"[{d['title']}]: {d['content']}" for d in state["retrieved_docs"]])
        task_prompt = "Verify that the retrieved documents directly address the user query and identify key factual claims."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_status": output.final_answer}

    # ── Node 4: Analyst ────────────────────────────────────────────────
    # Asks the LLM to pull key insights out of the same documents. Reads: retrieved_docs,
    # query. Writes: synthesis.
    def analyst_node(state: ResearchState) -> Dict[str, Any]:
        context_text = "\n\n".join([f"[{d['title']}]: {d['content']}" for d in state["retrieved_docs"]])
        task_prompt = f"Analyze the verified evidence and synthesize key insights for: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"synthesis": output.final_answer}

    # ── Node 5: Writer ─────────────────────────────────────────────────
    # Asks the LLM for a short executive summary. It sees only the analyst's synthesis, not
    # the documents. Reads: synthesis, query. Writes: final_report.
    def writer_node(state: ResearchState) -> Dict[str, Any]:
        context_text = f"Analysis Synthesis:\n{state['synthesis']}"
        task_prompt = f"Write an executive summary report answering: '{state['query']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"final_report": output.final_answer}

    # Build Graph
    # Step 1: create the graph with the state shape above. Step 2: register each function
    # as a named node. Step 3: set the first node and add edges (arrows) so the nodes run
    # in a straight line, planner -> retriever -> verifier -> analyst -> writer.
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
    # instrument_graph is meant to swap each node for a wrapper that records one span per
    # run: the first 200 characters of the node's input and output, plus the time taken.
    # agent_roles gives each node a readable role name that is stored with its span.
    # But it only wraps nodes that are plain callables (see
    # sdk/src/agentpulse/integrations/langgraph.py); any other kind of node object is left
    # as it is. A check with langgraph 1.2.11 (the version in this repo's .venv) showed that
    # add_node stores a StateNodeSpec object, which is not callable. So there the nodes
    # were left unchanged and these five steps record no spans. Other langgraph versions
    # were not checked.
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

    # compile() turns the graph description into a runnable object (it has .invoke(state)).
    return workflow.compile()
