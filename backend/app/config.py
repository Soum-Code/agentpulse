"""Backend configuration with environment variable support."""

# WHAT THIS FILE IS FOR
# It holds every setting the backend needs (port, database address, API key, model
# names, alert limits ...) in one object named `settings`, made once at the bottom
# of this file. Each setting has a default value written in the class below. An
# environment variable named AGENTPULSE_<NAME> can replace the default. (An
# environment variable = a value you give the program from outside, for example
# AGENTPULSE_PORT=9000.)
#
# HOW IT FITS IN
# Imported as `from app.config import settings` by main.py, database.py,
# middleware.py, worker.py, retention_cli.py, rescore_cli.py and a few routers and services.
# This file imports nothing from the rest of the app.

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


# A dataclass is a class where you list fields with default values and Python
# writes __init__ for you. After that, __post_init__ (below) runs and applies the
# environment variable overrides.
@dataclass
class BackendConfig:
    """Backend server configuration. All values overridable via env vars."""

    # Server
    # 0.0.0.0 means "listen on every network interface", not only on this machine.
    host: str = "0.0.0.0"
    port: int = 8000
    # A logging level name: DEBUG, INFO, WARNING ... Use upper case. DEBUG also makes
    # database.py print every SQL statement.
    log_level: str = "INFO"

    # Database
    # "sqlite+aiosqlite:///<path>" = a SQLite file (a whole database in one file)
    # opened through the async driver aiosqlite. A relative path is relative to the
    # folder you start the program from, so another start folder means another file.
    database_url: str = "sqlite+aiosqlite:///./data/agentpulse.db"

    # Security
    # The main shared secret callers send in the X-API-Key header (see middleware.py).
    # Keys issued through /v1/keys also work. This default is only a placeholder:
    # main.py logs a warning if it is still in use while local_dev_mode is off.
    api_key: str = "change-me-to-a-secure-key"
    # True = requests that only read (GET) need no key. See middleware.py. Note:
    # __post_init__ re-reads this from the environment and falls back to the text
    # "true", so a value passed to the constructor is ignored.
    local_dev_mode: bool = True
    # CORS = a browser rule about which website addresses may call this API from
    # JavaScript. None means "use the default list that __post_init__ sets".
    cors_origins: list[str] | None = None
    # Rate limit: one client address may send at most this many requests to
    # /v1/ingest per window (see RateLimitMiddleware). 18000 per 60 s = 300 per second.
    rate_limit_max_requests: int = 18000
    rate_limit_window_seconds: int = 60

    # Models
    # NLI model = says if one sentence follows from another. Used for grounding.
    # Loaded by the worker (and by the API only when api_load_models is on).
    nli_model: str = "cross-encoder/nli-deberta-v3-small"
    # Embedding model = turns a text into a list of numbers that stands for its
    # meaning. Used for similarity scores and for drift.
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    # Folder where the model files are kept.
    model_cache_dir: str = "./models"
    # True = run the NLI model with ONNX Runtime, a faster CPU engine (the embedding
    # model always uses PyTorch). If ONNX fails to load, the code falls back to PyTorch
    # (see grounding.py and the worker's log).
    use_onnx: bool = True

    # Drift
    # How many recent grounding scores and error flags are kept per agent when drift
    # is computed. Older ones are dropped. Passed to DriftDetector.
    drift_window_size: int = 100
    # The DRIFT_DETECTED alert fires when window_centroid_distance (how far the
    # agent's recent outputs moved away from its baseline) is above this number.
    drift_threshold: float = 0.3
    # The ASI_DROP alert fires when the Agent Stability Index (0-100, higher = steadier)
    # falls below this number. No environment variable can change this one.
    asi_low_threshold: float = 50.0

    # Alerts
    # The HIGH_HALLUCINATION_RISK alert (overall risk) and the GROUNDING_FAILURE alert
    # (grounding score) fire above this. Scores run from 0.0 (safe) to 1.0 (risky).
    hallucination_threshold: float = 0.7
    # Meant to be: wait this many seconds before the same alert type for the same agent
    # may fire again. But AlertEngine stores this value and then checks each rule's own
    # cooldown (900 seconds by default), so changing this has no effect in today's code.
    alert_cooldown_seconds: int = 900
    # At most this many alerts fire per hour; after that the engine stays silent until
    # the hour is over. The count is kept in memory, once per process.
    alert_max_per_hour: int = 50
    # Address for alert notifications. Empty = none. AlertEngine keeps it, but nothing
    # in backend/app calls its dispatch_webhook method, so nothing is sent today.
    webhook_url: str = ""

    # Privacy
    # In short: False = the API process does not load the AI models, only the worker
    # does. Set AGENTPULSE_API_LOAD_MODELS=true to load them in the API too.
    # The API performs no inference: evaluation moved to the worker process and
    # no API route calls a model (verified by grep -- only stored evaluation
    # COLUMNS are read). Loading them held ~1.24 GB of resident memory per API
    # process and added ~20s to startup for a capability never used.
    #
    # Opt-in rather than removed outright, so the previous behaviour is one
    # environment variable away if a future API feature does need local
    # inference: AGENTPULSE_API_LOAD_MODELS=true
    api_load_models: bool = False

    # Traces older than this many days (with their spans, scores, drift records and
    # alerts) and finished evaluation jobs are deleted when you run
    # `python -m app.retention_cli`. Nothing in this repo runs it on a schedule.
    # 0 or less = no deletion.
    retention_days: int = 30

    def __post_init__(self) -> None:
        """Apply environment variable overrides, then create the folders we need.

        Python calls this by itself right after the fields above are set.
        """
        # Step 1: for each setting that has an environment variable, use the variable if
        # it is set and keep the current value if not. Numbers go through int() or
        # float(), so a bad value such as AGENTPULSE_PORT=abc raises ValueError and the
        # app fails to start.
        self.host = os.getenv("AGENTPULSE_HOST", self.host)
        self.port = int(os.getenv("AGENTPULSE_PORT", str(self.port)))
        self.log_level = os.getenv("AGENTPULSE_LOG_LEVEL", self.log_level).upper()
        self.database_url = os.getenv("AGENTPULSE_DATABASE_URL", self.database_url)
        self.api_key = os.getenv("AGENTPULSE_API_KEY", self.api_key)
        # Yes/no settings: "true", "1" or "yes" (any letter case) means True, anything
        # else means False. For local_dev_mode a missing variable counts as "true"; the
        # other yes/no settings keep their current value when their variable is missing.
        self.local_dev_mode = os.getenv("AGENTPULSE_LOCAL_DEV_MODE", "true").lower() in ("true", "1", "yes")
        self.rate_limit_max_requests = int(os.getenv("AGENTPULSE_RATE_LIMIT_MAX_REQUESTS", str(self.rate_limit_max_requests)))
        self.rate_limit_window_seconds = int(os.getenv("AGENTPULSE_RATE_LIMIT_WINDOW_SECONDS", str(self.rate_limit_window_seconds)))
        self.nli_model = os.getenv("AGENTPULSE_NLI_MODEL", self.nli_model)
        self.embedding_model = os.getenv("AGENTPULSE_EMBEDDING_MODEL", self.embedding_model)
        self.model_cache_dir = os.getenv("AGENTPULSE_MODEL_CACHE_DIR", self.model_cache_dir)
        self.drift_window_size = int(os.getenv("AGENTPULSE_DRIFT_WINDOW_SIZE", str(self.drift_window_size)))
        self.drift_threshold = float(os.getenv("AGENTPULSE_DRIFT_THRESHOLD", str(self.drift_threshold)))
        self.hallucination_threshold = float(os.getenv("AGENTPULSE_HALLUCINATION_THRESHOLD", str(self.hallucination_threshold)))
        self.alert_cooldown_seconds = int(os.getenv("AGENTPULSE_ALERT_COOLDOWN_SECONDS", str(self.alert_cooldown_seconds)))
        self.alert_max_per_hour = int(os.getenv("AGENTPULSE_ALERT_MAX_PER_HOUR", str(self.alert_max_per_hour)))
        self.webhook_url = os.getenv("AGENTPULSE_WEBHOOK_URL", self.webhook_url)
        self.retention_days = int(os.getenv("AGENTPULSE_RETENTION_DAYS", str(self.retention_days)))
        self.api_load_models = os.getenv(
            "AGENTPULSE_API_LOAD_MODELS", str(self.api_load_models)
        ).lower() in ("1", "true", "yes")

        # use_onnx is changed only when its variable exists; otherwise the default stays.
        use_onnx_env = os.getenv("AGENTPULSE_USE_ONNX")
        if use_onnx_env is not None:
            self.use_onnx = use_onnx_env.lower() in ("true", "1", "yes")

        # AGENTPULSE_CORS_ORIGINS is a comma-separated list of website addresses, e.g.
        # "http://a.com,http://b.com". Without it (and with no list given) the default
        # is the two local addresses on ports 3000 and 5173, common dev-server ports.
        cors_env = os.getenv("AGENTPULSE_CORS_ORIGINS")
        if cors_env:
            self.cors_origins = [o.strip() for o in cors_env.split(",")]
        elif self.cors_origins is None:
            self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]

        # Step 2: make sure the folders exist. mkdir(parents=True) also makes missing
        # parent folders, and exist_ok=True means "no error if it is already there".
        # Ensure model cache dir exists
        Path(self.model_cache_dir).mkdir(parents=True, exist_ok=True)
        # Ensure database dir exists
        # Strip the "sqlite+aiosqlite:///" (or "sqlite:///") start to get the file path.
        # Only a path that begins with "./" gets its parent folder made here (for
        # ./data/agentpulse.db that is ./data). Other paths are left alone, so their
        # folder must already exist.
        db_path = self.database_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        if db_path.startswith("./"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)


# The app makes just this one object of the class, and every file imports this same
# one. It is built the first time this file is imported, so a bad environment value
# fails at that moment.
# Singleton
settings = BackendConfig()
