"""Send a realistic multi-agent trace to a running AgentPulse backend.

Used to verify the dashboard end-to-end against real traces (not fixtures):
run the backend, run this, then confirm the trace, its per-span evaluations,
and any triggered alerts appear in the dashboard.

The trace deliberately mixes grounded and ungrounded spans so the evaluator
produces a spread of risk scores rather than a single label.

Usage:
    python scripts/e2e_dashboard_demo.py [--endpoint http://localhost:8000]
"""

# About this file
# - What it is: a script you run by hand. It builds one made-up trace of five spans and
#   sends it to a running AgentPulse backend (POST /v1/ingest). Then it prints the trace id
#   and where to look at it.
# - Why: it puts known data into a fresh dashboard, so you can check the dashboard shows it.
# - How it fits in: it builds the request with the SDK's own classes SpanPayload and
#   IngestRequest (sdk/src/agentpulse/schemas) and sends it with httpx (an HTTP client). The
#   backend side that receives it is backend/app/routers/ingest.py.
# - Heads-up: SpanPayload has no fields called tool_calls, input_state or output_state.
#   Pydantic (the validation library behind it) ignores unknown fields, so build_trace()
#   below drops those three values (a SpanPayload built with them has no such attributes).
#   The backend reads tool_name and tool_result_summary instead, so for these spans it sees
#   no tool name and skips its tool-claim check.

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Make the SDK importable straight from the repo (sdk/src) without installing it.
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))

import httpx

from agentpulse.schemas.enums import EventType, SpanStatus
from agentpulse.schemas.events import IngestRequest, SpanPayload


# The text every span uses as its input_summary (the evidence the agent "saw"). The
# grounding check compares each span's output_summary against it.
EVIDENCE = (
    "The database query executed in 45ms and returned 3 verified customer "
    "profile records from the production replica."
)


# Returns the five spans of one trace. They share trace_id and the same evidence text; they
# differ in agent, output text, latency and (the last one) status.
def build_trace(trace_id: str) -> list[SpanPayload]:
    # One timestamp is used as both start_time and end_time of every span, so the times
    # cannot tell the spans apart or show their order.
    now = datetime.now(timezone.utc)
    # A made-up parent id. All five spans list it as parent_span_id; no span with this id is
    # sent.
    root = f"root_{uuid.uuid4().hex[:12]}"

    # Builds one SpanPayload. span_id is the agent name plus 12 random hex characters, so it
    # is unique. A missing tool_calls becomes an empty list. (tool_calls, input_state and
    # output_state are dropped when the payload is built; see the heads-up at the top.)
    def span(agent_id: str, parent: str, out_summary: str, latency: float,
             tool_calls=None, status=SpanStatus.SUCCESS) -> SpanPayload:
        return SpanPayload(
            trace_id=trace_id,
            span_id=f"{agent_id}_{uuid.uuid4().hex[:12]}",
            parent_span_id=parent,
            agent_id=agent_id,
            event_type=EventType.AGENT_EXECUTION,
            input_state={"evidence": EVIDENCE},
            output_state={"claim": out_summary},
            input_summary=EVIDENCE,
            output_summary=out_summary,
            latency_ms=latency,
            status=status,
            start_time=now,
            end_time=now,
            tool_calls=tool_calls or [],
        )

    return [
        # Grounded: restates the evidence faithfully.
        span(
            "retriever", root,
            "Retrieved 3 customer profile records in 45ms from the production replica.",
            45.2,
            tool_calls=[{
                "tool_name": "db_query",
                "tool_args": {"table": "customer_profiles"},
                "result_summary": "3 rows returned",
                "result_count": 3,
                "status": "success",
            }],
        ),
        # Grounded analysis, no fabricated numbers.
        span(
            "analyst", root,
            "Analysis of the 3 retrieved profiles shows all records passed verification.",
            120.7,
        ),
        # Ungrounded: fabricated citation and inflated figures.
        span(
            "summarizer", root,
            "Zhang et al. (2024) proved that 300,000 customers experienced instant "
            "quantum telemetry synchronization across all regions.",
            88.5,
        ),
        # Note: the tool_calls below are dropped on send (see the heads-up at the top of the
        # file), so the backend does not get the tool result of 1 for this span.
        # Tool-claim mismatch: claims 10 sources, tool returned 1.
        span(
            "citation_agent", root,
            "Cross-referenced the findings against 10 independent external sources.",
            64.1,
            tool_calls=[{
                "tool_name": "web_search",
                "tool_args": {"query": "customer telemetry"},
                "result_summary": "1 result found",
                "result_count": 1,
                "status": "success",
            }],
        ),
        # Error span, so the dashboard's error/status handling is exercised too.
        span(
            "reporter", root,
            "Report generation failed before producing output.",
            12.0,
            status=SpanStatus.ERROR,
        ),
    ]


# Sends the trace and prints the result. Returns the process exit code: 0 = accepted,
# 1 = the backend did not answer 202.
def main() -> int:
    # Options: where the backend is, and the API key to send (the default is the backend's
    # built-in placeholder key from config.py).
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://localhost:8000")
    parser.add_argument("--api-key", default="change-me-to-a-secure-key")
    args = parser.parse_args()

    # Step 1: a new trace id each run (so repeated runs do not collide) and its five spans.
    trace_id = f"demo_trace_{uuid.uuid4().hex[:12]}"
    spans = build_trace(trace_id)
    payload = IngestRequest(spans=spans)

    # Step 2: POST the batch. model_dump_json() turns the model into JSON text (dates become
    # strings) and json.loads() turns that into plain data that httpx can send as the body.
    resp = httpx.post(
        f"{args.endpoint}/v1/ingest",
        json=json.loads(payload.model_dump_json()),
        headers={"X-API-Key": args.api_key},
        timeout=60.0,
    )
    print(f"POST /v1/ingest -> {resp.status_code} {resp.json()}")
    # 202 = "Accepted": the spans are stored and queued; the worker scores them later.
    if resp.status_code != 202:
        return 1

    # Step 3: show the trace id. The dashboard address is a guess: it swaps port 8000 in the
    # endpoint for 5173, the port docker-compose publishes the dashboard on. A dashboard
    # started with `npm run dev` in dashboard/ listens on 3000 instead (see package.json).
    print(f"\nTrace ID: {trace_id}")
    print(f"View it at: {args.endpoint.replace('8000', '5173')}/  (or GET {args.endpoint}/v1/traces/{trace_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
