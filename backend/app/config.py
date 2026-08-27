"""Backend configuration with environment variable support."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BackendConfig:
    """Backend server configuration. All values overridable via env vars."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/agentpulse.db"

    # Security
    api_key: str = "change-me-to-a-secure-key"
    local_dev_mode: bool = True
    cors_origins: list[str] | None = None
    rate_limit_max_requests: int = 18000
    rate_limit_window_seconds: int = 60

    # Models
    nli_model: str = "cross-encoder/nli-deberta-v3-small"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    model_cache_dir: str = "./models"
    use_onnx: bool = True

    # Drift
    drift_window_size: int = 100
    drift_threshold: float = 0.3
    asi_low_threshold: float = 50.0

    # Alerts
    hallucination_threshold: float = 0.7
    alert_cooldown_seconds: int = 900
    alert_max_per_hour: int = 50
    webhook_url: str = ""

    # Privacy
    # The API performs no inference: evaluation moved to the worker process and
    # no API route calls a model (verified by grep -- only stored evaluation
    # COLUMNS are read). Loading them held ~1.24 GB of resident memory per API
    # process and added ~20s to startup for a capability never used.
    #
    # Opt-in rather than removed outright, so the previous behaviour is one
    # environment variable away if a future API feature does need local
    # inference: AGENTPULSE_API_LOAD_MODELS=true
    api_load_models: bool = False

    retention_days: int = 30

    def __post_init__(self) -> None:
        self.host = os.getenv("AGENTPULSE_HOST", self.host)
        self.port = int(os.getenv("AGENTPULSE_PORT", str(self.port)))
        self.log_level = os.getenv("AGENTPULSE_LOG_LEVEL", self.log_level)
        self.database_url = os.getenv("AGENTPULSE_DATABASE_URL", self.database_url)
        self.api_key = os.getenv("AGENTPULSE_API_KEY", self.api_key)
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

        use_onnx_env = os.getenv("AGENTPULSE_USE_ONNX")
        if use_onnx_env is not None:
            self.use_onnx = use_onnx_env.lower() in ("true", "1", "yes")

        cors_env = os.getenv("AGENTPULSE_CORS_ORIGINS")
        if cors_env:
            self.cors_origins = [o.strip() for o in cors_env.split(",")]
        elif self.cors_origins is None:
            self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]

        # Ensure model cache dir exists
        Path(self.model_cache_dir).mkdir(parents=True, exist_ok=True)
        # Ensure database dir exists
        db_path = self.database_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        if db_path.startswith("./"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)


# Singleton
settings = BackendConfig()
