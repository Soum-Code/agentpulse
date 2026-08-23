# AgentPulse: Current State Audit (Phase 0)

**Date:** August 18, 2026
**Scope:** Pre-implementation audit of the codebase against the master engineering requirements, before the work described in later reports in this repository.

## 1. Classification key

- `VERIFIED` — proven by automated end-to-end tests or live execution logs.
- `IMPLEMENTED` — code is written and present.
- `TESTED` — covered by automated unit or service tests.
- `MEASURED` — recorded from an actual benchmark run.
- `PROPOSED` — planned, not yet built.
- `EXPERIMENTAL` — a heuristic that has not been calibrated.
- `UNSUPPORTED` — out of scope for the MVP.
- `UNKNOWN` — untested or unmeasured behavior.

## 2. Component audit

### SDK (`sdk/src/agentpulse/`)

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

### Backend services (`backend/app/services/`)

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

### Dashboard (`dashboard/`)

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

## 3. Findings at this stage

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

## 4. Remediation plan at this stage

1. Build `sdk/src/agentpulse/integrations/base.py` and `langgraph.py` (LangChain and CrewAI stay marked PROPOSED).
2. Build the cross-agent disagreement service (`backend/app/services/disagreement.py`).
3. Add baseline freeze, reset, and versioning to `backend/app/services/drift.py`.
4. Add the missing evaluation metadata fields to `backend/app/models.py`.
5. Add resilience, auth, and integration test suites.
6. Build `benchmarks/run_benchmarks.py` to produce measured, not estimated, figures.
7. Build out the dashboard's remaining views (replay, failure radar, command palette, evidence inspector).
