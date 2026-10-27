"""Regression tests for four small API-surface bugs found in the Ponytail review.

- AGENTPULSE_LOG_LEVEL in lower case crashed the worker at start-up (#22)
- an X-API-Key header with a non-ASCII byte answered 500 on every path (#44)
- limit=-1 on /v1/traces and /v1/alerts switched off the 200-row cap (#45)

Key management by issued keys (#21) is tested in test_api_keys.py.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize("raw, expected", [("info", "INFO"), ("debug", "DEBUG"), ("Warning", "WARNING")])
def test_the_log_level_is_upper_cased_once_in_config(monkeypatch, raw, expected):
    """worker.py and retention_cli.py pass it straight to getattr(logging, ...)."""
    from app.config import BackendConfig

    monkeypatch.setenv("AGENTPULSE_LOG_LEVEL", raw)
    assert BackendConfig().log_level == expected


class TestApiSurface:
    ENV = {"X-API-Key": "env-key-under-test"}

    @pytest.fixture
    def client(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "api_key", "env-key-under-test")
        monkeypatch.setattr(settings, "local_dev_mode", False)

        from app.main import app

        with TestClient(app) as c:
            yield c

    def test_a_non_ascii_key_is_a_401_not_a_500(self, client):
        """compare_digest raises TypeError on str with a non-ASCII character, and
        Starlette decodes header bytes as latin-1, so any byte >= 0x80 reached it."""
        bad = {"X-API-Key": b"\xe9"}
        assert client.get("/v1/metrics", headers=bad).status_code == 401
        # Public paths do not need a key, so a wrong one must not break them either.
        assert client.get("/v1/health/live", headers=bad).status_code == 200

    @pytest.mark.parametrize("path", ["/v1/traces", "/v1/alerts"])
    def test_a_list_limit_below_one_is_rejected(self, client, path):
        """SQLite reads LIMIT -1 as 'no limit', which removed the 200-row cap."""
        assert client.get(f"{path}?limit=-1", headers=self.ENV).status_code == 422
        assert client.get(f"{path}?limit=0", headers=self.ENV).status_code == 422
        assert client.get(f"{path}?limit=201", headers=self.ENV).status_code == 422
        assert client.get(f"{path}?limit=1", headers=self.ENV).status_code == 200


    def test_drift_reports_no_baseline_size_for_an_agent_without_a_drift_record(self, client):
        """Review S3: an agent with no DriftRecord used to report baseline_size 0, which the
        Drift view printed as "0 spans before latest". Unknown is null, not 0."""
        import asyncio
        import uuid

        from app.database import get_session
        from app.models import AgentRecord

        agent_id = f"no-drift-{uuid.uuid4().hex[:8]}"

        async def seed():
            async with get_session() as session:
                session.add(AgentRecord(agent_id=agent_id, total_spans=15))
                await session.commit()

        asyncio.run(seed())
        rows = client.get("/v1/drift", headers=self.ENV).json()["agents"]
        mine = next(r for r in rows if r["agent_id"] == agent_id)
        assert mine["baseline_size"] is None
