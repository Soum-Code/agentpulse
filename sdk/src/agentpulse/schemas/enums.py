"""Enumerations for span classification."""

# What this file is for:
#   Defines the fixed lists of allowed values (enums) that a span uses to say what it is
#   (EventType, SpanKind) and how it ended (SpanStatus), plus two lists for alerts
#   (AlertType, AlertSeverity). An enum = a fixed list of named choices.
#   Every class here also inherits from str, so a member is also a plain string:
#   SpanStatus.SUCCESS == "success", and it is written as that text in JSON.
#
# How it fits in:
#   events.py uses EventType, SpanKind and SpanStatus as field types of a span. client.py,
#   decorators.py and the files in integrations/ choose the values. The backend keeps them
#   as plain text. AlertType and AlertSeverity are not used by any code in the SDK.

from enum import Enum


# What the span's event is. Only three of the nine values are set by code in this repo:
# AGENT_EXECUTION, LLM_CALL and TOOL_CALL. The backend stores the text and does no logic on it.
class EventType(str, Enum):
    """Type of event captured within a span."""

    # The default. Used by @monitor and by LangGraphAdapter for an agent node.
    AGENT_EXECUTION = "agent_execution"
    # Used by instrument_llm() for one LLM call.
    LLM_CALL = "llm_call"
    # The next one is not set by any code in this repo.
    LLM_RESPONSE = "llm_response"
    # Used by LangGraphAdapter for one tool call.
    TOOL_CALL = "tool_call"
    # The next five are not set by any code in this repo.
    TOOL_RESULT = "tool_result"
    HANDOFF = "handoff"
    HUMAN_INPUT = "human_input"
    ERROR = "error"
    RETRY = "retry"


# What kind of step the span is. SpanKind.AGENT is the default. The backend stores the text
# and does no logic on it.
class SpanKind(str, Enum):
    """What kind of step a span represents.

    Not OpenTelemetry's SpanKind, despite an earlier docstring saying so.
    OTel's values are INTERNAL, SERVER, CLIENT, PRODUCER and CONSUMER; of those
    only INTERNAL appears here, and AGENT, LLM, TOOL and HANDOFF are not OTel
    span kinds at all. These describe agent steps, which is what this schema is
    for -- the deck states plainly that the span schema is custom.
    """

    # A whole agent step. The default for @monitor and for LangGraphAdapter nodes.
    AGENT = "AGENT"
    # One LLM call (instrument_llm()).
    LLM = "LLM"
    # One tool call (LangGraphAdapter).
    TOOL = "TOOL"
    # The next two are not set by any code in this repo.
    INTERNAL = "INTERNAL"
    HANDOFF = "HANDOFF"


# How the step ended. The backend counts every status except "success" as an error.
class SpanStatus(str, Enum):
    """Span completion status."""

    # The default: a new span starts as SUCCESS.
    SUCCESS = "success"
    # Set by instrument_llm() when the LLM call raises, and by LangGraphAdapter when it is
    # told the step ended with "error". @monitor never sets it.
    ERROR = "error"
    # The next two are not set by any code in this repo.
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


# The names of the alerts. The SDK never raises alerts itself and does not use this class.
# The backend (services/alerting.py) writes the same names as plain text. Six have an active
# rule there: HIGH_HALLUCINATION_RISK, GROUNDING_FAILURE, TOOL_CLAIM_MISMATCH,
# DRIFT_DETECTED, ASI_DROP and ERROR_RATE_SPIKE. An alert rule = a threshold on one score.
class AlertType(str, Enum):
    """Types of alerts AgentPulse can generate."""

    # The overall risk score is above its threshold.
    HIGH_HALLUCINATION_RISK = "HIGH_HALLUCINATION_RISK"
    # An agent's recent outputs moved away from its baseline outputs (window distance).
    DRIFT_DETECTED = "DRIFT_DETECTED"
    # The share of tool claims that did not match the tool's real result is above 0.3.
    TOOL_CLAIM_MISMATCH = "TOOL_CLAIM_MISMATCH"
    # Its rule in the backend is switched off (kept there only as a comment), so nothing
    # raises it now. The disagreement score itself is still computed and shown.
    AGENT_DISAGREEMENT = "AGENT_DISAGREEMENT"
    # The grounding risk (output not supported by its evidence) is above its threshold.
    GROUNDING_FAILURE = "GROUNDING_FAILURE"
    # The error rate of the newer half of recent spans minus the older half is above 0.2.
    ERROR_RATE_SPIKE = "ERROR_RATE_SPIKE"
    # No code in this repo raises this one.
    QUALITY_REGRESSION = "QUALITY_REGRESSION"
    # The Agent Stability Index (0 to 100) falls below its threshold.
    ASI_DROP = "ASI_DROP"
    # No code in this repo raises this one.
    EVALUATOR_FAILURE = "EVALUATOR_FAILURE"


# How serious an alert is. The SDK does not use this class. The backend's active rules use
# only "HIGH" and "MEDIUM"; the other three names are not used by any rule.
class AlertSeverity(str, Enum):
    """Alert severity levels."""

    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
