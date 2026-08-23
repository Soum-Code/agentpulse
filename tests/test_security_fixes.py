"""Regression tests for the production-hardening pass:
- API key auth is actually enforced (was previously bypassed for every path)
- Not-found routes return real HTTP 404s (previously returned 200 with a tuple body)
- The datasets endpoint rejects path traversal
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_ingest_without_api_key_is_rejected(client):
    response = client.post(
        "/v1/ingest",
        json={"spans": [], "service_name": "unauthorized_test"},
    )
    assert response.status_code == 401


def test_ingest_with_wrong_api_key_is_rejected(client):
    response = client.post(
        "/v1/ingest",
        json={"spans": [], "service_name": "unauthorized_test"},
        headers={"X-API-Key": "totally-wrong-key"},
    )
    assert response.status_code == 401


def test_ingest_with_correct_api_key_is_accepted(client):
    response = client.post(
        "/v1/ingest",
        json={"spans": [], "service_name": "authorized_test"},
        headers={"X-API-Key": "change-me-to-a-secure-key"},
    )
    assert response.status_code == 202


def test_missing_trace_returns_real_404(client):
    response = client.get("/v1/traces/this-trace-does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"] == "Trace not found"


def test_missing_agent_health_returns_real_404(client):
    response = client.get("/v1/agents/no-such-agent/health")
    assert response.status_code == 404
    assert response.json()["detail"] == "Agent not found"


def test_dataset_path_traversal_is_rejected(client):
    response = client.get("/v1/datasets/..%2F..%2Fbackend%2Fpyproject.json")
    assert response.status_code == 404


def test_valid_dataset_name_still_works(client):
    response = client.get("/v1/datasets/v1.0_test")
    assert response.status_code == 200
    assert "cases" in response.json()
