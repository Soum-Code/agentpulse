"""Enumerations for span classification."""

from enum import Enum


class EventType(str, Enum):
    """Type of event captured within a span."""

    AGENT_EXECUTION = "agent_execution"
    LLM_CALL = "llm_call"
    LLM_RESPONSE = "llm_response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    HANDOFF = "handoff"
    HUMAN_INPUT = "human_input"
    ERROR = "error"
    RETRY = "retry"


class SpanKind(str, Enum):
    """OpenTelemetry-compatible span kind."""

    AGENT = "AGENT"
    LLM = "LLM"
    TOOL = "TOOL"
    INTERNAL = "INTERNAL"
    HANDOFF = "HANDOFF"


class SpanStatus(str, Enum):
    """Span completion status."""

    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class AlertType(str, Enum):
    """Types of alerts AgentPulse can generate."""

    HIGH_HALLUCINATION_RISK = "HIGH_HALLUCINATION_RISK"
    DRIFT_DETECTED = "DRIFT_DETECTED"
    TOOL_CLAIM_MISMATCH = "TOOL_CLAIM_MISMATCH"
    AGENT_DISAGREEMENT = "AGENT_DISAGREEMENT"
    GROUNDING_FAILURE = "GROUNDING_FAILURE"
    ERROR_RATE_SPIKE = "ERROR_RATE_SPIKE"
    QUALITY_REGRESSION = "QUALITY_REGRESSION"
    ASI_DROP = "ASI_DROP"
    EVALUATOR_FAILURE = "EVALUATOR_FAILURE"


class AlertSeverity(str, Enum):
    """Alert severity levels."""

    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
