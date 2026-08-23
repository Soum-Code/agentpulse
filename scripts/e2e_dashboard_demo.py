"""Send a realistic multi-agent trace to a running AgentPulse backend.

Used to verify the dashboard end-to-end against real traces (not fixtures):
run the backend, run this, then confirm the trace, its per-span evaluations,
and any triggered alerts appear in the dashboard.

The trace deliberately mixes grounded and ungrounded spans so the evaluator
produces a spread of risk scores rather than a single label.

Usage:
    python scripts/e2e_dashboard_demo.py [--endpoint http://localhost:8000]
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))

import httpx

from agentpulse.schemas.enums import EventType, SpanStatus
from agentpulse.schemas.events import IngestRequest, SpanPayload


EVIDENCE = (
    "The database query executed in 45ms and returned 3 verified customer "
    "profile records from the production replica."
)


def build_trace(trace_id: str) -> list[SpanPayload]:
    now = datetime.now(timezone.utc)
    root = f"root_{uuid.uuid4().hex[:12]}"

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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://localhost:8000")
    parser.add_argument("--api-key", default="change-me-to-a-secure-key")
    args = parser.parse_args()

    trace_id = f"demo_trace_{uuid.uuid4().hex[:12]}"
    spans = build_trace(trace_id)
    payload = IngestRequest(spans=spans)

    resp = httpx.post(
        f"{args.endpoint}/v1/ingest",
        json=json.loads(payload.model_dump_json()),
        headers={"X-API-Key": args.api_key},
        timeout=60.0,
    )
    print(f"POST /v1/ingest -> {resp.status_code} {resp.json()}")
    if resp.status_code != 202:
        return 1

    print(f"\nTrace ID: {trace_id}")
    print(f"View it at: {args.endpoint.replace('8000', '5173')}/  (or GET {args.endpoint}/v1/traces/{trace_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
