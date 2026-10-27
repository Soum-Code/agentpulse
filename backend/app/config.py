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

import logging
import os
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("agentpulse.config")

# The api_key default and the value shipped in .env.example. It is public (it is in this
# repository), so a server that still uses it has no secret at all.
PLACEHOLDER_API_KEY = "change-me-to-a-secure-key"


# In short: a whole number from the environment, or the default when the variable is unset,
# empty or not a number. A typo in a size limit must not stop the backend from starting (the
# site would be down until someone found it); it is logged and the safe default is used. A
# negative number becomes 0, which switches that limit off.
def _limit_from_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        logger.error("%s is not a whole number; using the default %d", name, default)
        return default


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
    # Keys issued through /v1/keys also work. This default is only a placeholder: with
    # local_dev_mode off, main.py refuses to start while it is still in use
    # (startup_security_problem below).
    api_key: str = PLACEHOLDER_API_KEY
    # True = requests that only read (GET) need no key. See middleware.py. Note:
    # __post_init__ re-reads this from the environment and falls back to the text
    # "true", so a value passed to the constructor is ignored. True is the default on
    # purpose, for a plain local run; every deployment sets AGENTPULSE_LOCAL_DEV_MODE=false
    # (docker-compose.yml, deploy/azure/deploy.sh), and /v1/health says so when it is on
    # (dev_mode_reason below).
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

    # Size limits on what a caller may send (POST /v1/ingest and the live WebSocket). In short:
    # the numbers below are the defaults; each can be changed with the environment variable
    # named in the comment, and 0 (or less) switches that one limit off. A request over a limit
    # is refused with 413 and {"detail": "<a plain sentence>"}; nothing is stored.
    # Where the numbers come from (measured, 27 Oct 2026):
    #  - The SDK's own ceilings (sdk/src/agentpulse/config.py, utils.py, integrations/): a text
    #    field is cut at 2,000 characters plus "...[TRUNCATED]" (2,014), an error text at 500.
    #    One span with every text field at that ceiling is 7,518 bytes of JSON; the typical
    #    span (the Telemetry Lab, the benchmarks, the seed script) is about 740 bytes.
    #  - The SDK sends everything it has buffered in one request every 100 ms, and keeps at
    #    most 10,000 spans. The largest batch any script in this repo sends is 32 spans (the
    #    Lab's drift scenario); 20 and 14 in deploy/huggingface/seed_demo.py.
    # The backend writes the spans of one request one after another while it holds the write
    # lock, so a huge batch would keep every other ingest waiting; that is what the span count
    # is for. The body size is the overall ceiling on memory per request.
    #
    # AGENTPULSE_INGEST_MAX_BODY_BYTES: the largest request body of POST /v1/ingest. 10 MiB is
    # 1,000 SDK worst-case spans (7.1 MiB) with room to spare. (The dashboard's nginx in front
    # of the public site already refuses a body over 1 MB, its own default.)
    ingest_max_body_bytes: int = 10 * 1024 * 1024
    # AGENTPULSE_INGEST_MAX_SPANS: spans in one request. 1,000 is 30 times the largest batch in
    # this repo (32) and a tenth of the SDK's 10,000-span buffer.
    ingest_max_spans: int = 1000
    # AGENTPULSE_INGEST_MAX_TEXT_CHARS: the long text fields of a span (input_summary,
    # output_summary, error_message, tool_args, tool_result_summary). 10,000 is five times what
    # the SDK ever sends; the NLI model reads at most 512 tokens of it anyway (grounding.py,
    # MAX_NLI_TOKENS).
    ingest_max_text_chars: int = 10_000
    # AGENTPULSE_INGEST_MAX_LABEL_CHARS: the short fields (ids, agent_id, agent_role, pipeline_id,
    # model, tool_name, status ...). The SDK's ids are at most 64 characters (schemas/events.py).
    ingest_max_label_chars: int = 256
    # AGENTPULSE_INGEST_MAX_METADATA_CHARS: the span's `metadata` object, counted as JSON text.
    # The SDK writes one small key ("output_captured") into it.
    ingest_max_metadata_chars: int = 16_384
    # AGENTPULSE_WS_MAX_MESSAGE_BYTES: the largest message a client may SEND on /v1/ws/live. The
    # only message the code understands is "ping" (4 bytes); 1,024 leaves room for a small
    # JSON command. A bigger one closes the connection with code 1009 (message too big).
    ws_max_message_bytes: int = 1024
    # AGENTPULSE_WS_MAX_CONNECTIONS: open WebSocket connections in this process, all visitors
    # together. One dashboard tab is one connection and each one costs a socket and a list entry.
    ws_max_connections: int = 200
    # AGENTPULSE_WS_MAX_CONNECTIONS_PER_IP: open connections for one visitor (an IPv6 visitor
    # counts as its /64). Several tabs and several examiners behind one campus address fit in 20.
    ws_max_connections_per_ip: int = 20

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
        # The size limits: each is a plain whole number, 0 = off (see the comments on the fields).
        self.ingest_max_body_bytes = _limit_from_env("AGENTPULSE_INGEST_MAX_BODY_BYTES", self.ingest_max_body_bytes)
        self.ingest_max_spans = _limit_from_env("AGENTPULSE_INGEST_MAX_SPANS", self.ingest_max_spans)
        self.ingest_max_text_chars = _limit_from_env("AGENTPULSE_INGEST_MAX_TEXT_CHARS", self.ingest_max_text_chars)
        self.ingest_max_label_chars = _limit_from_env("AGENTPULSE_INGEST_MAX_LABEL_CHARS", self.ingest_max_label_chars)
        self.ingest_max_metadata_chars = _limit_from_env("AGENTPULSE_INGEST_MAX_METADATA_CHARS", self.ingest_max_metadata_chars)
        self.ws_max_message_bytes = _limit_from_env("AGENTPULSE_WS_MAX_MESSAGE_BYTES", self.ws_max_message_bytes)
        self.ws_max_connections = _limit_from_env("AGENTPULSE_WS_MAX_CONNECTIONS", self.ws_max_connections)
        self.ws_max_connections_per_ip = _limit_from_env("AGENTPULSE_WS_MAX_CONNECTIONS_PER_IP", self.ws_max_connections_per_ip)
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


# In short: the reason the backend must not start, or None when the security settings are
# acceptable. Not in dev mode, the shared API key must not be the public placeholder: that
# key is in the repository, so everybody would hold the master key. In dev mode nothing is
# refused (a local run, the tests and the Hugging Face demo use it on purpose).
def startup_security_problem(cfg: "BackendConfig") -> str | None:
    if cfg.local_dev_mode or cfg.api_key != PLACEHOLDER_API_KEY:
        return None
    return (
        "AGENTPULSE_LOCAL_DEV_MODE is off but AGENTPULSE_API_KEY is still the public "
        f"placeholder ({PLACEHOLDER_API_KEY!r}). Anyone could use that key. Set "
        "AGENTPULSE_API_KEY to a long random secret (for example: openssl rand -hex 24), "
        "or set AGENTPULSE_LOCAL_DEV_MODE=true for a local run that is not exposed."
    )


# In short: why this process is in dev mode, as a sentence for /v1/health, or None when it is
# not. It names the setting and what it allows, and never the key itself.
def dev_mode_reason(cfg: "BackendConfig") -> str | None:
    if not cfg.local_dev_mode:
        return None
    reason = (
        "AGENTPULSE_LOCAL_DEV_MODE is on (its default): GET requests need no API key. "
        "Set AGENTPULSE_LOCAL_DEV_MODE=false for anything other than a local run."
    )
    if cfg.api_key == PLACEHOLDER_API_KEY:
        reason += " The API key is still the public placeholder, so writes are open to anyone too."
    return reason


# The app makes just this one object of the class, and every file imports this same
# one. It is built the first time this file is imported, so a bad environment value
# fails at that moment.
# Singleton
settings = BackendConfig()
