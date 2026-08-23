# Current Real Validation Audit

**Date:** August 18, 2026, with status updates from later sessions noted inline.
**Purpose:** Classify each component of the repository by evidence type, before running real-model and reasoning-strategy validation.
**Classification key:** Implemented, Tested, Measured, Partially implemented, Proposed, Unsupported, Unknown.

## Component audit

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
