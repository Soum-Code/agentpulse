"""AgentPulse Backend — FastAPI application entry point.

Lifecycle:
  1. Startup: Init DB, load evaluation models, create service instances
  2. Runtime: Serve REST + WebSocket APIs
  3. Shutdown: Close DB connections, flush pending evaluations
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlmodel import select

from app.config import settings
from app.database import get_session, init_db, close_db
from app.middleware import APIKeyMiddleware, RateLimitMiddleware
from app.models import Baseline
from app.routers import (
    agents_router,
    alerts_router,
    drift_router,
    metrics_router,
    traces_router,
)
from app.routers.ingest import router as ingest_router
from app.routers.websocket import router as ws_router, ws_manager
from app.services.alerting import AlertEngine
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("agentpulse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # ── Startup ──
    logger.info("AgentPulse backend starting...")

    # Init database
    await init_db()

    # Load evaluation models (this may take 30-60s on first run)
    try:
        from app.services.grounding import load_models
        load_models(
            nli_model_name=settings.nli_model,
            embedding_model_name=settings.embedding_model,
            cache_dir=settings.model_cache_dir,
            use_onnx=settings.use_onnx,
        )
    except Exception as exc:
        logger.error("Failed to load models (evaluator will be degraded): %s", exc)

    # Create service instances
    drift_detector = DriftDetector(
        window_size=settings.drift_window_size,
        drift_threshold=settings.drift_threshold,
    )
    alert_engine = AlertEngine(
        hallucination_threshold=settings.hallucination_threshold,
        drift_threshold=settings.drift_threshold,
        asi_low_threshold=settings.asi_low_threshold,
        cooldown_seconds=settings.alert_cooldown_seconds,
        max_per_hour=settings.alert_max_per_hour,
        webhook_url=settings.webhook_url,
    )
    evaluator = EvaluationPipeline(
        drift_detector=drift_detector,
        alert_engine=alert_engine,
    )

    # Restore persisted drift baselines so a restart doesn't cold-start every agent
    try:
        restored = 0
        async with get_session() as session:
            result = await session.execute(
                select(Baseline).where(Baseline.baseline_type == "embedding_centroid")
            )
            for baseline in result.scalars().all():
                if baseline.data:
                    drift_detector.load_centroid(baseline.agent_id, baseline.data, baseline.sample_count)
                    restored += 1
        logger.info("Restored drift baselines for %d agent(s)", restored)
    except Exception as exc:
        logger.error("Failed to restore drift baselines: %s", exc)

    if not settings.local_dev_mode and settings.api_key == "change-me-to-a-secure-key":
        logger.warning(
            "AGENTPULSE_LOCAL_DEV_MODE is false but AGENTPULSE_API_KEY is still the "
            "default placeholder — set a real secret before exposing this beyond localhost."
        )

    # Store on app state for access in routers
    app.state.evaluator = evaluator
    app.state.drift_detector = drift_detector
    app.state.alert_engine = alert_engine
    app.state.ws_manager = ws_manager

    logger.info("AgentPulse backend ready on %s:%d", settings.host, settings.port)

    yield

    # ── Shutdown ──
    logger.info("AgentPulse backend shutting down...")
    await close_db()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="AgentPulse",
        description=(
            "Lightweight observability backend for multi-agent LLM systems. "
            "Provides continuous hallucination risk estimation, drift detection, "
            "and alerting."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── Middleware ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(APIKeyMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=settings.rate_limit_max_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )

    # ── Routers ──
    app.include_router(ingest_router)
    app.include_router(traces_router)
    app.include_router(agents_router)
    app.include_router(drift_router)
    app.include_router(alerts_router)
    app.include_router(metrics_router)
    app.include_router(ws_router)
    from app.routers.experiments import router as experiments_router
    app.include_router(experiments_router)

    # ── Root ──
    @app.get("/")
    async def root():
        return {
            "name": "AgentPulse",
            "version": "0.1.0",
            "docs": "/docs",
            "health": "/v1/health",
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
