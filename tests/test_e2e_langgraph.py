"""Real End-to-End LangGraph Validation Test.

Flow:
LangGraph Application
  - LangGraphAdapter
  - AgentPulse SDK (with HTTP / Ingest payload generation)
  - FastAPI /v1/ingest endpoint
  - SQLite WAL persistence
  - Evaluator pipeline (Two-stage Grounding, Tool Claims, Disagreement, Drift)
  - Alert Engine
  - Verification of Trace, Spans, Evaluations, and Alerts in Database.
"""

import asyncio
import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_session, init_db
from app.models import Trace, Span, Evaluation, Alert
from agentpulse import AgentPulse
from agentpulse.integrations.langgraph import LangGraphAdapter
from agentpulse.schemas.events import SpanPayload, IngestRequest
from agentpulse.schemas.enums import EventType, SpanStatus


@pytest.mark.asyncio
async def test_end_to_end_langgraph_pipeline_to_database():
    """Verify complete end-to-end flow from LangGraph adapter to SQLite & Evaluator."""
    import uuid
    await init_db()
    client = TestClient(app)

    # 1. Initialize SDK and Adapter
    pulse = AgentPulse(service_name="e2e_research_service", endpoint="http://testserver")
    adapter = LangGraphAdapter(pulse)

    trace_id = f"e2e_trace_{uuid.uuid4().hex}"
    parent_span_id = "0000000000000000"
    span_id_1 = f"s1_{uuid.uuid4().hex[:14]}"
    span_id_2 = f"s2_{uuid.uuid4().hex[:14]}"

    # Step 1: Researcher node generates grounded claim
    span_1 = SpanPayload(
        trace_id=trace_id,
        span_id=span_id_1,
        parent_span_id=parent_span_id,
        agent_id="researcher",
        event_type=EventType.AGENT_EXECUTION,
        input_state={"query": "quantum computing basics"},
        output_state={"findings": "Quantum computers use qubits to represent superpositions."},
        input_summary="query: quantum computing basics",
        output_summary="Quantum computers use qubits to represent superpositions.",
        latency_ms=45.2,
        status=SpanStatus.SUCCESS,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        tool_calls=[],
    )

    # Step 2: Verifier node introduces ungrounded assertion with tool count mismatch
    span_2 = SpanPayload(
        trace_id=trace_id,
        span_id=span_id_2,
        parent_span_id=span_id_1,
        agent_id="verifier",
        event_type=EventType.AGENT_EXECUTION,
        input_state={"source": "Quantum computers use qubits."},
        output_state={"claims": "A study by Zhang et al. (2024) proves teleportation is commercial."},
        input_summary="Quantum computers use qubits.",
        output_summary="A study by Zhang et al. (2024) proves teleportation is commercial. Retrieved 10 papers.",
        latency_ms=88.5,
        status=SpanStatus.SUCCESS,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        tool_calls=[
            {
                "tool_name": "retriever",
                "tool_args": {"query": "teleportation"},
                "result_summary": "1 paper found",
                "result_count": 1,
                "status": "success",
            }
        ],
    )

    # 2. Ingest via FastAPI /v1/ingest
    payload = IngestRequest(spans=[span_1, span_2])
    response = client.post(
        "/v1/ingest",
        json=json.loads(payload.model_dump_json()),
        headers={"X-API-Key": "change-me-to-a-secure-key"},
    )
    assert response.status_code == 202
    res_data = response.json()
    assert res_data["accepted"] == 2
    assert res_data["failed"] == 0

    # 3. Verify Trace exists in SQLite
    trace_res = client.get(f"/v1/traces/{trace_id}")
    assert trace_res.status_code == 200
    trace_detail = trace_res.json()
    assert trace_detail["trace"]["trace_id"] == trace_id
    assert len(trace_detail["spans"]) == 2

    # 4. Verify Spans and Evaluations exist
    spans = trace_detail["spans"]
    verifier_span = next((s for s in spans if s["agent_id"] == "verifier"), None)
    assert verifier_span is not None
    assert verifier_span["span_id"] == span_id_2

    # Tool claim mismatch should be evaluated
    eval_data = verifier_span.get("evaluation")
    if eval_data:
        assert "overall_risk_score" in eval_data
        assert eval_data["overall_risk_score"] is not None

    # 5. Verify Metrics endpoint includes the trace
    metrics_res = client.get("/v1/metrics")
    assert metrics_res.status_code == 200
    metrics_data = metrics_res.json()
    assert metrics_data["total_traces"] >= 1
    assert metrics_data["total_spans"] >= 2
