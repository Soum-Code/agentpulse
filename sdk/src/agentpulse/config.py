"""SDK configuration with environment variable support."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CapturePolicy:
    """Controls what data the SDK captures and transmits.
    
    Privacy-by-default: raw inputs/outputs are NOT captured unless explicitly
    enabled. PII masking is ON by default.
    """

    capture_inputs: bool = False
    capture_outputs: bool = False
    capture_tool_results: bool = False
    max_field_length: int = 2000
    redact_patterns: list[str] = field(default_factory=lambda: [
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",  # Email
        r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",  # Phone
        r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
        r"(?i)(sk-|api[_-]?key|token|secret|password|bearer)\s*[:=]\s*\S+",  # Secrets
    ])
    excluded_fields: list[str] = field(default_factory=lambda: [
        "api_key", "token", "secret", "password", "authorization",
    ])

    def redact(self, text: str) -> str:
        """Apply PII masking patterns to text."""
        if not text:
            return text
        result = text
        for pattern in self.redact_patterns:
            result = re.sub(pattern, "[REDACTED]", result)
        if len(result) > self.max_field_length:
            result = result[: self.max_field_length] + "...[TRUNCATED]"
        return result


@dataclass
class AgentPulseConfig:
    """Configuration for the AgentPulse SDK.
    
    All settings can be overridden via environment variables prefixed
    with AGENTPULSE_.
    """

    # Connection
    endpoint: str = "http://localhost:8000"
    api_key: Optional[str] = None

    # Identity
    service_name: str = "default"
    pipeline_id: Optional[str] = None

    # Transport
    batch_size: int = 10
    flush_interval_ms: int = 100
    max_retries: int = 3
    timeout_seconds: float = 5.0
    fallback_file: str = "./agentpulse_fallback.jsonl"

    # Capture
    capture_policy: CapturePolicy = field(default_factory=CapturePolicy)

    # Behavior
    enabled: bool = True
    fail_open: bool = True  # If True, SDK errors don't block the application
    sampling_rate: float = 1.0  # 1.0 = capture everything

    def __post_init__(self) -> None:
        """Load overrides from environment variables."""
        self.endpoint = os.getenv("AGENTPULSE_ENDPOINT", self.endpoint)
        self.api_key = os.getenv("AGENTPULSE_API_KEY", self.api_key)
        self.service_name = os.getenv("AGENTPULSE_SERVICE_NAME", self.service_name)

        env_enabled = os.getenv("AGENTPULSE_ENABLED")
        if env_enabled is not None:
            self.enabled = env_enabled.lower() in ("true", "1", "yes")

        env_capture_in = os.getenv("AGENTPULSE_CAPTURE_INPUTS")
        if env_capture_in is not None:
            self.capture_policy.capture_inputs = env_capture_in.lower() in (
                "true", "1", "yes",
            )

        env_capture_out = os.getenv("AGENTPULSE_CAPTURE_OUTPUTS")
        if env_capture_out is not None:
            self.capture_policy.capture_outputs = env_capture_out.lower() in (
                "true", "1", "yes",
            )
