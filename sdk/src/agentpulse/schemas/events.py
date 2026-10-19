"""Pydantic schemas for telemetry events."""

# What this file is for:
#   Defines the shapes of the data the SDK sends to the API: SpanPayload (one recorded
#   step of an agent), IngestRequest (a batch of spans) and IngestResponse (the API's
#   reply). They are pydantic models. A pydantic model is a class whose fields have types
#   and rules; pydantic checks them when you build an object and can turn it into JSON.
#
# How it fits in:
#   Uses the enums from enums.py. client.py, decorators.py and integrations/ build
#   SpanPayload objects; transport.py wraps a batch of them in IngestRequest and posts it.
#   The backend does not import these classes; routers/ingest.py has its own copy of the shape.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

# Field(...) adds rules or a default to one field of a pydantic model.
from pydantic import BaseModel, Field

from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus


# SpanPayload = one span: one recorded step of an agent (one run of an agent node, one LLM
# call or one tool call), with the evidence it saw and what it said. Only trace_id, span_id
# and agent_id must be given; every other field has a default.
class SpanPayload(BaseModel):
    """A single agent execution span sent to the backend.
    
    The ids this SDK generates follow W3C TraceContext shapes -- 32-char hex for
    trace_id, 16-char for span_id, via generate_trace_id and generate_span_id.
    The field constraints below are deliberately wider than that, so an id
    minted elsewhere is still accepted. Conforming is what we emit, not what we
    require, and nothing here maps to OpenTelemetry semantic conventions.
    """

    # trace_id ties together all the spans of one run. span_id names this one step.
    # "..." means the field is required. Building a span with an id outside the length range
    # raises a pydantic ValidationError.
    trace_id: str = Field(..., min_length=16, max_length=64)
    span_id: str = Field(..., min_length=8, max_length=32)
    # The span this step runs under; None for a top-level step.
    parent_span_id: Optional[str] = None

    # Agent identity
    # agent_id names the agent. agent_role is a free-text label of its job (for example
    # "researcher"). pipeline_id names the workflow the agent belongs to.
    agent_id: str
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None

    # Event classification
    # Labels for the kind of step (see enums.py). The defaults are used when nothing is passed.
    event_type: EventType = EventType.AGENT_EXECUTION
    span_kind: SpanKind = SpanKind.AGENT

    # Timing
    # default_factory runs once for each new span, so each span gets its own "now" (in UTC).
    # A plain default would be fixed once, when this file is first imported.
    # end_time is empty until the step ends; LangGraphAdapter never sets it. latency_ms = how
    # long the step took, in milliseconds.
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    latency_ms: Optional[float] = None

    # Content (privacy-controlled)
    # input_summary = the evidence the agent saw; output_summary = what it said. @monitor and
    # instrument_llm fill them only when the capture settings allow it (see privacy.py), so
    # they are often empty. LangGraphAdapter fills them with a short summary whatever the
    # settings say (the output one stays empty if the node returned nothing).
    # The two hashes are short fingerprints of the text ("sha256:" plus 16 characters, made
    # by hash_content in utils.py). They let you tell if two texts were equal without
    # keeping the text. @monitor and LangGraphAdapter hash only the first 2000 characters.
    input_summary: Optional[str] = None
    output_summary: Optional[str] = None
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None

    # LLM metadata
    # The model name, and the number of tokens in the prompt (in) and in the answer (out).
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None

    # Tool metadata
    # Filled for tool steps (LangGraphAdapter). tool_args is the arguments as JSON text.
    # tool_result_summary is what the tool really returned; the backend's tool-claim check
    # compares what the agent said the tool returned against it.
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result_summary: Optional[str] = None

    # Status
    # How the step ended, and the error text if it failed. The default is SUCCESS.
    status: SpanStatus = SpanStatus.SUCCESS
    error_message: Optional[str] = None

    # Extensible metadata
    # Free-form extra key/value data. default_factory=dict gives each span its own new empty
    # dict. The SDK itself writes only one key, "output_captured" (integrations/llm.py).
    metadata: dict[str, Any] = Field(default_factory=dict)


# IngestRequest = the body of one POST to <endpoint>/v1/ingest: a batch of spans plus who
# sent them. transport.py builds it.
class IngestRequest(BaseModel):
    """Batch of spans sent from SDK to backend."""

    spans: list[SpanPayload]
    # transport.py passes "0.1.0" for sdk_version and the service_name from the settings.
    # The backend saves service_name on the trace when it first sees that trace.
    sdk_version: str = "0.1.0"
    service_name: str = "default"


# IngestResponse = the shape of the API's reply to a batch. The SDK does not read the reply
# body: transport.py looks only at the HTTP status. The backend has its own matching class
# (IngestResponse in routers/ingest.py).
class IngestResponse(BaseModel):
    """Response from backend after ingesting spans."""

    # accepted = spans the API saved (including ones it already had). failed = spans that
    # raised an error while being saved.
    accepted: int
    failed: int
    message: str = "OK"
    # One short text per failed span.
    errors: list[str] = Field(default_factory=list)
