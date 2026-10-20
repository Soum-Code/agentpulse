"""SQLModel database models for AgentPulse.

Maps directly to the storage schema defined in the architecture document.
Uses SQLModel for combined Pydantic validation + SQLAlchemy ORM.
"""

# WHAT THIS FILE IS FOR
# It defines every database table the backend uses, written as Python classes.
# SQLModel joins two libraries: SQLAlchemy (a class becomes a table and an object
# becomes a row) and Pydantic (checks that values have the right type). A class with
# `table=True` is one table, and each attribute with a type is one column.
# The tables: traces, spans, evaluations, drift_records, baselines, alerts,
# agent_records, dataset_cases, evaluation_jobs, worker_heartbeats, retention_runs,
# api_keys and experiment_runs.
#
# HOW IT FITS IN
# database.py creates these tables. The API (routers/ingest.py and the query routers),
# the worker (services/evaluation_runner.py, services/job_queue.py) and the services
# (retention.py, api_keys.py) read and write them. Nothing here imports other app code.
#
# About time columns: the default for most is the current UTC time. The job, heartbeat
# and retention tables remove the timezone from that default ("naive" UTC); the other
# tables keep a timezone-aware UTC default.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

# Field sets column options (primary_key, index, default ...). Text = a long-text
# column; LargeBinary = a column that holds raw bytes. Column lets us choose the exact
# SQL type when the plain Python type is not enough.
from sqlmodel import Field, SQLModel, Column, Text, LargeBinary
# sa is used here for sa.DateTime (a date and time column) and sa.UniqueConstraint.
import sqlalchemy as sa


# Trace & Span Models

# A trace = all the spans of one run, tied together by trace_id. ingest.py creates the
# row when the first span with a new trace_id arrives.
class Trace(SQLModel, table=True):
    """Top-level trace representing a complete multi-agent workflow execution."""

    __tablename__ = "traces"

    # The id the SDK gave this run. Spans point back to it with their own trace_id.
    trace_id: str = Field(primary_key=True, max_length=64)
    # Name of the workflow the run belongs to. index=True builds a lookup index, so
    # filtering by it stays fast.
    pipeline_id: Optional[str] = Field(default=None, index=True)
    # sa_column=Column(...) sets the exact SQL column; nullable=False = a value is
    # required. start_time comes from the first span that arrived. end_time moves
    # forward to the latest span end time. ingest.py drops the timezone before saving.
    start_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    end_time: Optional[datetime] = None
    # The code uses two values: "running" (ingest creates the trace with it) and
    # "completed" (the worker sets it after it scores a span of this trace, so it
    # does not mean every span is done). Nothing in backend/app sets "error".
    status: str = Field(default="running")  # running, completed, error
    # How many spans have arrived for this trace (ingest.py adds 1 per incoming span,
    # so a span that is sent twice is counted twice).
    total_spans: int = Field(default=0)
    # The highest overall risk among the scored spans of the trace; None until the
    # worker has scored one (services/evaluation_runner.py).
    overall_risk_score: Optional[float] = None
    # Name of the service that sent the spans (from the SDK's request).
    service_name: str = Field(default="default")
    # Extra data as JSON text. ingest.py does not fill this for traces.
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))


# A span = one recorded step of an agent (usually one LLM call or one tool call).
# The SDK sends spans to POST /v1/ingest and ingest.py saves one row for each new span
# (a span_id it already has is not saved again).
class Span(SQLModel, table=True):
    """Individual agent execution step within a trace."""

    __tablename__ = "spans"

    span_id: str = Field(primary_key=True, max_length=32)
    # foreign_key links this column to traces.trace_id. SQLite does not check foreign
    # keys here (see services/retention.py), so the code must keep them consistent.
    trace_id: str = Field(foreign_key="traces.trace_id", index=True)
    # The span this step hangs under; None for a top-level step.
    parent_span_id: Optional[str] = None

    # Agent identity
    # Name of the agent that did this step.
    agent_id: str = Field(index=True)
    # Free text about what the agent does, for example "Query Planner".
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None

    # Classification
    # The SDK's kinds: AGENT, LLM, TOOL, INTERNAL, HANDOFF (sdk schemas/enums.py).
    span_kind: str = Field(default="AGENT")
    # The SDK's event types: agent_execution, llm_call, llm_response, tool_call,
    # tool_result, handoff, human_input, error, retry.
    event_type: str = Field(default="agent_execution")

    # Content (privacy-controlled)
    # input_summary = the evidence the agent saw; output_summary = what it said. The
    # worker scores the output against the input. The SDK sends these texts only when
    # AGENTPULSE_CAPTURE_INPUTS / AGENTPULSE_CAPTURE_OUTPUTS are true (both default to
    # false), so they are often empty; the worker then skips the grounding check.
    input_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    output_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    # Set by the SDK: "sha256:" plus the first 16 characters of the SHA-256 hash of
    # the text. Lets two texts be compared without storing them.
    input_hash: Optional[str] = None
    output_hash: Optional[str] = None

    # LLM metadata
    model: Optional[str] = None
    # Tokens in the prompt (in) and in the generated answer (out).
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None

    # Tool metadata
    tool_name: Optional[str] = None
    tool_args: Optional[str] = Field(default=None, sa_column=Column(Text))
    # What the tool really returned. The tool-claim check compares the agent's words
    # with this text (for example "retrieved 3 documents" against the real count).
    tool_result_summary: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Timing
    # How long the step took, in milliseconds.
    latency_ms: Optional[float] = None
    start_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    end_time: Optional[datetime] = None

    # Status
    # "success" means fine. Any other value counts as an error when ingest.py updates
    # the agent's error count.
    status: str = Field(default="success")
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Extensible
    # Extra data from the SDK, saved as JSON text.
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))


# Evaluation Models

# One row = the scores for one span. The worker writes it (persist_results in
# services/evaluation_runner.py), at most once per span.
class Evaluation(SQLModel, table=True):
    """Evaluation result for a single span."""

    __tablename__ = "evaluations"

    # id is None until the database assigns it (the primary key counts up by itself).
    id: Optional[int] = Field(default=None, primary_key=True)
    span_id: str = Field(foreign_key="spans.span_id", index=True)
    trace_id: str = Field(index=True)

    # Individual signal scores (0.0 = safe, 1.0 = risky)
    # grounding_score: is the output supported by the evidence? With the NLI model it
    # is contradiction_prob + 0.5 * neutral_prob (see services/grounding.py).
    grounding_score: Optional[float] = None
    # Not written by any code in backend/app, so it stays empty.
    contradiction_score: Optional[float] = None
    # The share of the agent's claims about a tool that do not match what the tool
    # really returned (mismatches / claims; 0.0 = all match, 1.0 = none match).
    tool_claim_score: Optional[float] = None
    # Not written by any code in backend/app, so it stays empty.
    semantic_score: Optional[float] = None
    # How much this agent's output contradicts an earlier agent's output in the same
    # trace (found with NLI). The worst pair is the one that gets stored.
    disagreement_score: Optional[float] = None

    # In short: this number tells you how to read tool_claim_score. None = the check
    # did not run. 0 = it ran and found nothing to check. Above 0 = a score of 0.0 really
    # means every claim matched.
    # How many tool claims the validator actually found in this span's output.
    #
    # tool_claim_score alone is ambiguous: 0.0 means both "every claim checked
    # out" and "there was nothing to check", and on real traces it is almost
    # always the second. The external corpus in Section 11 carries 8,353 prose
    # spans and zero extractable claims, because agents state intentions ("I
    # need to log into the file system") rather than narrating counts. A score
    # of 0.0 read as "verified, all good" is then wrong nearly every time.
    #
    # None = the validator did not run on this span at all (no tool calls, or
    # no output text). 0 = it ran and found no claim to check.
    tool_claims_found: Optional[int] = None

    # Whether the NLI premise exceeded the model's 512-token window, so the
    # grounding score describes only the part of the evidence the model read.
    #
    # Same fault as tool_claims_found above: it was computed per evaluation and
    # surfaced only as a logger.warning fired ONCE per worker process, then
    # dropped. A score cannot be audited after the fact if the one record of
    # its input being cut is a log line that stopped being emitted after the
    # first occurrence.
    #
    # Not currently triggered on the demo corpus -- 100 comparisons ran 209-288
    # tokens against a 512 limit (Section 25.2) -- but a production retriever
    # returning longer documents crosses it, and that is exactly when nobody
    # would be watching the logs.
    grounding_input_truncated: Optional[bool] = None
    grounding_input_tokens: Optional[int] = None

    # Composite
    # A weighted average of the grounding, tool-claim and disagreement scores, using
    # only the ones that exist for this span. Weights: 0.40, 0.25 and 0.20
    # (services/evaluator.py, _aggregate_risk).
    overall_risk_score: Optional[float] = None
    # Set from overall_risk_score: above 0.7 is "high_risk", above 0.4 is
    # "medium_risk", otherwise "low_risk" (services/evaluator.py, _classify_risk).
    label: Optional[str] = None  # "low_risk", "medium_risk", "high_risk"

    # NLI breakdown
    # The NLI model's probability for each answer: the evidence supports the output
    # (entailment), contradicts it, or neither (neutral).
    entailment_prob: Optional[float] = None
    contradiction_prob: Optional[float] = None
    neutral_prob: Optional[float] = None

    # Metadata
    # Which path produced the grounding score: "stage2" = the NLI model; "stage1" =
    # NLI was not loaded, so a similarity-only fallback was used; "skipped" = there
    # was no grounding result (see persist_results in services/evaluation_runner.py).
    evaluation_stage: Optional[str] = None  # "stage1", "stage2", "skipped"
    # The name is historical: both models run on every span, nothing is gated
    # between them (see the docstring at the top of services/grounding.py).
    evaluator_name: str = Field(default="deberta_minilm_cascade")
    # These version labels are saved with each result so scores can be compared later.
    # persist_results copies the first four from the evaluator; it does not set
    # evaluator_version, so that one keeps its default.
    model_name: str = Field(default="cross-encoder/nli-deberta-v3-small")
    model_version: str = Field(default="v1.0")
    config_version: str = Field(default="v1.0")
    threshold_version: str = Field(default="v1.0")
    evaluator_version: str = Field(default="0.1.0")
    # When the result was saved (UTC).
    evaluated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    # Not written by any code in backend/app, so it stays empty.
    details_json: Optional[str] = Field(default=None, sa_column=Column(Text))


# Drift Models

# Drift = the pattern of an agent's outputs changing over time compared with its own
# baseline. One row per scored span, written by the worker (persist_results).
class DriftRecord(SQLModel, table=True):
    """Per-span drift measurement against rolling baseline."""

    __tablename__ = "drift_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: str = Field(index=True)
    # persist_results fills this with the agent_id.
    node_name: Optional[str] = None
    span_id: Optional[str] = None

    # Embedding drift
    # An embedding = a list of numbers that stands for the meaning of a text. This
    # column is not filled by persist_results, so it is normally empty.
    embedding: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    # Distance of one output from the running EMA centroid: the *spike* signal.
    # Fires on ordinary step-to-step variation, so it is kept but not used for
    # alerting.
    centroid_distance: Optional[float] = None
    # Baseline-window mean vs current-window mean: the *sustained shift* signal
    # that alerting actually reads. Stays None until both windows fill, which is
    # why coverage is partial by design -- a null here means "not enough
    # samples yet", not "no drift".
    window_centroid_distance: Optional[float] = None

    # Other drift signals
    # These come from services/drift.py. A signal is None when the span gave nothing to
    # measure it from (no tool name; for quality_drift, no grounding score), and it
    # stays 0.0 until the agent has 10 samples of it.
    # How evenly the agent's calls are spread over its different tools (normalized
    # entropy: 0 = always the same tool, 1 = all tools used equally).
    tool_drift: Optional[float] = None
    # How far the average of the recent half of the agent's grounding scores is above
    # the average of the older half (never below 0).
    quality_drift: Optional[float] = None
    # The recent half's error rate minus the older half's error rate (never below 0).
    error_rate_delta: Optional[float] = None

    # Composite
    # ASI = Agent Stability Index. 100 = steady, 0 = very unstable. It is an operational
    # monitoring number built from the drift signals, not a scientifically validated one.
    stability_index: Optional[float] = None  # ASI ∈ [0, 100]

    # Baseline info
    # How many spans of this agent had been analyzed before this one (its sample count).
    baseline_size: Optional[int] = None
    # These two are not written by any code in backend/app, so they stay empty.
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None

    recorded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )


# A baseline = what is "normal" for one agent, saved so a restart does not lose it.
# The worker writes it (persist_drift_baselines in services/evaluation_runner.py).
class Baseline(SQLModel, table=True):
    """Stored baseline for drift comparison."""

    __tablename__ = "baselines"

    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: str = Field(index=True)
    node_name: Optional[str] = None
    # The code writes two types: "embedding_centroid" (a moving average of the agent's
    # output embeddings) and "window_baseline_pool" (the window baseline used for
    # window_centroid_distance). No code writes "tool_distribution" or "risk_mean",
    # though the comment on the line below lists them.
    baseline_type: str  # "embedding_centroid", "tool_distribution", "risk_mean"
    # The saved numbers as raw bytes; drift.py reads them back into arrays.
    data: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    # How many outputs went into this baseline.
    sample_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # An agent can have at most one row per baseline_type. The database enforces it.
    __table_args__ = (
        sa.UniqueConstraint("agent_id", "baseline_type", name="uq_baseline_agent_type"),
    )


# Alert Models

# One row = one alert that fired. The worker writes it (persist_results) from the rules
# in services/alerting.py. An alert rule = a threshold on one score.
class Alert(SQLModel, table=True):
    """Triggered alert record."""

    __tablename__ = "alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    trace_id: Optional[str] = Field(default=None, foreign_key="traces.trace_id")
    span_id: Optional[str] = None
    agent_id: Optional[str] = None

    # Both are plain text taken from the alert rules. alert_type is one of
    # HIGH_HALLUCINATION_RISK, GROUNDING_FAILURE, TOOL_CLAIM_MISMATCH, DRIFT_DETECTED,
    # ASI_DROP or ERROR_RATE_SPIKE; severity is HIGH or MEDIUM. The two "enum" notes
    # below are old: no AlertType or AlertSeverity class exists.
    alert_type: str = Field(index=True)  # AlertType enum value
    severity: str = Field(index=True)  # AlertSeverity enum value
    # A sentence for people, naming the agent, the value and the threshold.
    message: str
    # JSON text: which score fired, its value, the threshold, and the other scores.
    details_json: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Changed by PATCH /v1/alerts/{id} (update_alert in routers/__init__.py), which
    # also sets the matching *_at time below.
    acknowledged: bool = Field(default=False)
    resolved: bool = Field(default=False)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


# Agent Registry

# One row per agent. ingest.py creates it and, when a span arrives, updates the counts,
# last_seen and avg_latency_ms; the worker updates avg_risk_score and current_asi after
# it scores a span.
class AgentRecord(SQLModel, table=True):
    """Registry of known agents seen in traces."""

    __tablename__ = "agent_records"

    agent_id: str = Field(primary_key=True)
    agent_role: Optional[str] = None
    pipeline_id: Optional[str] = None
    first_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_spans: int = Field(default=0)
    # Spans whose status was not "success".
    total_errors: int = Field(default=0)
    # The next two are moving averages: each new value counts 5% and the old average
    # keeps 95% (new = old * 0.95 + value * 0.05), so recent spans matter most.
    avg_latency_ms: Optional[float] = None
    avg_risk_score: Optional[float] = None
    # The latest Agent Stability Index (0-100) from the drift detector.
    current_asi: Optional[float] = None


# Dataset & Experiment Models

# A curated test case: a claim, its evidence and the label we expect the evaluator to
# give. Rows are added by POST /v1/datasets/{name}/cases (routers/experiments.py); the
# {name} in that URL is stored as dataset_version.
class DatasetCase(SQLModel, table=True):
    """A curated evaluation test case in a versioned dataset."""

    __tablename__ = "dataset_cases"

    id: Optional[int] = Field(default=None, primary_key=True)
    # The test case's own name or id inside its dataset.
    case_id: str = Field(index=True)
    dataset_name: str = Field(default="AgentPulse Benchmark", index=True)
    dataset_version: str = Field(default="v1.0", index=True)
    domain: str = Field(default="general")
    # The question or task given to the agent.
    input_query: str = Field(sa_column=Column(Text, nullable=False))
    # The evidence the agent had (may be empty).
    evidence: Optional[str] = Field(default=None, sa_column=Column(Text))
    # What the agent said, which is the thing to be judged against the evidence.
    agent_claim: str = Field(sa_column=Column(Text, nullable=False))
    expected_classification: str = Field(default="SUPPORTED")  # SUPPORTED, UNSUPPORTED, CONTRADICTED
    # The kind of failure expected; "NO_FAILURE" is the default for a good claim.
    expected_failure_type: str = Field(default="NO_FAILURE")
    is_failure: bool = Field(default=False)
    # The live trace and span this case was curated from, if there was one.
    trace_id: Optional[str] = Field(default=None, index=True)
    span_id: Optional[str] = None
    # Free-text notes written by the person who curated the case.
    operator_notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# In short: one row = one span waiting to be scored. The API adds the row (enqueue_job
# in services/job_queue.py). A worker claims it, runs the evaluation, then marks it
# done or failed (claim_next, mark_succeeded, mark_failed in the same file).
# The status values are: queued, running, succeeded, failed, dead_letter.
class EvaluationJob(SQLModel, table=True):
    """A durable unit of evaluation work.

    Before this table existed, evaluation was queued via FastAPI BackgroundTasks
    — an in-memory list inside the API process. If the process died, every
    pending evaluation vanished with no record that it had ever been owed, and a
    failing evaluation was caught, logged and dropped. Measured on the previous
    architecture, a SIGKILL mid-batch lost every un-started evaluation
    permanently (see experiments/results/durability_measurements.json).

    STATE MACHINE

        queued ──claim──> running ──ok───> succeeded
           ^                 │
           │                 ├──retryable failure, attempts < max──┐
           └─────────────────┘                                     │
           (backoff via available_at) <───────────────────────────-┘
                             │
                             ├──retryable failure, attempts >= max──> dead_letter
                             └──permanently unprocessable ──────────> failed

    `failed` and `dead_letter` are deliberately distinct: `failed` means the job
    can never succeed (a malformed payload retried ten times is still
    malformed), while `dead_letter` means it kept failing for reasons that
    looked transient. Collapsing them would hide which of the two happened.

    CRASH RECOVERY relies on `lease_expires_at` rather than on the worker
    reporting its own death, because a killed worker reports nothing. A job in
    `running` whose lease has expired is assumed abandoned and returned to
    `queued`.

    IDEMPOTENCY relies on `job_key`, a deterministic function of the span, with
    a UNIQUE constraint. Re-submitting the same span cannot create a second job.
    """

    __tablename__ = "evaluation_jobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Deterministic identity. UNIQUE is what makes duplicate submission a no-op
    # at the database level rather than something application code must remember
    # to check.
    # Its value is the SHA-256 hash (as hex text) of "<trace_id>::<span_id>"
    # (job_key_for in services/job_queue.py).
    job_key: str = Field(unique=True, index=True, max_length=128)

    span_id: str = Field(index=True, max_length=64)
    trace_id: str = Field(index=True, max_length=64)
    agent_id: str = Field(max_length=128)

    # The job carries everything needed to run it. A worker must not have to
    # reconstruct the request from other tables, or the job stops being a
    # self-contained unit of work.
    # It is the span's fields as JSON text (built in routers/ingest.py and saved by
    # enqueue_job).
    payload_json: str = Field(sa_column=Column(Text, nullable=False))

    status: str = Field(default="queued", index=True)
    # attempts goes up by 1 each time a worker claims the job. When a retryable failure
    # happens and attempts has reached max_attempts, the job becomes dead_letter.
    attempts: int = Field(default=0)
    max_attempts: int = Field(default=3)

    # Earliest time this job may be claimed. Retry backoff is expressed by
    # pushing this into the future rather than by sleeping in a worker, so the
    # delay survives a worker restart.
    # The delay is 2, 4, 8 ... seconds (2 * 2^(attempts-1)), at most 300 seconds
    # (compute_backoff_seconds in services/job_queue.py).
    available_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column=Column(sa.DateTime, nullable=False, index=True),
    )
    # Set when a worker claims the job: now + lease_seconds (default 120). A running
    # job past this time is treated as abandoned. Empty when nobody holds the job.
    lease_expires_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime, nullable=True)
    )
    # The worker that holds the job right now (None when nobody does).
    worker_id: Optional[str] = Field(default=None, max_length=128)

    # Text of the latest error, cut to 2000 characters. It is cleared when the job
    # succeeds.
    last_error: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    # When a worker last claimed the job (each new claim overwrites it).
    started_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime, nullable=True)
    )
    # When the job reached succeeded, failed or dead_letter.
    completed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime, nullable=True)
    )


# One row per worker process. The worker (app/worker.py) saves a "heartbeat" here
# roughly every 15 seconds when idle, and sooner while it is busy. The API reads these
# rows to tell if an evaluator is alive: a worker counts as stale after 90 seconds
# without a heartbeat (WORKER_STALE_AFTER_SECONDS in services/platform_health.py).
class WorkerHeartbeat(SQLModel, table=True):
    """Liveness and identity of an evaluation worker process.

    Exists because the worker runs in a DIFFERENT PROCESS from the API. Nothing
    in the API's memory can answer "is an evaluator alive, and what is it running
    on?", so the answer has to be persisted somewhere both can see.

    Liveness is inferred from `last_heartbeat_at` going stale rather than from
    the worker announcing its own death, for the same reason job leases work that
    way: a SIGKILLed process announces nothing.

    `nli_backend` / `backend_degraded` are recorded per worker, not read from the
    API's own `backend_info()`. The API and the worker load models independently,
    and since evaluation happens in the worker, the API's view of its own backend
    says nothing about what actually evaluated a span. A dependency regression
    that silently put the evaluator back on the slow PyTorch path would be
    invisible if this were taken from the API.
    """

    __tablename__ = "worker_heartbeats"

    # Built as "<hostname>:<process id>:<8 random hex characters>" (make_worker_id in
    # worker.py).
    worker_id: str = Field(primary_key=True, max_length=128)
    # The machine name and the operating-system process number of the worker.
    hostname: str = Field(max_length=128)
    pid: int
    # "running" normally; the worker writes "stopping" while it shuts down.
    status: str = Field(default="running", max_length=32)

    # Set when the worker's first heartbeat creates the row.
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column=Column(sa.DateTime, nullable=False),
    )
    # The time of the latest heartbeat. Staleness is judged from this.
    last_heartbeat_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column=Column(sa.DateTime, nullable=False, index=True),
    )

    # Cumulative for this process, so "alive but doing nothing" is
    # distinguishable from "alive and working".
    jobs_processed: int = Field(default=0)
    jobs_failed: int = Field(default=0)

    # Which engine runs the NLI model: "onnx" or "pytorch" (None if not loaded). The
    # embedding model has no ONNX path, so its value is "pytorch" or None (grounding.py).
    nli_backend: Optional[str] = Field(default=None, max_length=32)
    embedding_backend: Optional[str] = Field(default=None, max_length=32)
    # True when ONNX was asked for (config use_onnx) but the NLI model runs on
    # something else. Results are the same; it is slower. fallback_reason says why.
    backend_degraded: bool = Field(default=False)
    fallback_reason: Optional[str] = Field(default=None, sa_column=Column(Text))


# One row per real retention run, saved by apply_retention in services/retention.py.
# A dry run (a count that deletes nothing) is not recorded.
class RetentionRun(SQLModel, table=True):
    """Record of a retention execution.

    Retention runs as a separate scheduled process, so without this an operator
    has no way to answer "did retention run, and what did it remove?" other than
    reading logs from a process that has already exited.
    """

    __tablename__ = "retention_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column=Column(sa.DateTime, nullable=False, index=True),
    )
    completed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime, nullable=True)
    )
    # Data older than this time was deleted (now minus retention_days).
    cutoff: datetime = Field(sa_column=Column(sa.DateTime, nullable=False))
    retention_days: int
    # Always False in rows that apply_retention writes, because it skips dry runs.
    dry_run: bool = Field(default=False)
    # How many batches of traces were deleted, each in its own transaction.
    batches: int = Field(default=0)
    total_rows_deleted: int = Field(default=0)
    # JSON text with the rows deleted per table, for example {"spans": 120, ...}.
    rows_deleted_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    # apply_retention never fills this, so it stays empty.
    error: Optional[str] = Field(default=None, sa_column=Column(Text))


# One row per issued API key. Created and checked by services/api_keys.py; the routes
# are in routers/__init__.py (/v1/keys). A key looks like
# "ap_live_<12 hex characters>_<long random text>" (generate_key in api_keys.py).
class ApiKeyRecord(SQLModel, table=True):
    """An issued API key, stored as a hash.

    The backend used to know exactly one key, read from AGENTPULSE_API_KEY and
    compared directly. That is fine for a single self-hosted instance and
    useless the moment more than one caller needs its own credential -- there is
    nothing to revoke, nothing to attribute a span to, and no way to hand
    somebody access without handing them everybody's access.

    WHY A HASH AND NOT THE KEY

    The plaintext is shown once, at creation, and never stored. A database file
    that leaks then leaks no working credential. This is the same reason a
    password is not stored either, with one difference: these keys are 32 bytes
    of `secrets.token_urlsafe`, not a human-chosen phrase, so there is nothing to
    brute force and SHA-256 is enough. bcrypt would only add latency to a check
    that runs on every single request.

    WHY A PREFIX COLUMN

    Verification has to find the right row before it can compare anything.
    Hashing the presented key and searching by hash would work, but the prefix
    is indexed and non-secret, so a lookup touches one row instead of scanning.
    The prefix alone is useless without the rest of the key.
    """

    __tablename__ = "api_keys"

    id: Optional[int] = Field(default=None, primary_key=True)

    # The public half of the key, used only to locate the row.
    key_prefix: str = Field(index=True, unique=True)

    # SHA-256 of the full key. The key itself is never written down.
    key_hash: str

    # Whose key this is. Free-form because the backend has no user table of its
    # own -- the console supplies its own identifier (a Firebase uid today).
    owner_id: str = Field(index=True)
    # A name for the key. create_key stores "unnamed" when the caller gives none.
    label: str = ""

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Revocation is a timestamp rather than a delete, so a revoked key stays
    # auditable and a spike of 401s can be explained afterwards.
    revoked_at: Optional[datetime] = None

    # Updated opportunistically, not on every request: writing on each call
    # would put a database write in the authentication path of every request,
    # which is exactly where it must not be.
    # Nothing in backend/app writes this column yet, so it stays empty.
    last_used_at: Optional[datetime] = None


# The saved result of one experiment run. GET /v1/experiments reads these rows
# (routers/experiments.py). No code in backend/app creates them.
class ExperimentRun(SQLModel, table=True):
    """Recorded metrics and metadata from a reproducible experiment run."""

    __tablename__ = "experiment_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    experiment_id: str = Field(unique=True, index=True)
    name: str
    model_name: str
    # How the model was asked to reason. The reports use DIRECT (zero-shot),
    # COT (chain-of-thought) and AOT (Atom of Thoughts).
    reasoning_strategy: str = Field(default="DIRECT")
    # Which dataset version the run used (see DatasetCase.dataset_version).
    dataset_version: str = Field(default="v1.0_test")
    # Detection scores, named by their usual meaning. precision = of the cases
    # flagged, how many were truly bad. recall = of the truly bad cases, how many were
    # flagged. f1 combines the two. The two rates count wrong flags (false positive)
    # and missed bad cases (false negative).
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

