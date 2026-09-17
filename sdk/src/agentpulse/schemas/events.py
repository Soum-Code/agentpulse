"""Pydantic schemas for telemetry events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus


class SpanPayload(BaseModel):
    """A single agent execution span sent to the backend.
    
    The ids this SDK generates follow W3C TraceContext shapes -- 32-char hex for
    trace_id, 16-char for span_id, via generate_trace_id and generate_span_id.
    The field constraints below are deliberately wider than that, so an id
    minted elsewhere is still accepted. Conforming is what we emit, not what we
    require, and nothing here maps to OpenTelemetry semantic conventions.
    """

    trace_id: str = Field(..., min_length=16, max_length=64)
    span_id: str = Field(..., min_length=8, max_length=32)
    parent_span_id: Optional[str] = None

    # Agent identity
    agent_id: str
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None

    # Event classification
    event_type: EventType = EventType.AGENT_EXECUTION
    span_kind: SpanKind = SpanKind.AGENT

    # Timing
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    latency_ms: Optional[float] = None

    # Content (privacy-controlled)
    input_summary: Optional[str] = None
    output_summary: Optional[str] = None
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None

    # LLM metadata
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None

    # Tool metadata
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    tool_result_summary: Optional[str] = None

    # Status
    status: SpanStatus = SpanStatus.SUCCESS
    error_message: Optional[str] = None

    # Extensible metadata
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    """Batch of spans sent from SDK to backend."""

    spans: list[SpanPayload]
    sdk_version: str = "0.1.0"
    service_name: str = "default"


class IngestResponse(BaseModel):
    """Response from backend after ingesting spans."""

    accepted: int
    failed: int
    message: str = "OK"
    errors: list[str] = Field(default_factory=list)
