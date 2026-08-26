# AgentPulse: Audit History

This consolidates three previously separate audit documents from the same historical
arc — auditing the codebase, then auditing the specific numbers it produced, before
they were fixed. Kept as process evidence, in chronological order. For the current,
live remediation status (what was fixed and how), see `REMEDIATION_AUDIT.md`.

---

## Part 1: Current State Audit (Phase 0) — 2026-08-18

**Scope:** Pre-implementation audit of the codebase against the master engineering requirements, before the work described in later reports in this repository.

### Classification key

- `VERIFIED` — proven by automated end-to-end tests or live execution logs.
- `IMPLEMENTED` — code is written and present.
- `TESTED` — covered by automated unit or service tests.
- `MEASURED` — recorded from an actual benchmark run.
- `PROPOSED` — planned, not yet built.
- `EXPERIMENTAL` — a heuristic that has not been calibrated.
- `UNSUPPORTED` — out of scope for the MVP.
- `UNKNOWN` — untested or unmeasured behavior.

### Component audit

#### SDK (`sdk/src/agentpulse/`)

| Component | Status | Notes |
| :--- | :--- | :--- |
| `@monitor` decorator | TESTED | Wraps sync/async functions, captures timing and tokens. `tests/test_sdk.py`. |
| Async transport | TESTED | Background flush loop, queue batching, exponential backoff retry. |
| Local fallback | TESTED | Appends spans to a local JSONL file when HTTP transport fails. |
| Trace context | TESTED | Trace/span IDs, parent-child links, state storage. |
| Privacy filter | TESTED | Regex redaction of emails, phone numbers, API keys, field exclusions. |
| LangGraph adapter | IMPLEMENTED | A helper function exists; needs a formal adapter class conforming to `BaseIntegration`. |
| LangChain adapter | PROPOSED | Not built. |
| CrewAI adapter | PROPOSED | Not built. |

#### Backend services (`backend/app/services/`)

| Component | Status | Notes |
| :--- | :--- | :--- |
| SQLModel schema | IMPLEMENTED | 7 tables: traces, spans, evaluations, drift_records, baselines, alerts, agent_records. |
| SQLite WAL storage | VERIFIED | WAL mode and foreign keys enabled. |
| MiniLM semantic similarity | VERIFIED | `all-MiniLM-L6-v2` cosine similarity. |
| DeBERTa NLI evaluator | VERIFIED | `nli-deberta-v3-small`, entailment/neutral/contradiction distribution. |
| Tool-claim validator | TESTED | Regex extraction of counts and tool names; mismatch scoring. |
| Inter-agent disagreement | IMPLEMENTED | A `disagreement_score` slot exists; cross-agent comparison within a trace not yet orchestrated. |
| Drift detector (4 signals) | TESTED | Centroid distance, quality trend, tool entropy, error-rate delta. |
| Agent Stability Index | EXPERIMENTAL | Composite heuristic score in [0, 100]. Not calibrated. |
| Baseline management | IMPLEMENTED | Rolling EMA centroid; no explicit freeze/reset yet. |
| Alert engine | TESTED | Threshold rules, cooldown deduplication, storm suppression. |
| WebSocket broadcast | VERIFIED | `/v1/ws/live` broadcasts events to connected clients. |

#### Dashboard (`dashboard/`)

| Component | Status | Notes |
| :--- | :--- | :--- |
| React + Vite + TS build | VERIFIED | Compiles with no type errors. |
| Agent topology graph | IMPLEMENTED | Visual node graph of active agent state. |
| Simulation studio | VERIFIED | In-dashboard scenario runner (clean, hallucination, tool_mismatch, drift). |
| Trace investigation view | IMPLEMENTED | Risk progression chart, root-cause badge, step inspection. |
| ASI gauges | IMPLEMENTED | Animated stability indicators. |
| Incident replay scrubber | PROPOSED | Not built. |
| Failure radar | PROPOSED | Not built. |
| Command palette | PROPOSED | Not built. |

### Findings at this stage

1. Documentation used the imprecise term "hallucination detection" where "grounding-risk estimation" would be accurate.
2. `integrations/__init__.py` had a helper function but no formal `BaseIntegration`/`LangGraphAdapter` classes.
3. `disagreement_score` existed in the schema, but nothing computed it — cross-agent comparison within a trace wasn't wired up.
4. The rolling EMA baseline had no freeze/reset mechanism, so it could slowly absorb degraded behavior as if it were normal.
5. The evaluation table lacked `model_name`, `model_version`, `config_version`, `threshold_version` fields.
6. No tests existed for transport resilience (backend down, HTTP 500 retry, JSONL recovery).
7. No tests existed for API key auth or rate limiting.
8. Performance figures were estimated, not measured by an automated benchmark script.
9. The dashboard had trace inspection but no step-by-step incident replay.
10. No compact multi-signal triage view existed.
11. No keyboard-driven navigation existed.
12. `docker-compose.yml` was scaffolded but volumes and environment variables weren't fully wired.

### Remediation plan at this stage

1. Build `sdk/src/agentpulse/integrations/base.py` and `langgraph.py` (LangChain and CrewAI stay marked PROPOSED).
2. Build the cross-agent disagreement service (`backend/app/services/disagreement.py`).
3. Add baseline freeze, reset, and versioning to `backend/app/services/drift.py`.
4. Add the missing evaluation metadata fields to `backend/app/models.py`.
5. Add resilience, auth, and integration test suites.
6. Build `benchmarks/run_benchmarks.py` to produce measured, not estimated, figures.
7. Build out the dashboard's remaining views (replay, failure radar, command palette, evidence inspector).

---

## Part 2: Current Real Validation Audit — 2026-08-18

**Date:** August 18, 2026, with status updates from later sessions noted inline.
**Purpose:** Classify each component of the repository by evidence type, before running real-model and reasoning-strategy validation.
**Classification key:** Implemented, Tested, Measured, Partially implemented, Proposed, Unsupported, Unknown.

### Component audit

| Component | Path | Classification | Evidence |
| :--- | :--- | :---: | :--- |
| SDK core client and context | `sdk/src/agentpulse/client.py`, `context.py` | Tested | W3C-compatible trace context propagation, unit tested in `tests/test_sdk.py`. |
| SDK `@pulse.monitor` decorator | `sdk/src/agentpulse/decorators.py` | Tested | Async/sync execution wrapper with latency capture. |
| SDK async transport and fallback | `sdk/src/agentpulse/transport.py` | Measured | Non-blocking deque enqueue (5.4M spans/sec, in-memory), local JSONL fallback tested. |
| LangGraph adapter | `sdk/src/agentpulse/integrations/langgraph.py` | Tested | Graph and node instrumentation verified against live LangGraph execution in `tests/test_e2e_langgraph.py`. |
| LangChain and CrewAI adapters | `integrations/langchain.py`, `crewai.py` | Proposed | Explicit `NotImplementedError` stubs, tested as such in `test_integrations.py`. Not built. |
| FastAPI ingestion and REST endpoints | `backend/app/routers/ingest.py`, `__init__.py` | Tested | Batch ingest, trace detail, and other endpoints covered across the test suite. |
| SQLite WAL storage and SQLModel schema | `backend/app/database.py`, `models.py` | Tested | 7 tables: traces, spans, evaluations, drift_records, baselines, alerts, agent_records. |
| MiniLM embedding evaluator | `backend/app/services/grounding.py` | Measured | PyTorch CPU inference, P50 = 15.13 ms. |
| DeBERTa NLI evaluator | `backend/app/services/grounding.py` | Measured | 3-class NLI inference, P50 = 88.51 ms. |
| Tool-claim extraction and validation | `backend/app/services/tool_claim.py` | Tested | Structured tool name and count matching. A 6-type multi-claim extractor exists in `claim_extractor.py` but is not wired into the pipeline. |
| Inter-agent disagreement engine | `backend/app/services/disagreement.py` | Tested | Cross-agent NLI contradiction detection, tested in `test_disagreement.py`. |
| Drift engine and baseline management | `backend/app/services/drift.py` | Measured | Centroid distance, tool entropy, quality drift, error delta, freeze/reset. As of a later session, baselines also persist to the database and are thread-safe for concurrent evaluation. |
| Agent Stability Index | `backend/app/services/drift.py` | Tested | 4-signal composite, unit tested in `test_services.py`. |
| Alert engine | `backend/app/services/alerting.py` | Tested | Cooldown deduplication and storm suppression, tested. |
| Live WebSocket broadcast | `backend/app/routers/websocket.py` | Tested | Broadcasts span events to connected clients. |
| Dashboard | `dashboard/src/App.tsx` | Implemented | Topology, waterfall, evidence inspector, incidents, replay, drift timeline. |
| LLM adapter layer | `llm_adapters/` | Implemented as of a later session | At the time of this audit, this was proposed. It's since been built: `LocalHFAdapter` (HF transformers, falls back to a deterministic stub unless `load_immediately=True`) and `LocalGGUFAdapter` (real local inference via llama.cpp, used for `Qwen3-8B-Q4_K_M`). |
| Reasoning strategy layer | `reasoning/` | Implemented as of a later session | `DirectStrategy`, `CoTStrategy`, `AoTStrategy` are built and adapter-agnostic. |
| 3 multi-agent demo workflows | `demo/workflows/` | Implemented as of a later session | Research assistant, technical support, and data analysis workflows all exist, plus a local vector retriever. |
| Dataset versioning and trace curation | `datasets/`, `backend/app/routers/experiments.py` | Implemented | Versioned `v1.0_dev/val/test` splits (73 cases total) and a curate-to-dataset API. |
| Reasoning strategy experiment runner | `experiments/reasoning_strategies.py` | Implemented, currently running | Compares Direct/CoT/AoT under identical conditions. As of this audit's original writing this called the fallback stub, not a real model — fixed in a later session; see `REASONING_STRATEGY_EVALUATION_REPORT.md` for current status. |
| Compounding-error experiment | `experiments/compounding_error.py` | Implemented | Control (no intervention) vs intervention conditions, both measured; see `PROJECT_REPORT.md` Section 6. |

---

## Part 3: Empirical Audit and Measurement Methodology — 2026-08-19, updated 2026-08-23

**Date:** August 19, 2026 (findings), updated August 23, 2026 (remedy status).
**Purpose:** Independent audit of previously reported benchmarks and metrics, classifying each as valid, invalid, ambiguous, or requiring remeasurement.

### Metric classification

| Metric | Previously reported | Classification | Root cause | Status of the remedy |
| :--- | :--- | :--- | :--- | :--- |
| Qwen 2.5 7B Direct latency | 0.06 ms | Invalid | Measured a deterministic fallback stub, not a 7B forward pass | Fixed: real GGUF inference via llama.cpp now runs when `load_immediately=True`. Full remeasurement pending — see `REASONING_STRATEGY_EVALUATION_REPORT.md`. |
| Qwen 2.5 7B CoT latency | 0.05 ms | Invalid | Same stub | Same as above. |
| Qwen 2.5 7B AoT latency | 0.15 ms | Invalid | Same stub, multi-step loop overhead only | Same as above. |
| SDK enqueue capacity | 5,396,828 spans/sec | Valid, qualified | Real `deque.append()` throughput under a synthetic loop | Retained, labeled explicitly as synthetic in-memory buffer capacity, not network throughput. |
| SDK node wrapper overhead (P50) | 0.005 ms | Valid | Real decorator execution overhead | Retained. |
| MiniLM embedding latency (P50) | 15.13 ms | Valid | Real PyTorch CPU forward pass, `all-MiniLM-L6-v2` | Retained. |
| DeBERTa NLI latency (P50) | 88.51 ms | Valid | Real PyTorch CPU cross-encoder forward pass, `nli-deberta-v3-small` | Retained. |
| Cascade evaluation latency (P50) | 89.45 ms | Valid | Combined two-stage triage and NLI time | Retained. |
| Baseline D vs AgentPulse recall | D: 0.60, AgentPulse: 0.20 | Ambiguous, required remeasurement | Two compounding bugs: an overly aggressive semantic gate, and an overly conservative alert threshold | Fixed and remeasured. Current ablation (`THRESHOLD_ANALYSIS.md`) shows both at recall 1.0, with the remaining tradeoff in precision, not recall. |
| Compounding-error propagation | Single mitigated run only | Required remeasurement | No unmitigated control condition existed | Fixed: `experiments/compounding_error.py` now runs both a control and an intervention condition. See `PROJECT_REPORT.md` Section 6. |
| 9-scenario drift detection | 100% detected at span 1 | Ambiguous, required remeasurement | Only large step shifts were tested, with no negative controls | Fixed: `DRIFT_EXPERIMENT_REPORT.md` adds 10/25/50% graded shifts and three negative controls. |
| Label agreement | kappa = 1.00 | Ambiguous, small sample; also mislabeled | Computed over 8 cases with identical evaluator guidelines, and the annotators were described as "AI systems evaluators," not independent humans, despite the report's original title | Documented explicitly and relabeled honestly in `LABEL_AGREEMENT_REPORT.md` (renamed from `HUMAN_ANNOTATION_REPORT.md`); the dataset expanded to 50 dual-evaluated cases (kappa = 0.922, via two LLM-as-judge passes, not human review) plus 23 deterministically-constructed cases kept separate from that figure. |
| Zero false-positive claim | "0.0% false positive rate" | Ambiguous, overclaim | True for an 8-case sample, described as universally eliminating alert fatigue | Reframed to "no false positives were observed in the evaluated sample" everywhere in this repository. |

### Root-cause detail

#### The sub-millisecond latency numbers

`llm_adapters/local_hf.py` falls back to a deterministic string generator when a model isn't loaded. The original timing block measured that fallback (50-150 microseconds), not a 7-billion-parameter forward pass. The fix is a separate adapter (`llm_adapters/local_gguf.py`) that loads a real quantized model and fails loudly rather than falling back silently.

#### The Baseline D recall anomaly

Two bugs caused Baseline D (raw DeBERTa NLI) to outperform the full AgentPulse pipeline on recall:

1. The Stage-1 semantic gate treated high cosine similarity as automatic support, even when a claim shared most of its vocabulary with the premise but changed a critical negation or number. High similarity now indicates low semantic mismatch risk only — it does not bypass NLI evaluation for claims containing factual or numeric assertions.
2. The composite risk threshold for an alert was 0.85, which suppressed moderate NLI contradiction signals. Thresholds are now selected via a sweep on the development split and reported on held-out test (`experiments/ablation.py`).
