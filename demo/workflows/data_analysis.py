"""Workflow C: Data Analysis Multi-Agent Pipeline.

DAG Architecture:
Planner ──▶ Data Query Agent ──▶ Python Analyzer (Real Computation) ──▶ Verifier ──▶ Reporter

Fully instrumented with AgentPulse LangGraphAdapter, supporting real LLM adapters
and multiple reasoning strategies (Direct, CoT, AoT).
"""

# What this file is for: it builds one demo "pipeline" of 5 steps (agents) that answers a
# data question: plan the metrics, fetch records, compute statistics, verify them, and write
# a short report. Planner, Verifier and Reporter ask an LLM. Data Query and Python Analyzer
# are ordinary Python code (they read fake data and do the maths with numpy).
#
# How it fits in: the pipeline is a LangGraph graph (steps joined by arrows).
# create_data_analysis_workflow() asks AgentPulse's LangGraphAdapter to wrap the steps so
# that each step run is recorded as a span. Warning: with the langgraph installed in this
# repo's .venv (version 1.2.11) the wrap does not happen, so no spans are recorded (see the
# note above instrument_graph below). The function is called in tests/test_real_workflows.py
# and re-exported by demo/workflows/__init__.py. research_assistant.py and tech_support.py
# use the same pattern with different steps.

from __future__ import annotations

# Note: `math` is imported but not used in this file.
import math
import time
from typing import Any, Dict, List, Optional, TypedDict

# numpy = fast maths on arrays. Here it builds the fake data and computes mean/percentiles.
import numpy as np
# langgraph = a library that runs agent steps as a graph. StateGraph is the graph builder;
# END is the marker that means "stop here".
from langgraph.graph import StateGraph, END

# AgentPulse = this project's SDK client. LangGraphAdapter is meant to record a span per
# graph node (but see the note above instrument_graph below).
from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter
# LLMAdapter = the common interface for any LLM we can call (see llm_adapters/base.py).
from llm_adapters.base import LLMAdapter
# ReasoningStrategy = how a question is put to the LLM (Direct, CoT or AoT); see reasoning/.
from reasoning.base import ReasoningStrategy
from reasoning.direct import DirectStrategy


# Synthetic realistic latency benchmark dataset for data query agent
# In plain words: 50 made-up records, sp_001 to sp_050. latency_ms is a slow sine wave
# (20 + 30*sin(i/5)) plus a saw-tooth step ((i % 7) * 4.2), rounded to 2 decimals. Every
# 15th record (i % 15 == 0) is flagged as an error. Because of the sine part, records 21 to
# 23 come out below zero, which a real latency never would. It is only demo data.
TELEMETRY_DATASET = [
    {"span_id": f"sp_{i:03d}", "latency_ms": round(20 + 30 * np.sin(i / 5.0) + (i % 7) * 4.2, 2), "error": (i % 15 == 0)}
    for i in range(1, 51)
]


# The shared "notebook" that LangGraph hands from step to step. Each step reads some fields
# and returns a dict with only the fields it changed; LangGraph merges that into the state.
# (A TypedDict is a normal dict whose keys and value types are declared up front.)
class DataAnalysisState(TypedDict):
    """Execution state passed through the Data Analysis DAG."""

    # Input: the question to answer.
    analysis_goal: str
    # Written by the planner: which metrics are needed.
    plan: Optional[str]
    # Written by data_query: the fetched records.
    raw_data: List[Dict[str, Any]]
    # Written by python_analyzer: record count, mean, p50, p95, max, error count, error rate.
    computed_metrics: Dict[str, Any]
    # Written by the verifier: the LLM's answer to "do these numbers look consistent?".
    verification_status: Optional[str]
    # Written by the reporter: the final text report.
    executive_report: Optional[str]
    # One small log entry per tool-like step (data_query and python_analyzer add one each).
    tool_records: List[Dict[str, Any]]
    # Filled in by the caller. No step in this file reads these two.
    model_id: str
    strategy: str


# Builds the graph. In: an AgentPulse client, an LLM adapter, and an optional reasoning
# strategy (default Direct = ask the LLM once, no extra reasoning steps). Out: a compiled
# graph; call .invoke(initial_state) on it to run the 5 steps in order and get the final state.
def create_data_analysis_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Data Analysis LangGraph workflow."""
    # Use the strategy the caller gave, or Direct if there is none.
    reasoning_strat = strategy or DirectStrategy()
    # This adapter is meant to wrap each node below (see the end of the function) so that
    # it records spans.
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Planner ────────────────────────────────────────────────
    # Asks the LLM which metrics are needed for the goal. Reads: analysis_goal.
    # Writes: plan. (output.final_answer is the LLM's reply text.)
    def planner_node(state: DataAnalysisState) -> Dict[str, Any]:
        task_prompt = f"Plan statistical metrics required for goal: '{state['analysis_goal']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"plan": output.final_answer}

    # ── Node 2: Data Query Agent (Genuine Query Execution) ─────────────
    # Stands in for a database query: it takes the first 30 records of the in-memory
    # TELEMETRY_DATASET. It does not use the plan and does not call the LLM.
    def data_query_node(state: DataAnalysisState) -> Dict[str, Any]:
        # Time the "query" so the tool record can report how long it took.
        t_start = time.perf_counter()
        query_records = TELEMETRY_DATASET[:30]
        t_end = time.perf_counter()

        # A tool record = a small log of one tool call: its name, inputs, how many results,
        # time taken and status. It is kept in the state under tool_records. This file does
        # not send it to AgentPulse as a separate span.
        tool_record = {
            "tool_name": "telemetry_dataset_query",
            "arguments": {"table": "spans", "limit": 30},
            "result_count": len(query_records),
            "result_summary": f"Fetched {len(query_records)} records from telemetry dataset.",
            # perf_counter() counts in seconds; multiplying by 1000 gives milliseconds.
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        # Return the records, plus the old tool_records list with the new entry added on
        # the end. The old list is copied in because a returned key replaces the old value
        # in the state; without it earlier entries would be lost.
        return {
            "raw_data": query_records,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Python Analyzer (Genuine Python Computation) ───────────
    # Computes the statistics with numpy. No LLM is involved here. Reads: raw_data.
    # Writes: computed_metrics. Assumes raw_data is not empty (data_query fills it first).
    def python_analyzer_node(state: DataAnalysisState) -> Dict[str, Any]:
        t_start = time.perf_counter()
        latencies = [r["latency_ms"] for r in state["raw_data"]]
        errors = [r for r in state["raw_data"] if r["error"]]

        # float(...) turns numpy numbers into plain Python floats. Meaning of each metric:
        # mean = the average; p50 = the median (half the values are lower); p95 = the value
        # that about 95% of the values are at or below; max = the biggest; error_rate_pct =
        # errors divided by all records, times 100, rounded to 1 decimal.
        computed = {
            "record_count": len(latencies),
            "mean_latency_ms": round(float(np.mean(latencies)), 2),
            "p50_latency_ms": round(float(np.percentile(latencies, 50)), 2),
            "p95_latency_ms": round(float(np.percentile(latencies, 95)), 2),
            "max_latency_ms": round(float(np.max(latencies)), 2),
            "error_count": len(errors),
            "error_rate_pct": round(len(errors) / len(latencies) * 100.0, 1),
        }
        t_end = time.perf_counter()

        tool_record = {
            "tool_name": "python_stats_analyzer",
            "arguments": {"metrics": ["mean", "p50", "p95", "error_rate"]},
            "result_count": len(computed),
            "result_summary": f"Computed {len(computed)} statistical metrics via numpy/python.",
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        return {
            "computed_metrics": computed,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 4: Verifier ───────────────────────────────────────────────
    # Shows the computed metrics to the LLM and asks it to check them. Reads:
    # computed_metrics. Writes: verification_status. The LLM does the check; no Python code
    # compares the numbers. The reporter below does not read verification_status, so a
    # "failed" answer would not stop or change the report.
    def verifier_node(state: DataAnalysisState) -> Dict[str, Any]:
        # "context" = the evidence text that the strategy adds to the prompt.
        context_text = f"Calculated Numerical Metrics:\n{state['computed_metrics']}"
        task_prompt = "Verify that calculated percentiles satisfy P50 <= P95 <= Max and record count matches query size."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_status": output.final_answer}

    # ── Node 5: Reporter ───────────────────────────────────────────────
    # Asks the LLM to write the final report from the computed metrics and the goal. The
    # prompt asks it to state the exact sample size, mean latency, P95 latency and error
    # rate. Reads: computed_metrics, analysis_goal. Writes: executive_report.
    def reporter_node(state: DataAnalysisState) -> Dict[str, Any]:
        context_text = f"Verified Metrics:\n{state['computed_metrics']}\n\nGoal: {state['analysis_goal']}"
        task_prompt = "Generate a data summary report stating exact sample size, mean latency, P95 latency, and error rate."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"executive_report": output.final_answer}

    # Build Graph
    # Step 1: create the graph with the state shape above. Step 2: register each function
    # as a named node. Step 3: set the first node and add edges (arrows) so the nodes run
    # in a straight line, planner -> data_query -> python_analyzer -> verifier -> reporter.
    workflow = StateGraph(DataAnalysisState)
    workflow.add_node("planner", planner_node)
    workflow.add_node("data_query", data_query_node)
    workflow.add_node("python_analyzer", python_analyzer_node)
    workflow.add_node("verifier", verifier_node)
    workflow.add_node("reporter", reporter_node)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "data_query")
    workflow.add_edge("data_query", "python_analyzer")
    workflow.add_edge("python_analyzer", "verifier")
    workflow.add_edge("verifier", "reporter")
    workflow.add_edge("reporter", END)

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
            "planner": "Metrics Scope Planner",
            "data_query": "Telemetry Record Query Engine",
            "python_analyzer": "Python Statistical Calculator",
            "verifier": "Statistical Consistency Verifier",
            "reporter": "Telemetry Report Author",
        },
    )

    # compile() turns the graph description into a runnable object (it has .invoke(state)).
    return workflow.compile()
