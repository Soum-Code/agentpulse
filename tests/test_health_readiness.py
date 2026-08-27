"""Liveness and readiness semantics.

Acceptance criterion: an operator *and an automated deployment system* can
distinguish process liveness from platform readiness and evaluator readiness
using explicit machine-readable state, without relying on HTTP 200 alone.

FOUR THINGS, KEPT SEPARATE

    liveness             process running; consults nothing
    API readiness        this process can serve; depends on the database
    evaluator readiness  the worker FLEET can evaluate; depends on heartbeats
    degraded             running correctly on the wrong backend

The separation is not cosmetic. Each check depends only on what it actually
needs, so a database blip cannot restart a healthy process, a missing worker
cannot take a serving API out of the load balancer, and a degraded-but-correct
system is not reported as unhealthy.

THE API IS NEVER AN EVALUATOR. It does not claim jobs, so its own model state
says nothing about whether spans can be evaluated. Several tests pin that,
because the tempting shortcut — "API has models, therefore evaluation works" —
is exactly what broke earlier probes in this project.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.models import WorkerHeartbeat  # noqa: E402
from app.services.platform_health import WORKER_STALE_AFTER_SECONDS  # noqa: E402
from app.services.readiness import (  # noqa: E402
    api_readiness,
    check_database,
    evaluator_readiness,
    liveness,
    overall_state,
)


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def migrate(db: Path) -> None:
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db.as_posix()}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND), env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, f"migration failed:\n{result.stderr}"


@pytest.fixture
def db_session(tmp_path):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    db = tmp_path / "readiness.db"
    migrate(db)
    engine = create_async_engine(f"sqlite+aiosqlite:///{db.as_posix()}")
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def factory():
        async with maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    yield factory
    asyncio.run(engine.dispose())


def run(fn):
    return asyncio.run(fn())


def heartbeat(worker_id: str, *, age_seconds: float = 0, backend: str = "onnx",
              degraded: bool = False, status: str = "running") -> WorkerHeartbeat:
    stamp = now() - timedelta(seconds=age_seconds)
    return WorkerHeartbeat(
        worker_id=worker_id, hostname="h", pid=1, status=status,
        started_at=stamp, last_heartbeat_at=stamp,
        nli_backend=backend, embedding_backend="pytorch",
        backend_degraded=degraded,
        fallback_reason="ImportError: _attention_scale" if degraded else None,
    )


class TestLiveness:
    def test_liveness_consults_nothing(self):
        """Alive means alive.

        A liveness probe that touched the database would restart a healthy
        process during a database blip, turning a small outage into a large
        one. This takes no session argument at all, which makes that mistake
        impossible rather than merely discouraged.
        """
        result = liveness()
        assert result["alive"] is True
        assert result["pid"] == os.getpid()
        assert result["uptime_seconds"] >= 0


class TestApiReadiness:
    def test_ready_when_database_reachable(self, db_session):
        async def go():
            async with db_session() as session:
                result = await api_readiness(session)
                assert result["ready"] is True
                assert result["checks"]["database"]["ok"] is True
                assert result["reasons"] == []
        run(go)

    def test_not_ready_when_database_fails(self, db_session):
        """A broken database must make the API not ready, with the reason."""
        class BrokenSession:
            async def execute(self, *_a, **_k):
                raise RuntimeError("database is locked")

        async def go():
            result = await api_readiness(BrokenSession())
            assert result["ready"] is False
            assert "database unavailable" in result["reasons"][0]
            assert "database is locked" in result["checks"]["database"]["detail"]
        run(go)

    def test_api_readiness_does_not_depend_on_models(self, db_session):
        """The central contract decision.

        The API performs no inference, so gating its readiness on model state
        would hold it out of a load balancer over a capability it never uses.
        No worker exists in this test and no models are loaded, and the API is
        still ready to serve.
        """
        async def go():
            async with db_session() as session:
                result = await api_readiness(session)
                assert result["ready"] is True
                assert "models" not in result["checks"], \
                    "API readiness must not check models"
        run(go)


class TestEvaluatorReadiness:
    def test_not_ready_when_no_worker(self, db_session):
        """API alive, worker absent — spans queue but nothing evaluates them."""
        async def go():
            async with db_session() as session:
                result = await evaluator_readiness(session)
                assert result["ready"] is False
                assert result["workers_alive"] == 0
                assert any("no evaluation worker" in r for r in result["reasons"])
        run(go)

    def test_ready_when_worker_alive(self, db_session):
        async def go():
            async with db_session() as session:
                session.add(heartbeat("w1"))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["ready"] is True
                assert result["workers_alive"] == 1
                assert result["backend_distribution"] == {"onnx": 1}
                assert result["degraded"] is False
                assert result["reasons"] == []
        run(go)

    def test_stale_worker_is_not_ready(self, db_session):
        """A SIGKILLed worker announces nothing, so liveness must decay."""
        async def go():
            async with db_session() as session:
                session.add(heartbeat("dead", age_seconds=WORKER_STALE_AFTER_SECONDS + 30))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["ready"] is False
                assert result["workers_alive"] == 0
                assert result["workers_registered"] == 1
                assert result["workers_stale"] == 1
        run(go)

    def test_stopping_worker_does_not_count_as_ready(self, db_session):
        """A worker shutting down gracefully should not advertise capacity."""
        async def go():
            async with db_session() as session:
                session.add(heartbeat("bye", status="stopping"))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["ready"] is False
                assert result["workers_alive"] == 0
        run(go)

    def test_onnx_backend_reported_not_degraded(self, db_session):
        async def go():
            async with db_session() as session:
                session.add(heartbeat("w-onnx", backend="onnx", degraded=False))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["ready"] is True
                assert result["backend_distribution"] == {"onnx": 1}
                assert result["degraded"] is False
                assert result["degraded_workers"] == 0
        run(go)

    def test_pytorch_fallback_is_ready_but_degraded(self, db_session):
        """Degraded is not unhealthy.

        A PyTorch fallback produces identical results at roughly half the
        speed. It must still be READY — pulling it from service would trade a
        slowdown for an outage — while being clearly reported as degraded.
        """
        async def go():
            async with db_session() as session:
                session.add(heartbeat("w-slow", backend="pytorch", degraded=True))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["ready"] is True, "degraded must not mean not-ready"
                assert result["degraded"] is True
                assert result["degraded_workers"] == 1
                assert result["backend_distribution"] == {"pytorch": 1}
                assert any("degraded inference backend" in r for r in result["reasons"])
        run(go)

    def test_mixed_fleet_reports_both_backends(self, db_session):
        async def go():
            async with db_session() as session:
                session.add(heartbeat("ok", backend="onnx"))
                session.add(heartbeat("slow", backend="pytorch", degraded=True))
                await session.commit()

                result = await evaluator_readiness(session)
                assert result["workers_alive"] == 2
                assert result["backend_distribution"] == {"onnx": 1, "pytorch": 1}
                assert result["degraded_workers"] == 1
        run(go)


class TestOverallState:
    @staticmethod
    def evaluator(ready=True, degraded=False):
        return {"ready": ready, "degraded": degraded,
                "reasons": [] if ready else ["no evaluation worker is alive"]}

    @staticmethod
    def api(ready=True):
        return {"ready": ready, "reasons": [] if ready else ["database unavailable"]}

    def test_healthy(self):
        v = overall_state(self.api(), self.evaluator(), False)
        assert v["state"] == "healthy"
        assert v["reasons"] == []

    def test_api_alive_but_no_worker_is_failing(self):
        """The state HTTP 200 cannot express: serving, but nothing evaluates."""
        v = overall_state(self.api(), self.evaluator(ready=False), False)
        assert v["state"] == "failing"
        assert any("no evaluation worker" in r for r in v["reasons"])

    def test_database_down_is_failing(self):
        v = overall_state(self.api(ready=False), self.evaluator(), False)
        assert v["state"] == "failing"

    def test_degraded_backend_is_degraded_not_failing(self):
        v = overall_state(self.api(), self.evaluator(degraded=True), False)
        assert v["state"] == "degraded"

    def test_api_backend_degraded_also_reported(self):
        v = overall_state(self.api(), self.evaluator(), True)
        assert v["state"] == "degraded"


class TestHealthEndpoints:
    """The machine-readable surface a deployment system polls."""

    @staticmethod
    def client():
        from fastapi.testclient import TestClient

        from app.main import app
        return TestClient(app)

    def test_liveness_endpoint_is_dependency_free(self):
        with self.client() as client:
            response = client.get("/v1/health/live")
        assert response.status_code == 200
        body = response.json()
        assert body["alive"] is True
        assert "pid" in body and "uptime_seconds" in body

    def test_readiness_endpoint_reports_api_only(self):
        with self.client() as client:
            response = client.get("/v1/health/ready")
        assert response.status_code in (200, 503)
        body = response.json()
        assert "ready" in body
        assert "database" in body["checks"]

    def test_evaluator_endpoint_503_when_no_worker(self):
        """A deployment system must see a non-200 when nothing can evaluate.

        The body carries the reason, so the status code is a signal rather than
        the whole story — which is the point of the acceptance criterion.
        """
        with self.client() as client:
            response = client.get("/v1/health/evaluator")
        body = response.json()
        if body["workers_alive"] == 0:
            assert response.status_code == 503
            assert body["ready"] is False
            assert body["reasons"]
        else:
            assert response.status_code == 200

    def test_health_preserves_backward_compatible_shape(self):
        """`dashboard/src/lib/api.ts` declares status/models/version.

        The dashboard is frozen and must not be broken by this change, so the
        original three fields keep their names and types even though `models`
        now means something narrower.
        """
        with self.client() as client:
            response = client.get("/v1/health")
        assert response.status_code == 200
        body = response.json()

        assert isinstance(body["status"], str)
        assert isinstance(body["version"], str)
        assert isinstance(body["models"], dict)
        assert all(isinstance(v, bool) for v in body["models"].values()), \
            "models must remain a boolean map -- the dashboard types it that way"

    def test_health_exposes_all_four_states_separately(self):
        with self.client() as client:
            response = client.get("/v1/health")
        body = response.json()

        assert body["liveness"]["alive"] is True
        assert "api" in body["readiness"] and "evaluator" in body["readiness"]
        assert isinstance(body["readiness"]["api"]["ready"], bool)
        assert isinstance(body["readiness"]["evaluator"]["ready"], bool)
        assert body["state"] in ("healthy", "degraded", "failing")
        assert isinstance(body["degraded"], bool)
        assert body["models_required_by_api"] is False

    def test_api_does_not_load_models_by_default(self):
        """The 1.24 GB cleanup, justified by the contract above.

        Checked through the health response rather than by inspecting settings,
        so this fails if the flag defaults change OR if something starts loading
        models behind the flag's back.
        """
        with self.client() as client:
            response = client.get("/v1/health")
        body = response.json()

        assert body["models_required_by_api"] is False
        assert body["readiness"]["api"]["ready"] is True, (
            "the API must be ready without models -- that is the whole "
            "justification for not loading them"
        )
