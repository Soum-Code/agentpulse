"""Utility functions for the AgentPulse SDK."""

# What this file is for:
#   A box of small helper functions used all over the SDK: make trace and span ids, get the
#   current UTC time, make a short fingerprint (hash) of a text, turn a Python object into
#   JSON text without crashing, drop secret keys from a state dict, and cut long text short.
#   None of them talks to the network or keeps any state.
#
# How it fits in:
#   client.py and context.py make ids with it, and client.py, decorators.py and
#   integrations/llm.py get the time from it. decorators.py, integrations/llm.py and
#   integrations/langgraph.py use the hash, serialize and summary helpers.
#   It imports nothing from the rest of the SDK.

from __future__ import annotations

# hashlib makes the fingerprint (SHA-256). uuid makes random ids. json turns objects to text.
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any


# W3C TraceContext is a web standard for ids that follow one request across systems. It says
# a trace id is 32 hex characters (0-9, a-f) and a span id is 16.
# uuid4() makes a random id; .hex writes it as 32 hex characters.
def generate_trace_id() -> str:
    """Generate a W3C TraceContext-compatible 32-char hex trace ID."""
    return uuid.uuid4().hex


# Same random source as above, but only the first 16 of the 32 characters are kept.
def generate_span_id() -> str:
    """Generate a W3C TraceContext-compatible 16-char hex span ID."""
    return uuid.uuid4().hex[:16]


# The "timezone info" part means the time carries a label saying it is UTC. The SDK sends
# all its times in UTC.
def utc_now() -> datetime:
    """Return current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)


# In: a text (it must be a str; None would raise an error). Out: "sha256:" plus the first
# 16 characters of the SHA-256 hash. So it is a short fingerprint, not the full hash. The same
# text always gives the same fingerprint, so you can see that two texts are equal without
# keeping them. The text is turned into bytes (UTF-8) first because hashing works on bytes.
def hash_content(content: str) -> str:
    """Create a SHA-256 hash of content for deduplication/comparison."""
    return f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]}"


# In: any Python object. Out: JSON text, or None. A plain string comes back wrapped in
# double quotes, because that is how JSON writes a string.
def safe_serialize(obj: Any, max_length: int = 2000) -> str | None:
    """Safely serialize an object to JSON string.
    
    Returns None if serialization fails. Truncates large outputs.
    Non-serializable values are converted to their string representation.
    """
    # None stays None (it is not turned into the text "null").
    if obj is None:
        return None
    try:
        # Step 1: default=str means "if JSON cannot write an object, use str(object) instead",
        # so things like dates and custom classes do not fail. ensure_ascii=False keeps
        # non-English letters as they are, instead of \uXXXX codes.
        text = json.dumps(obj, default=str, ensure_ascii=False)
        # Step 2: cut long text at max_length and add a marker. The marker comes on top of the
        # limit, so the result can be a little longer than max_length.
        if len(text) > max_length:
            return text[:max_length] + "...[TRUNCATED]"
        return text
    # json.dumps can still fail, for example on a dict that contains itself (ValueError) or
    # on dict keys that are not simple types (TypeError).
    except (TypeError, ValueError, OverflowError):
        # Step 3 (fallback): use plain str(obj) instead of JSON, cut the same way. If even
        # str() fails (any error is caught here), give up and return None. Other error types
        # from json.dumps above, such as RecursionError on very deep nesting, are not caught.
        try:
            text = str(obj)
            if len(text) > max_length:
                return text[:max_length] + "...[TRUNCATED]"
            return text
        except Exception:
            return None


# In: a state dict (the data passed between agent steps). Out: a new dict without secret
# keys. @monitor in decorators.py uses it on a dict input and a dict result before turning
# them into text.
# Only the top level is checked: a "password" key nested inside a value is not removed.
def sanitize_state(state: dict[str, Any], excluded_keys: list[str] | None = None) -> dict[str, Any]:
    """Remove sensitive keys and non-serializable values from state dict.
    
    Used to clean LangGraph state before serialization.
    """
    # Something that is not a dict gives an empty dict.
    if not isinstance(state, dict):
        return {}

    # The key names to drop. If you pass excluded_keys, your list REPLACES the default one
    # (an empty list counts as "not passed" and gives the default). Names are compared with
    # key.lower(), so a custom list should hold lower-case names.
    excluded = set(excluded_keys or [
        "api_key", "token", "secret", "password", "authorization",
        "__agentpulse_trace_id", "__agentpulse_parent_span_id",
    ])

    result = {}
    for key, value in state.items():
        # Step 1: skip excluded names and every key that starts with "_" (a private or internal
        # key; this also covers the two __agentpulse_* keys that carry the trace through).
        if key.lower() in excluded or key.startswith("_"):
            continue
        # Step 2: keep the value if json.dumps accepts it. Because default=str is used, this
        # fails only for odd values, for example a dict that contains itself. Then the value
        # is replaced by the name of its type (for example "dict"), so there is no crash.
        try:
            json.dumps(value, default=str)
            result[key] = value
        except (TypeError, ValueError):
            result[key] = str(type(value).__name__)

    return result


# In: a text or None. Out: the same text if it fits in max_length, else its first max_length
# characters plus "...". Despite the name, it does no real summarising, it only cuts.
# The default of 200 characters is the summary size used by LangGraphAdapter.
def extract_summary(text: str | None, max_length: int = 200) -> str | None:
    """Extract a concise summary from text for operational metadata.
    
    Preserves the first `max_length` characters — intentionally simple.
    Production systems would use LLM-based summarization.
    """
    # Empty text and None both give None.
    if not text:
        return None
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."
