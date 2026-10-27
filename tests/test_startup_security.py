"""Fail-closed start-up: the placeholder API key, dev mode in /v1/health, the compose healthcheck.

In short: with AGENTPULSE_LOCAL_DEV_MODE off, the backend refuses to start while AGENTPULSE_API_KEY
is still the public placeholder (it only logged a warning before). With dev mode on (the default
for a plain local run, the tests and the Hugging Face demo) nothing is refused, and /v1/health
says it is in dev mode and why. Nothing changes for a deployment that sets a real key, such as
the Azure VM (docker-compose.yml sets AGENTPULSE_LOCAL_DEV_MODE=false, .env holds the key).
"""

import os
import re
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.config import (
    PLACEHOLDER_API_KEY,
    BackendConfig,
    dev_mode_reason,
    settings,
    startup_security_problem,
)
from app.main import create_app

ROOT = Path(__file__).resolve().parent.parent
# Not a real key: a made-up value for the tests, long enough not to be a substring of any message.
SOME_KEY = "unit-test-key-0123456789abcdef"


def _cfg(*, dev: bool, key: str) -> BackendConfig:
    cfg = BackendConfig()
    cfg.local_dev_mode = dev
    cfg.api_key = key
    return cfg


# ── the decision, as plain functions ────────────────────────────────────────────────────


def test_not_dev_mode_with_the_placeholder_key_is_a_problem_that_says_what_to_set():
    problem = startup_security_problem(_cfg(dev=False, key=PLACEHOLDER_API_KEY))
    assert problem is not None
    assert "AGENTPULSE_API_KEY" in problem
    assert "AGENTPULSE_LOCAL_DEV_MODE" in problem  # names both ways out


def test_not_dev_mode_with_a_real_key_is_fine():
    assert startup_security_problem(_cfg(dev=False, key=SOME_KEY)) is None


@pytest.mark.parametrize("key", [PLACEHOLDER_API_KEY, SOME_KEY])
def test_dev_mode_is_never_refused(key):
    assert startup_security_problem(_cfg(dev=True, key=key)) is None


def test_the_defaults_are_still_dev_mode_with_the_placeholder_so_a_local_run_starts(monkeypatch):
    """Nothing is changed for a plain local run or a test run: the defaults start."""
    monkeypatch.delenv("AGENTPULSE_LOCAL_DEV_MODE", raising=False)
    monkeypatch.delenv("AGENTPULSE_API_KEY", raising=False)
    cfg = BackendConfig()
    assert cfg.local_dev_mode is True and cfg.api_key == PLACEHOLDER_API_KEY
    assert startup_security_problem(cfg) is None


def test_the_live_vm_configuration_starts(monkeypatch):
    """deploy/azure: docker-compose.yml sets dev mode off and .env holds a real key."""
    monkeypatch.setenv("AGENTPULSE_LOCAL_DEV_MODE", "false")
    monkeypatch.setenv("AGENTPULSE_API_KEY", SOME_KEY)
    cfg = BackendConfig()
    assert cfg.local_dev_mode is False
    assert startup_security_problem(cfg) is None
    assert dev_mode_reason(cfg) is None


def test_the_reason_names_the_setting_and_never_the_key():
    reason = dev_mode_reason(_cfg(dev=True, key=SOME_KEY))
    assert reason is not None and "AGENTPULSE_LOCAL_DEV_MODE" in reason
    assert SOME_KEY not in reason
    assert "placeholder" not in reason  # a real key is set, so there is nothing to add


def test_the_reason_adds_the_placeholder_when_it_is_still_in_use():
    reason = dev_mode_reason(_cfg(dev=True, key=PLACEHOLDER_API_KEY))
    assert reason is not None and "placeholder" in reason


# ── the real start-up ───────────────────────────────────────────────────────────────────


def test_the_backend_refuses_to_start_not_in_dev_mode_with_the_placeholder_key(monkeypatch):
    monkeypatch.setattr(settings, "local_dev_mode", False)
    monkeypatch.setattr(settings, "api_key", PLACEHOLDER_API_KEY)
    with pytest.raises(RuntimeError) as refused:
        with TestClient(create_app()):
            pass
    assert "AGENTPULSE_API_KEY" in str(refused.value)


def test_the_backend_starts_not_in_dev_mode_with_a_real_key(monkeypatch):
    monkeypatch.setattr(settings, "local_dev_mode", False)
    monkeypatch.setattr(settings, "api_key", SOME_KEY)
    with TestClient(create_app()) as client:
        assert client.get("/v1/health/live").status_code == 200
        # not in dev mode, so a read needs the key
        assert client.get("/v1/metrics").status_code == 401
        assert client.get("/v1/metrics", headers={"X-API-Key": SOME_KEY}).status_code == 200


def test_the_backend_starts_in_dev_mode_with_the_placeholder_key(monkeypatch):
    monkeypatch.setattr(settings, "local_dev_mode", True)
    monkeypatch.setattr(settings, "api_key", PLACEHOLDER_API_KEY)
    with TestClient(create_app()) as client:
        assert client.get("/v1/health/live").status_code == 200


# ── /v1/health ──────────────────────────────────────────────────────────────────────────


def test_health_says_it_is_in_dev_mode_and_why(monkeypatch):
    monkeypatch.setattr(settings, "local_dev_mode", True)
    monkeypatch.setattr(settings, "api_key", SOME_KEY)
    with TestClient(create_app()) as client:
        body = client.get("/v1/health").json()
    assert body["dev_mode"] is True
    assert "AGENTPULSE_LOCAL_DEV_MODE" in body["dev_mode_reason"]
    assert SOME_KEY not in str(body)


def test_health_has_no_reason_when_dev_mode_is_off(monkeypatch):
    monkeypatch.setattr(settings, "local_dev_mode", False)
    monkeypatch.setattr(settings, "api_key", SOME_KEY)
    with TestClient(create_app()) as client:
        body = client.get("/v1/health").json()
    assert body["dev_mode"] is False
    assert body["dev_mode_reason"] is None
    assert SOME_KEY not in str(body)


def test_dev_mode_does_not_change_the_state_the_deploy_script_reads(monkeypatch):
    """deploy/azure/deploy.sh reads state and readiness from /v1/health. The dev-mode fields
    are separate keys, so those values are the same with dev mode on and off."""
    seen = {}
    for dev in (True, False):
        monkeypatch.setattr(settings, "local_dev_mode", dev)
        monkeypatch.setattr(settings, "api_key", SOME_KEY)
        with TestClient(create_app()) as client:
            body = client.get("/v1/health").json()
        seen[dev] = {k: body[k] for k in ("status", "state", "reasons", "version")}
        assert body["readiness"]["api"]["ready"] is True
    assert seen[True] == seen[False]


# ── the compose healthcheck ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ["docker-compose.yml", "docker-compose.release.yml"])
def test_the_backend_healthcheck_asks_for_readiness_not_just_liveness(name):
    """/v1/health answers 200 whenever the process is up; /v1/health/ready answers 503 when the
    database does not, which is what a container health status should follow."""
    text = (ROOT / name).read_text(encoding="utf-8")
    backend = text[text.index("backend:") :]
    backend = backend[: backend.index("worker:")]
    tests = re.findall(r"test: \[.*\]", backend)
    assert len(tests) == 1, "the backend service has exactly one healthcheck"
    assert "/v1/health/ready" in tests[0]
    assert "/v1/health'" not in tests[0]
