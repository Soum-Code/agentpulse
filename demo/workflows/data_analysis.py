"""Workflow C: Data Analysis Multi-Agent Pipeline.

DAG Architecture:
Planner ──▶ Data Query Agent ──▶ Python Analyzer (Real Computation) ──▶ Verifier ──▶ Reporter

Fully instrumented with AgentPulse LangGraphAdapter, supporting real LLM adapters
and multiple reasoning strategies (Direct, CoT, AoT).
"""

from __future__ import annotations

import math
import time
from typing import Any, Dict, List, Optional, TypedDict

import numpy as np
from langgraph.graph import StateGraph, END

from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter
from llm_adapters.base import LLMAdapter
from reasoning.base import ReasoningStrategy
from reasoning.direct import DirectStrategy


# Synthetic realistic latency benchmark dataset for data query agent
TELEMETRY_DATASET = [
    {"span_id": f"sp_{i:03d}", "latency_ms": round(20 + 30 * np.sin(i / 5.0) + (i % 7) * 4.2, 2), "error": (i % 15 == 0)}
    for i in range(1, 51)
]


class DataAnalysisState(TypedDict):
    """Execution state passed through the Data Analysis DAG."""

    analysis_goal: str
    plan: Optional[str]
    raw_data: List[Dict[str, Any]]
    computed_metrics: Dict[str, Any]
    verification_status: Optional[str]
    executive_report: Optional[str]
    tool_records: List[Dict[str, Any]]
    model_id: str
    strategy: str


def create_data_analysis_workflow(
    pulse: AgentPulse,
    adapter: LLMAdapter,
    strategy: Optional[ReasoningStrategy] = None,
) -> Any:
    """Build and instrument the 5-node Data Analysis LangGraph workflow."""
    reasoning_strat = strategy or DirectStrategy()
    langgraph_adapter = LangGraphAdapter(pulse)

    # ── Node 1: Planner ────────────────────────────────────────────────
    def planner_node(state: DataAnalysisState) -> Dict[str, Any]:
        task_prompt = f"Plan statistical metrics required for goal: '{state['analysis_goal']}'"
        output = reasoning_strat.execute(adapter, task_prompt)
        return {"plan": output.final_answer}

    # ── Node 2: Data Query Agent (Genuine Query Execution) ─────────────
    def data_query_node(state: DataAnalysisState) -> Dict[str, Any]:
        t_start = time.perf_counter()
        query_records = TELEMETRY_DATASET[:30]
        t_end = time.perf_counter()

        tool_record = {
            "tool_name": "telemetry_dataset_query",
            "arguments": {"table": "spans", "limit": 30},
            "result_count": len(query_records),
            "result_summary": f"Fetched {len(query_records)} records from telemetry dataset.",
            "latency_ms": (t_end - t_start) * 1000.0,
            "status": "success",
        }

        return {
            "raw_data": query_records,
            "tool_records": state.get("tool_records", []) + [tool_record],
        }

    # ── Node 3: Python Analyzer (Genuine Python Computation) ───────────
    def python_analyzer_node(state: DataAnalysisState) -> Dict[str, Any]:
        t_start = time.perf_counter()
        latencies = [r["latency_ms"] for r in state["raw_data"]]
        errors = [r for r in state["raw_data"] if r["error"]]

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
    def verifier_node(state: DataAnalysisState) -> Dict[str, Any]:
        context_text = f"Calculated Numerical Metrics:\n{state['computed_metrics']}"
        task_prompt = "Verify that calculated percentiles satisfy P50 <= P95 <= Max and record count matches query size."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"verification_status": output.final_answer}

    # ── Node 5: Reporter ───────────────────────────────────────────────
    def reporter_node(state: DataAnalysisState) -> Dict[str, Any]:
        context_text = f"Verified Metrics:\n{state['computed_metrics']}\n\nGoal: {state['analysis_goal']}"
        task_prompt = "Generate a data summary report stating exact sample size, mean latency, P95 latency, and error rate."
        output = reasoning_strat.execute(adapter, task_prompt, context=context_text)
        return {"executive_report": output.final_answer}

    # Build Graph
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

    return workflow.compile()
