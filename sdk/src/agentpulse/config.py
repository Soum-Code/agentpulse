"""SDK configuration with environment variable support."""

# What this file is for:
#   Holds the SDK settings as two dataclasses (classes that mostly just store fields).
#   CapturePolicy says WHAT data may be recorded and how it is masked (privacy).
#   AgentPulseConfig says WHERE to send spans and HOW (batching, retries, sampling).
#   A few settings can also come from AGENTPULSE_* environment variables.
#
# How it fits in:
#   client.py builds these objects from its arguments. privacy.py, transport.py,
#   decorators.py and integrations/llm.py read them.

from __future__ import annotations

# os reads environment variables. re = regular expressions (text patterns), used to mask text.
import os
import re
# @dataclass writes __init__ for a class that only stores fields. field(default_factory=...)
# gives every object its own fresh list or sub-object instead of one shared by all.
from dataclasses import dataclass, field
from typing import Optional


# CapturePolicy = the privacy rules: what text may be kept, what is masked, how long a
# field may be.
@dataclass
class CapturePolicy:
    """Controls what data the SDK captures and transmits.
    
    Privacy-by-default: raw inputs/outputs are NOT captured unless explicitly
    enabled. PII masking is ON by default.
    """

    # The three capture_* switches say whether the TEXT of inputs, outputs and tool results
    # may be kept. All are off by default. When they are off, @monitor and instrument_llm
    # still record hashes (short fingerprints of the text), but not the text itself. (With
    # @monitor(capture_state=False) there are no hashes either.) LangGraphAdapter ignores
    # these switches: it always keeps 200-character summaries.
    # Note: nothing in the SDK reads capture_tool_results yet (should_capture_tool_results()
    # in privacy.py is never called).
    capture_inputs: bool = False
    capture_outputs: bool = False
    capture_tool_results: bool = False
    # Longest text kept for one field. Longer text is cut and "...[TRUNCATED]" is added.
    max_field_length: int = 2000
    # Regular expressions for sensitive data. Every match is replaced by [REDACTED].
    redact_patterns: list[str] = field(default_factory=lambda: [
        # Email: name characters, an @, a domain, a dot, then 2 or more letters (like a@b.com).
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",  # Email
        # Phone: 10 digits as 3 + 3 + 4, with an optional "-" or "." between the groups.
        r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",  # Phone
        # US Social Security number shape: 3 digits, dash, 2 digits, dash, 4 digits.
        r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
        # Secrets, in three patterns.
        # 1. One of the words api_key, token, secret or password (any letter case), then an
        # optional quote (the closing quote of a JSON key), ":" or "=", then the value: a quoted
        # text (up to its closing quote, so "my pass phrase" goes whole) or else everything up to
        # the next space. So "password: abc", password=abc and "password": "abc" are all masked.
        # NOT masked: "password is abc" (no ":" or "=" after the word).
        r"(?i)(api[_-]?key|token|secret|password)[\"']?\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|\S+)",  # Secrets
        # 2. A bare key that starts with sk- (OpenAI style) and is at least 16 more characters.
        r"\bsk-[A-Za-z0-9_-]{16,}",  # sk- keys
        # 3. The word bearer and then a token of at least 8 characters, as in
        # "Authorization: Bearer eyJ...". Shorter words such as "bearer of" are left alone.
        r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}",  # Bearer tokens
    ])
    # Key names whose values PrivacyFilter.filter_dict() replaces with [FILTERED] (compared
    # in lower case). No code in the SDK calls filter_dict() yet; only the tests do.
    excluded_fields: list[str] = field(default_factory=lambda: [
        "api_key", "token", "secret", "password", "authorization",
    ])

    # Masks sensitive text in two steps. No code in the SDK calls this method: @monitor and
    # instrument_llm use PrivacyFilter.redact_text (privacy.py), which compiles the patterns
    # once and ignores letter case.
    def redact(self, text: str) -> str:
        """Apply PII masking patterns to text."""
        if not text:
            return text
        result = text
        # Step 1: replace every match of every pattern with [REDACTED].
        for pattern in self.redact_patterns:
            result = re.sub(pattern, "[REDACTED]", result)
        # Step 2: cut over-long text to max_field_length characters and mark the cut.
        if len(result) > self.max_field_length:
            result = result[: self.max_field_length] + "...[TRUNCATED]"
        return result


# AgentPulseConfig = where to send spans and how (connection, batching, retries, sampling).
@dataclass
class AgentPulseConfig:
    """Configuration for the AgentPulse SDK.
    
    All settings can be overridden via environment variables prefixed
    with AGENTPULSE_.
    """

    # Note: only six settings are really read from the environment (see __post_init__ at the
    # bottom): endpoint, api_key, service_name, enabled, capture_inputs and capture_outputs.
    # The others, such as batching and retries, can only be set in code.
    # Connection
    # Base URL of the AgentPulse API. The transport posts batches to <endpoint>/v1/ingest.
    endpoint: str = "http://localhost:8000"
    # When set, it is sent with every request in the X-API-Key header.
    api_key: Optional[str] = None

    # Identity
    # Name of the application that sends the spans. It is added to every batch.
    service_name: str = "default"
    # A label for the whole multi-agent pipeline. @monitor and instrument_llm copy it onto
    # the spans they build.
    pipeline_id: Optional[str] = None

    # Transport
    # No longer starts a send. It used to make the transport send as soon as this many spans
    # were waiting, but that early send could not run when a span was queued from a worker
    # thread, so spans are now sent only by the periodic flush (flush_interval_ms). The
    # setting is still accepted so that existing code keeps working.
    batch_size: int = 10

    # In short: a memory cap. Once this many spans are waiting, each new span pushes out the
    # oldest one.
    # An upper bound on spans held in memory before the transport has sent them.
    #
    # The buffer used to be an unbounded list. Normally that is harmless -- a
    # failed send is written to the fallback file rather than retained -- but
    # `_ensure_transport` gives up silently when there is no running event loop,
    # and in that case the flush task never starts. Every span then accumulates
    # in the agent's own process, forever, with nothing sent and nothing said.
    #
    # An observability SDK is supposed to be the thing that cannot take down
    # what it observes, so it takes a ceiling. At roughly 1-2 KB per serialized
    # span this is some tens of megabytes at worst.
    max_buffered_spans: int = 10_000
    # The background loop also sends whatever is waiting every this many milliseconds.
    flush_interval_ms: int = 100
    # Send attempts per batch. Network errors and HTTP 429 (rate limited) are retried with
    # growing waits; any other HTTP error gives up at once. A batch that fails goes to the
    # fallback file.
    max_retries: int = 3
    # Total time allowed for one HTTP request, in seconds.
    timeout_seconds: float = 5.0
    # Spans that could not be sent are appended here, one JSON object per line.
    fallback_file: str = "./agentpulse_fallback.jsonl"

    # Capture
    # The privacy rules defined above. Each config gets its own fresh CapturePolicy.
    capture_policy: CapturePolicy = field(default_factory=CapturePolicy)

    # Behavior
    # Master switch. When False, @monitor and instrument_llm call your code directly and
    # record nothing. start_span()/end_span() and LangGraphAdapter do not check this switch.
    enabled: bool = True
    # True: if the SDK itself hits an error, it is logged and your agent code carries on. An
    # error raised by your own function is not an SDK error: @monitor records it as an ERROR
    # span and raises it again, with the function called only once. False: SDK errors are raised.
    fail_open: bool = True  # If True, SDK errors don't block the application
    # Share of calls to record, from 0.0 to 1.0. Each call is picked or skipped at random;
    # a skipped call is not recorded at all.
    sampling_rate: float = 1.0  # 1.0 = capture everything

    def __post_init__(self) -> None:
        """Load overrides from environment variables."""
        # Step 1: for each of these settings, an environment variable (if it is set) beats the
        # value passed in code. os.getenv(NAME, default) returns the default when NAME is not set.
        self.endpoint = os.getenv("AGENTPULSE_ENDPOINT", self.endpoint)
        self.api_key = os.getenv("AGENTPULSE_API_KEY", self.api_key)
        self.service_name = os.getenv("AGENTPULSE_SERVICE_NAME", self.service_name)

        # Step 2: on/off switch. Only "true", "1" or "yes" (any letter case) mean on. Any other
        # text, such as "false", "no" or "off", means off. If the variable is not set, the value
        # from code stays.
        env_enabled = os.getenv("AGENTPULSE_ENABLED")
        if env_enabled is not None:
            self.enabled = env_enabled.lower() in ("true", "1", "yes")

        # Step 3: the two capture flags work the same way. They change the capture_policy
        # object in place.
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
