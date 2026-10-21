"""The Telemetry Lab scenarios must build what they claim to build.

'drift' used to build the same five spans as 'hallucination', so the lab's drift button
demonstrated nothing. These tests check the spans each scenario sends, that the drift texts
really move the drift engine across its alert threshold, and that the read-back endpoint
reports a span that has not been scored as null rather than as a score.
"""

import os
import sys
import uuid

import httpx
import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.config import settings
from app.database import init_db
from app.main import create_app
from app.routers.ingest import (
    DRIFT_AGENT_ID,
    DRIFT_BASELINE_REPLIES,
    DRIFT_SHIFTED_REPLIES,
    DISAGREEMENT_EVIDENCE,
    SimulateRequest,
    build_scenario_spans,
)
from app.services.drift import DriftDetector

TRACE = "t" * 32
BASE = "abcd1234"


def spans_of(scenario: str):
    return build_scenario_spans(scenario, "a query", TRACE, BASE)


def test_drift_is_32_spans_of_one_demo_agent_and_not_the_hallucination_run():
    spans = spans_of("drift")

    assert len(spans) == 20 + 12
    assert {s.agent_id for s in spans} == {DRIFT_AGENT_ID}
    assert len({s.span_id for s in spans}) == 32
    assert all(len(s.span_id) <= 32 for s in spans)
    # Baseline topic first, shifted topic last, every text different.
    outputs = [s.output_summary for s in spans]
    assert outputs == DRIFT_BASELINE_REPLIES + DRIFT_SHIFTED_REPLIES
    assert len(set(outputs)) == 32
    assert outputs != [s.output_summary for s in spans_of("hallucination")]


def test_each_scenario_sends_the_agents_it_names():
    for scenario in ("clean", "hallucination", "tool_mismatch"):
        spans = spans_of(scenario)
        assert [s.agent_id for s in spans] == ["researcher", "retriever", "verifier", "analyst", "writer"]

    # Two different agents read the same evidence and contradict each other.
    first, second = spans_of("disagreement")
    assert (first.agent_id, second.agent_id) == ("analyst_a", "analyst_b")
    assert first.input_summary == second.input_summary == DISAGREEMENT_EVIDENCE
    assert first.output_summary != second.output_summary


def test_unknown_scenario_is_rejected_instead_of_running_the_clean_one():
    with pytest.raises(ValidationError):
        SimulateRequest(scenario="no_such_scenario")


def test_the_drift_texts_cross_the_alert_threshold_and_the_same_topic_does_not():
    """Runs the real embedding model and the real drift engine on the scenario's texts."""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(
        "sentence-transformers/all-MiniLM-L6-v2",
        cache_folder=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
    )

    def final_distance(texts):
        detector = DriftDetector()
        distance = None
        for text in texts:
            embedding = model.encode(text, normalize_embeddings=True)
            distance = detector.analyze(DRIFT_AGENT_ID, embedding=embedding).window_centroid_distance
        return distance

    threshold = 0.3  # DRIFT_DETECTED in services/alerting.py
    shifted = final_distance(DRIFT_BASELINE_REPLIES + DRIFT_SHIFTED_REPLIES)
    # Control: after the same 20 baseline replies, 12 more on the baseline topic.
    unshifted = final_distance(DRIFT_BASELINE_REPLIES + DRIFT_BASELINE_REPLIES[:12])

    assert shifted > threshold
    assert unshifted < threshold


@pytest.mark.asyncio
async def test_result_endpoint_shows_unscored_spans_as_null_and_hides_real_traces():
    await init_db()
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={"X-API-Key": settings.api_key}
    ) as client:
        started = await client.post("/v1/simulate", json={"scenario": "disagreement"})
        assert started.status_code == 200
        assert started.json()["accepted"] == 2

        result = (await client.get(f"/v1/simulate/{started.json()['trace_id']}")).json()
        assert [s["agent_id"] for s in result["spans"]] == ["analyst_a", "analyst_b"]
        # A worker may be running against this database; whatever it has not scored yet must
        # read as null, never as a default.
        for s in result["spans"]:
            assert s["evaluated"] or all(
                s[k] is None
                for k in ("grounding_score", "tool_claim_score", "disagreement_score", "overall_risk_score")
            )

        # A trace that did not come from the simulator is not readable through this route.
        real_trace = uuid.uuid4().hex
        await client.post(
            "/v1/ingest",
            json={"spans": [{"trace_id": real_trace, "span_id": uuid.uuid4().hex[:16], "agent_id": "someone"}]},
        )
        assert (await client.get(f"/v1/simulate/{real_trace}")).status_code == 404
        assert (await client.get("/v1/simulate/does-not-exist")).status_code == 404
