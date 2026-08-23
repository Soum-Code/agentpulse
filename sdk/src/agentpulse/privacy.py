"""Privacy filter for redacting sensitive data before transport."""

from __future__ import annotations

import re
from typing import Any

from agentpulse.config import CapturePolicy


class PrivacyFilter:
    """Applies privacy controls to telemetry data.
    
    Responsibilities:
    - Redact PII (emails, phones, SSNs) using configurable patterns
    - Detect and mask API keys and secrets
    - Truncate oversized fields
    - Filter excluded field names
    """

    def __init__(self, policy: CapturePolicy) -> None:
        self._policy = policy
        self._compiled_patterns = [
            re.compile(p, re.IGNORECASE) for p in policy.redact_patterns
        ]

    def redact_text(self, text: str | None) -> str | None:
        """Apply all redaction patterns to text."""
        if not text:
            return text
        result = text
        for pattern in self._compiled_patterns:
            result = pattern.sub("[REDACTED]", result)
        if len(result) > self._policy.max_field_length:
            result = result[: self._policy.max_field_length] + "...[TRUNCATED]"
        return result

    def filter_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """Remove excluded keys and redact string values."""
        excluded = {k.lower() for k in self._policy.excluded_fields}
        result = {}
        for key, value in data.items():
            if key.lower() in excluded:
                result[key] = "[FILTERED]"
            elif isinstance(value, str):
                result[key] = self.redact_text(value)
            elif isinstance(value, dict):
                result[key] = self.filter_dict(value)
            else:
                result[key] = value
        return result

    def should_capture_input(self) -> bool:
        return self._policy.capture_inputs

    def should_capture_output(self) -> bool:
        return self._policy.capture_outputs

    def should_capture_tool_results(self) -> bool:
        return self._policy.capture_tool_results
