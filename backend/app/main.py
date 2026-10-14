"""AgentPulse Backend — FastAPI application entry point.

Lifecycle:
  1. Startup: Init DB, load evaluation models, create service instances
  2. Runtime: Serve REST + WebSocket APIs
  3. Shutdown: Close DB connections, flush pending evaluations
"""

# WHAT THIS FILE IS FOR
# It builds the FastAPI app (the web server object) and sets up what happens when the
# server starts and stops (the "lifespan"). It also adds the middleware, registers the
# routers (groups of URL routes) and can serve the built dashboard files.
# The API stores incoming spans and queues one evaluation job per span. Scoring is
# done by a separate process, `python -m app.worker`.
#
# NOTE: the lifecycle list in the docstring above is out of date. By default no
# models are loaded here, and at shutdown only the database is closed (nothing is
# flushed). The real steps are written out in `lifespan` below.
#
# HOW IT FITS IN
# uvicorn (the program that runs the web server) loads the `app` object made at the
# bottom of this file, as `app.main:app`. This file uses config.py, database.py,
# middleware.py, models.py (Baseline), the routers in routers/ and the services in
# services/.

from __future__ import annotations

import logging
# os is used to read the AGENTPULSE_STATIC_DIR environment variable.
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
# CORSMiddleware adds the headers a browser needs before it lets a web page call
# this API from another address.
from fastapi.middleware.cors import CORSMiddleware
# StaticFiles serves ready-made files (the built dashboard) from a folder.
from fastapi.staticfiles import StaticFiles

# select(...) builds a SQL SELECT query.
from sqlmodel import select

from app.config import settings
from app.database import get_session, init_db, close_db
from app.middleware import APIKeyMiddleware, RateLimitMiddleware, RequestMetricsMiddleware
from app.models import Baseline
# Each router below is a group of URL routes defined in the routers package.
from app.routers import (
    agents_router,
    alerts_router,
    drift_router,
    keys_router,
    metrics_router,
    traces_router,
)
from app.routers.ingest import router as ingest_router
from app.routers.websocket import router as ws_router, ws_manager
from app.services.alerting import AlertEngine
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline

# Configure logging
# settings.log_level is upper-cased here, so "info" works too; an unknown name falls
# back to INFO. Each log line shows: time [logger name] LEVEL: message.
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("agentpulse")


# A lifespan function runs code once before the server starts taking requests (the
# part before `yield`) and once after it stops (the part after `yield`). FastAPI calls
# it; create_app() passes it in as FastAPI(lifespan=lifespan).
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # Startup
    logger.info("AgentPulse backend starting...")

    # Step 1: create any database tables that do not exist yet.
    # Init database
    await init_db()

    # Step 2: load the AI models, but only if settings.api_load_models is True.
    # In short: by default the API does not load models; the worker does.
    # Evaluation models are NOT loaded here by default.
    #
    # Evaluation moved to the worker process, and no API route performs
    # inference -- verified by grep: the only `grounding_score` references in
    # the routers read stored evaluation COLUMNS. Loading models anyway held
    # ~1.24 GB resident per API process (measured across every configuration of
    # the throughput benchmark) and added ~20s to startup, for a capability the
    # process never uses.
    #
    # The readiness contract was defined first and does not require them: API
    # readiness is "can this process serve requests", which depends on the
    # database. Evaluator readiness is a property of the worker fleet, read
    # from heartbeats. Neither asks whether the API has models.
    #
    # Kept behind a flag rather than deleted, so the previous behaviour is one
    # environment variable away if some future API feature needs local
    # inference: AGENTPULSE_API_LOAD_MODELS=true
    if settings.api_load_models:
        try:
            from app.services.grounding import load_models
            load_models(
                nli_model_name=settings.nli_model,
                embedding_model_name=settings.embedding_model,
                cache_dir=settings.model_cache_dir,
                use_onnx=settings.use_onnx,
            )
        except Exception as exc:
            # A failed model load is only logged. The API still starts.
            logger.error("Failed to load models: %s", exc)
    else:
        logger.info(
            "API model loading disabled (api_load_models=false). This process "
            "does not evaluate; the worker does. Set AGENTPULSE_API_LOAD_MODELS=true "
            "to restore the previous behaviour."
        )

    # Step 3: build the three service objects. DriftDetector keeps each agent's drift
    # state in memory. AlertEngine holds the alert rules and their cooldown counters.
    # EvaluationPipeline ties them together to score one span. Note that no API route
    # uses these three; the worker builds its own copies (see worker.py).
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

    # Step 4: give the drift detector its saved baselines back.
    # An embedding is a list of numbers that stands for the meaning of a text. A centroid
    # is the average of an agent's output embeddings, kept as a moving average; it
    # stands for what is "normal" for that agent.
    # Restore persisted drift baselines so a restart doesn't cold-start every agent
    try:
        restored = 0
        async with get_session() as session:
            # The query asks: all rows of the baselines table whose type is
            # "embedding_centroid" (one row per agent).
            result = await session.execute(
                select(Baseline).where(Baseline.baseline_type == "embedding_centroid")
            )
            for baseline in result.scalars().all():
                # Skip a row that has no saved bytes.
                if baseline.data:
                    drift_detector.load_centroid(baseline.agent_id, baseline.data, baseline.sample_count)
                    restored += 1
        logger.info("Restored drift baselines for %d agent(s)", restored)
    except Exception as exc:
        # Not fatal: log it and let the server start without the saved baselines.
        # (Only this baseline type is restored here. The worker also restores the
        # "window_baseline_pool" rows; this API code does not.)
        logger.error("Failed to restore drift baselines: %s", exc)

    # Step 5: warn, but do not stop, if the server is set up for non-local use
    # while it still has the placeholder key.
    if not settings.local_dev_mode and settings.api_key == "change-me-to-a-secure-key":
        logger.warning(
            "AGENTPULSE_LOCAL_DEV_MODE is false but AGENTPULSE_API_KEY is still the "
            "default placeholder — set a real secret before exposing this beyond localhost."
        )

    # Step 6: hang the objects on app.state, which route code reaches as
    # request.app.state. Only ws_manager is ever read from there (routers/ingest.py
    # uses it to tell connected dashboards about new spans).
    # Store on app state for access in routers
    app.state.evaluator = evaluator
    app.state.drift_detector = drift_detector
    app.state.alert_engine = alert_engine
    app.state.ws_manager = ws_manager

    logger.info("AgentPulse backend ready on %s:%d", settings.host, settings.port)

    # The server runs and handles requests while we wait here. FastAPI continues
    # after the `yield` when the server is shutting down.
    yield

    # Shutdown
    # Only the database connections are closed. Pending evaluation jobs are rows in
    # the database queue, so there is nothing held in memory to flush.
    logger.info("AgentPulse backend shutting down...")
    await close_db()
    logger.info("Shutdown complete")


# Builds the app object. This file calls it once, at the bottom.
def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    # lifespan=lifespan connects the startup/shutdown function defined above.
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

    # Middleware
    # In short: the middleware added LAST runs FIRST. Starlette's add_middleware puts
    # each new one at the front of its list, so a request passes through them in this
    # order: CORS -> RateLimit -> RequestMetrics -> APIKey -> the route.
    # (So the remark below that RequestMetrics is "outermost" is wrong: CORS and
    # RateLimit wrap it. Metrics count the 401 answers from APIKey but not the 429
    # answers from RateLimit.)
    # Starlette wraps middleware in reverse registration order (last added =
    # outermost = runs first on the way in), so CORSMiddleware must be added
    # last. Otherwise APIKeyMiddleware intercepts and 401s the CORS preflight
    # OPTIONS request -- which never carries the X-API-Key header by spec --
    # before CORSMiddleware's own preflight short-circuit ever runs, breaking
    # every cross-origin caller regardless of whether it has a valid key.
    # (Preflight = the OPTIONS request a browser sends first to ask if a
    # cross-origin call is allowed.)
    # 1st added = innermost: checks the X-API-Key header.
    app.add_middleware(APIKeyMiddleware)
    # Added last so it wraps outermost and therefore times the whole stack,
    # including auth rejections and rate-limited requests.
    # 2nd added: counts requests and times them.
    app.add_middleware(RequestMetricsMiddleware)
    # 3rd added: limits requests to /v1/ingest per client (numbers come from settings).
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=settings.rate_limit_max_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )
    # 4th added = outermost: CORS headers. An empty origins list would fall back to
    # ["*"] (any website address), but config.py normally supplies a non-empty list.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    # Each router adds a group of URLs: ingest -> POST /v1/ingest and /v1/simulate;
    # traces, agents, drift, alerts and keys -> /v1/traces, /v1/agents, /v1/drift,
    # /v1/alerts and /v1/keys; metrics -> /v1/metrics, /v1/platform and /v1/health*;
    # ws -> the live WebSocket feed /v1/ws/live; experiments -> experiment and dataset
    # routes under /v1.
    app.include_router(ingest_router)
    app.include_router(traces_router)
    app.include_router(agents_router)
    app.include_router(drift_router)
    app.include_router(alerts_router)
    app.include_router(keys_router)
    app.include_router(metrics_router)
    app.include_router(ws_router)
    from app.routers.experiments import router as experiments_router
    app.include_router(experiments_router)

    # Optionally serve a built dashboard from this same process.
    #
    # Platforms that run one container and expose one port -- Hugging Face
    # Spaces among them -- cannot run the API and an nginx dashboard as
    # separate services. When AGENTPULSE_STATIC_DIR points at a Vite build,
    # the SPA is mounted at / and takes over the root route; /v1/* and /docs
    # are registered above and still win, because mounts are matched last.
    # In short: if AGENTPULSE_STATIC_DIR names a folder with the built dashboard, this
    # same process serves it at "/". SPA = single-page app: one HTML page whose
    # JavaScript draws the whole dashboard.
    static_dir = os.getenv("AGENTPULSE_STATIC_DIR", "").strip()
    # True only if the variable is set AND the path is an existing folder.
    serving_spa = bool(static_dir) and Path(static_dir).is_dir()

    if not serving_spa:
        # Without a dashboard, "/" answers with a small JSON card: the name, the
        # version and where to find the docs and the health check.
        @app.get("/")
        async def root():
            return {
                "name": "AgentPulse",
                "version": "0.1.0",
                "docs": "/docs",
                "health": "/v1/health",
            }
    else:
        # html=True makes unknown paths fall back to index.html, which a
        # client-routed SPA needs on deep links and hard refreshes.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="dashboard")
        logger.info("Serving dashboard from %s", static_dir)

    return app


# The ready-to-run app object. uvicorn finds it by the name `app.main:app`.
app = create_app()

# Only true when this file is run directly (python -m app.main), not when it is
# imported. It starts uvicorn with host and port from settings. reload=True restarts
# the server when a code file changes, which is handy while developing.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
