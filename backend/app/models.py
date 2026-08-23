"""SQLModel database models for AgentPulse.

Maps directly to the storage schema defined in the architecture document.
Uses SQLModel for combined Pydantic validation + SQLAlchemy ORM.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel, Column, Text, LargeBinary
import sqlalchemy as sa


# ─── Trace & Span Models ──────────────────────────────────────────────

class Trace(SQLModel, table=True):
    """Top-level trace representing a complete multi-agent workflow execution."""

    __tablename__ = "traces"

    trace_id: str = Field(primary_key=True, max_length=64)
    pipeline_id: Optional[str] = Field(default=None, index=True)
    start_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    end_time: Optional[datetime] = None
    status: str = Field(default="running")  # running, completed, error
    total_spans: int = Field(default=0)
    overall_risk_score: Optional[float] = None
    service_name: str = Field(default="default")
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))


class Span(SQLModel, table=True):
    """Individual agent execution step within a trace."""

    __tablename__ = "spans"

    span_id: str = Field(primary_key=True, max_length=32)
    trace_id: str = Field(foreign_key="traces.trace_id", index=True)
    parent_span_id: Optional[str] = None

    # Agent identity
    agent_id: str = Field(index=True)
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None

    # Classification
    span_kind: str = Field(default="AGENT")
    event_type: str = Field(default="agent_execution")

    # Content (privacy-controlled)
    input_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    output_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None

    # LLM metadata
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None

    # Tool metadata
    tool_name: Optional[str] = None
    tool_args: Optional[str] = Field(default=None, sa_column=Column(Text))
    tool_result_summary: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Timing
    latency_ms: Optional[float] = None
    start_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    end_time: Optional[datetime] = None

    # Status
    status: str = Field(default="success")
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Extensible
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))


# ─── Evaluation Models ─────────────────────────────────────────────────

class Evaluation(SQLModel, table=True):
    """Evaluation result for a single span."""

    __tablename__ = "evaluations"

    id: Optional[int] = Field(default=None, primary_key=True)
    span_id: str = Field(foreign_key="spans.span_id", index=True)
    trace_id: str = Field(index=True)

    # Individual signal scores (0.0 = safe, 1.0 = risky)
    grounding_score: Optional[float] = None
    contradiction_score: Optional[float] = None
    tool_claim_score: Optional[float] = None
    semantic_score: Optional[float] = None
    disagreement_score: Optional[float] = None

    # Composite
    overall_risk_score: Optional[float] = None
    label: Optional[str] = None  # "low_risk", "medium_risk", "high_risk"

    # NLI breakdown
    entailment_prob: Optional[float] = None
    contradiction_prob: Optional[float] = None
    neutral_prob: Optional[float] = None

    # Metadata
    evaluation_stage: Optional[str] = None  # "stage1", "stage2", "skipped"
    evaluator_name: str = Field(default="deberta_minilm_cascade")
    model_name: str = Field(default="cross-encoder/nli-deberta-v3-small")
    model_version: str = Field(default="v1.0")
    config_version: str = Field(default="v1.0")
    threshold_version: str = Field(default="v1.0")
    evaluator_version: str = Field(default="0.1.0")
    evaluated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    details_json: Optional[str] = Field(default=None, sa_column=Column(Text))


# ─── Drift Models ──────────────────────────────────────────────────────

class DriftRecord(SQLModel, table=True):
    """Per-span drift measurement against rolling baseline."""

    __tablename__ = "drift_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: str = Field(index=True)
    node_name: Optional[str] = None
    span_id: Optional[str] = None

    # Embedding drift
    embedding: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    centroid_distance: Optional[float] = None

    # Other drift signals
    tool_drift: Optional[float] = None
    quality_drift: Optional[float] = None
    error_rate_delta: Optional[float] = None

    # Composite
    stability_index: Optional[float] = None  # ASI ∈ [0, 100]

    # Baseline info
    baseline_size: Optional[int] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None

    recorded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )


class Baseline(SQLModel, table=True):
    """Stored baseline for drift comparison."""

    __tablename__ = "baselines"

    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: str = Field(index=True)
    node_name: Optional[str] = None
    baseline_type: str  # "embedding_centroid", "tool_distribution", "risk_mean"
    data: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    sample_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        sa.UniqueConstraint("agent_id", "baseline_type", name="uq_baseline_agent_type"),
    )


# ─── Alert Models ──────────────────────────────────────────────────────

class Alert(SQLModel, table=True):
    """Triggered alert record."""

    __tablename__ = "alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    trace_id: Optional[str] = Field(default=None, foreign_key="traces.trace_id")
    span_id: Optional[str] = None
    agent_id: Optional[str] = None

    alert_type: str = Field(index=True)  # AlertType enum value
    severity: str = Field(index=True)  # AlertSeverity enum value
    message: str
    details_json: Optional[str] = Field(default=None, sa_column=Column(Text))

    acknowledged: bool = Field(default=False)
    resolved: bool = Field(default=False)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


# ─── Agent Registry ────────────────────────────────────────────────────

class AgentRecord(SQLModel, table=True):
    """Registry of known agents seen in traces."""

    __tablename__ = "agent_records"

    agent_id: str = Field(primary_key=True)
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None
    first_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_spans: int = Field(default=0)
    total_errors: int = Field(default=0)
    avg_latency_ms: Optional[float] = None
    avg_risk_score: Optional[float] = None
    current_asi: Optional[float] = None


# ─── Dataset & Experiment Models ───────────────────────────────────────

class DatasetCase(SQLModel, table=True):
    """A curated evaluation test case in a versioned dataset."""

    __tablename__ = "dataset_cases"

    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(index=True)
    dataset_name: str = Field(default="AgentPulse Benchmark", index=True)
    dataset_version: str = Field(default="v1.0", index=True)
    domain: str = Field(default="general")
    input_query: str = Field(sa_column=Column(Text, nullable=False))
    evidence: Optional[str] = Field(default=None, sa_column=Column(Text))
    agent_claim: str = Field(sa_column=Column(Text, nullable=False))
    expected_classification: str = Field(default="SUPPORTED")  # SUPPORTED, UNSUPPORTED, CONTRADICTED
    expected_failure_type: str = Field(default="NO_FAILURE")
    is_failure: bool = Field(default=False)
    trace_id: Optional[str] = Field(default=None, index=True)
    span_id: Optional[str] = None
    operator_notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExperimentRun(SQLModel, table=True):
    """Recorded metrics and metadata from a reproducible experiment run."""

    __tablename__ = "experiment_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    experiment_id: str = Field(unique=True, index=True)
    name: str
    model_name: str
    reasoning_strategy: str = Field(default="DIRECT")
    dataset_version: str = Field(default="v1.0_test")
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    false_positive_rate: Optional[float] = None
    false_negative_rate: Optional[float] = None
    mean_risk: Optional[float] = None
    mean_latency_ms: Optional[float] = None
    total_tokens: Optional[int] = None
    status: str = Field(default="completed")
    results_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

