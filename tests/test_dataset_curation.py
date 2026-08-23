"""Integration tests for Dataset APIs and Trace-to-Dataset Curation."""

import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_list_datasets_endpoint(client):
    res = client.get("/v1/datasets")
    assert res.status_code == 200
    data = res.json()
    assert "datasets" in data
    assert len(data["datasets"]) >= 3


def test_get_dataset_detail(client):
    res = client.get("/v1/datasets/v1.0_dev")
    assert res.status_code == 200
    data = res.json()
    assert data["dataset_version"] == "v1.0_dev"
    assert len(data["cases"]) >= 5


def test_curate_trace_to_dataset(client):
    payload = {
        "case_id": "curated_test_01",
        "input_query": "Test query for curation",
        "agent_claim": "Test claim asserted by agent",
        "evidence": "Source premise document text",
        "expected_classification": "CONTRADICTED",
        "expected_failure_type": "GROUNDING_CONTRADICTION",
        "is_failure": True,
        "trace_id": "trace_test_curation_001",
        "domain": "research",
        "operator_notes": "Curated by SRE operator from incident inbox.",
    }
    res = client.post(
        "/v1/datasets/v1.0_curated/cases",
        json=payload,
        headers={"X-API-Key": "change-me-to-a-secure-key"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["case"]["case_id"] == "curated_test_01"
