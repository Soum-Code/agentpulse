"""Workflow B: Technical Support Multi-Agent Pipeline.

DAG Architecture:
Router ──▶ Knowledge Retriever (Real KB Lookup) ──▶ Diagnostic ──▶ Verifier ──▶ Response Agent

Fully instrumented with AgentPulse LangGraphAdapter, supporting real LLM adapters
and multiple reasoning strategies (Direct, CoT, AoT).
"""

# What this file is for: it builds one demo "pipeline" of 5 steps (agents) that handles a
# support ticket: label the ticket, look up help articles, diagnose the cause, check the
# diagnosis, and write a reply to the customer. The Knowledge Retriever is ordinary Python
# (a search over local articles); the other four steps ask an LLM.
#
# How it fits in: the pipeline is a LangGraph graph (steps joined by arrows).
# create_tech_support_workflow() asks AgentPulse's LangGraphAdapter to wrap the steps so
# that each step run is recorded as a span. Warning: with the langgraph installed in this
# repo's .venv (version 1.2.11) the wrap does not happen, so no spans are recorded (see the
# note above instrument_graph below). The search comes from retrieval.py. The function is
# called in tests/test_real_workflows.py and re-exported by demo/workflows/__init__.py.

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
class TechSupportState(TypedDict):
    """Execution state passed through the Technical Support DAG."""

    # Input: the ticket's id and the customer's problem in their own words.
    ticket_id: str
    user_issue: str
    # Written by the router: the LLM's label for the ticket (its raw text, not checked).
    category: Optional[str]
    # Written by kb_retriever: the help articles found, as plain dicts.
    kb_articles: List[Dict[str, Any]]
    # Written by the diagnostic step: root cause and fix steps.
    diagnosis: Optional[str]
    # Written by the verifier: the LLM's check of the diagnosis.
    verification_notes: Optional[str]
    # Written by the response agent: the message for the customer.
    final_response: Optional[str]
    # One small log entry per tool-like step (only the KB search adds one here).
    tool_records: List[Dict[str, Any]]
    # Filled in by the caller. No step in this file reads these two.
    model_id: str
    strategy: str


# Builds the graph. In: an AgentPulse client, an LLM adapter, and an optional reasoning
# strategy (default Direct = ask the LLM once, no extra reasoning steps). Out: a compiled
# graph; call .invoke(initial_state) on it to run the 5 steps in order and get the final state.
def create_tech_support_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Technical Support LangGraph workflow."""
    # Use the strategy the caller gave, or Direct if there is none.
    reasoning_strat = strategy or DirectStrategy()
    # This adapter is meant to wrap each node below (see the end of the function) so that
    # it records spans.
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Router ─────────────────────────────────────────────────
    # Asks the LLM to label the ticket as AUTH, RATE_LIMIT, DB or CONFIG. Reads: user_issue.
    # Writes: category, which is the LLM's reply with blank space trimmed from both ends
    # (strip). It is not checked against the four names.
    def router_node(state: TechSupportState) -> Dict[str, Any]:
        task_prompt = f"Classify this support ticket into category (AUTH, RATE_LIMIT, DB, CONFIG): '{state['user_issue']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"category": output.final_answer.strip()}

    # ── Node 2: Knowledge Retriever (Genuine KB Tool Execution) ────────
    # Searches the local documents for the 2 closest to the customer's issue, looking only
    # at documents whose domain is "support". No LLM here. Reads: user_issue. Writes:
    # kb_articles and one new entry in tool_records. The category is not used in the search
    # itself; it is only written into the tool record's arguments.
    def kb_retriever_node(state: TechSupportState) -> Dict[str, Any]:
        # Time the search so the tool record can report how long it took.
        t_start = time.perf_counter()
        results: List[RetrievedDocument] = local_retriever.search(
            query=state["user_issue"],
            top_k=2,
            domain_filter="support",
        )
        t_end = time.perf_counter()

        # A tool record = a small log of one tool call: its name, inputs, how many results,
        # time taken and status. It is kept in the state under tool_records. This file does
        # not send it to AgentPulse as a separate span.
        tool_record = {
            "tool_name": "support_kb_search",
            "arguments": {"query": state["user_issue"], "category": state.get("category")},
            "result_count": len(results),
            "result_summary": f"Retrieved {len(results)} relevant KB runbooks.",
            # perf_counter() counts in seconds; multiplying by 1000 gives milliseconds.
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        # Turn each hit into a plain dict so it can sit in the state. Then return the
        # articles plus the old tool_records list with the new entry added on the end (a
        # returned key replaces the old value in the state, so old entries must be copied in).
        doc_dicts = [r.to_dict() for r in results]
        return {
            "kb_articles": doc_dicts,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Diagnostic Agent ───────────────────────────────────────
    # Gives the LLM the found KB articles and asks for the root cause and fix steps.
    # Reads: kb_articles, user_issue. Writes: diagnosis.
    def diagnostic_node(state: TechSupportState) -> Dict[str, Any]:
        # "context" = the evidence text the strategy adds to the prompt. Here: each article
        # as "[title]: content", with a blank line between articles.
        context_text = "\n\n".join([f"[{a['title']}]: {a['content']}" for a in state["kb_articles"]])
        task_prompt = f"Diagnose root cause and formulate solution steps for ticket: '{state['user_issue']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"diagnosis": output.final_answer}

    # ── Node 4: Verifier ───────────────────────────────────────────────
    # Asks the LLM whether the diagnosis breaks security policy and is backed by the KB
    # articles. The LLM does the check; no Python code compares the texts. Reads: diagnosis,
    # kb_articles. Writes: verification_notes, which the response agent then reads.
    def verifier_node(state: TechSupportState) -> Dict[str, Any]:
        # Evidence = the diagnosis followed by the article texts (content only, no titles).
        context_text = f"Diagnosis:\n{state['diagnosis']}\n\nKB References:\n" + "\n".join([a['content'] for a in state["kb_articles"]])
        task_prompt = "Verify that the proposed diagnosis does not violate security policies and is backed by the KB."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_notes": output.final_answer}

    # ── Node 5: Response Agent ─────────────────────────────────────────
    # Asks the LLM to write the reply to the customer from the diagnosis and the
    # verification notes. Reads: diagnosis, verification_notes, ticket_id. Writes:
    # final_response.
    def response_node(state: TechSupportState) -> Dict[str, Any]:
        context_text = f"Verified Diagnosis:\n{state['diagnosis']}\n\nVerification:\n{state['verification_notes']}"
        task_prompt = f"Draft a polite, professional customer resolution message for ticket '{state['ticket_id']}'"
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"final_response": output.final_answer}

    # Build Graph
    # Step 1: create the graph with the state shape above. Step 2: register each function
    # as a named node. Step 3: set the first node and add edges (arrows) so the nodes run
    # in a straight line, router -> kb_retriever -> diagnostic -> verifier -> response_agent.
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
            "router": "Ticket Classification Router",
            "kb_retriever": "Support Knowledge Base Searcher",
            "diagnostic": "Root Cause Diagnostic Engine",
            "verifier": "Solution Policy Verifier",
            "response_agent": "Customer Response Formatter",
        },
    )

    # compile() turns the graph description into a runnable object (it has .invoke(state)).
    return workflow.compile()
