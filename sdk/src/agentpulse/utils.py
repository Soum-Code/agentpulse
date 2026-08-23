"""Utility functions for the AgentPulse SDK."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any


def generate_trace_id() -> str:
    """Generate a W3C TraceContext-compatible 32-char hex trace ID."""
    return uuid.uuid4().hex


def generate_span_id() -> str:
    """Generate a W3C TraceContext-compatible 16-char hex span ID."""
    return uuid.uuid4().hex[:16]


def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)


def hash_content(content: str) -> str:
    """Create a SHA-256 hash of content for deduplication/comparison."""
    return f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]}"


def safe_serialize(obj: Any, max_length: int = 2000) -> str | None:
    """Safely serialize an object to JSON string.
    
    Returns None if serialization fails. Truncates large outputs.
    Non-serializable values are converted to their string representation.
    """
    if obj is None:
        return None
    try:
        text = json.dumps(obj, default=str, ensure_ascii=False)
        if len(text) > max_length:
            return text[:max_length] + "...[TRUNCATED]"
        return text
    except (TypeError, ValueError, OverflowError):
        try:
            text = str(obj)
            if len(text) > max_length:
                return text[:max_length] + "...[TRUNCATED]"
            return text
        except Exception:
            return None


def sanitize_state(state: dict[str, Any], excluded_keys: list[str] | None = None) -> dict[str, Any]:
    """Remove sensitive keys and non-serializable values from state dict.
    
    Used to clean LangGraph state before serialization.
    """
    if not isinstance(state, dict):
        return {}

    excluded = set(excluded_keys or [
        "api_key", "token", "secret", "password", "authorization",
        "__agentpulse_trace_id", "__agentpulse_parent_span_id",
    ])

    result = {}
    for key, value in state.items():
        if key.lower() in excluded or key.startswith("_"):
            continue
        try:
            json.dumps(value, default=str)
            result[key] = value
        except (TypeError, ValueError):
            result[key] = str(type(value).__name__)

    return result


def extract_summary(text: str | None, max_length: int = 200) -> str | None:
    """Extract a concise summary from text for operational metadata.
    
    Preserves the first `max_length` characters — intentionally simple.
    Production systems would use LLM-based summarization.
    """
    if not text:
        return None
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."
