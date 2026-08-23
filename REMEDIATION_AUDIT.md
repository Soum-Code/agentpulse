# Remediation Audit

**Date:** August 18, 2026, with later updates noted inline where a subsequent session changed the status.

## 1. Remediation matrix

| Item | Status | Action taken | Evidence |
| :--- | :---: | :--- | :--- |
| Overclaimed status language | Fixed | Removed absolute statements ("zero latency", "zero blocking overhead", "never blocked", "guarantee") and replaced with measured, qualified language. | `PROJECT_REPORT.md`, `README.md` |
| Spans/sec throughput claim | Fixed | Labeled as in-memory SDK enqueue capacity under a benchmark configuration, not production or end-to-end throughput. Persistence and HTTP throughput are separated into distinct categories. | `BENCHMARK_REPORT.md`, `benchmarks/run_benchmarks.py` |
| Evaluator latency discrepancies | Fixed | Separated MiniLM embedding latency, DeBERTa NLI latency, and cascade orchestration into distinct measured figures with P50/P95/P99. | `BENCHMARK_REPORT.md` |
| Trace context interoperability claim | Fixed | Replaced "standards-compliant W3C interoperability" with "application-level trace context propagation using W3C-compatible identifiers." | `PROJECT_REPORT.md`, `sdk/src/agentpulse/context.py` |
| Unsupported citation-diff / token-diff claims | Fixed | Removed from documentation and architecture descriptions — these capabilities were never built. | `PROJECT_REPORT.md`, `README.md` |
| Grounding risk semantics | Fixed | Retained the full 3-class NLI distribution and defined a clear taxonomy: `GROUNDING_CONTRADICTION`, `INSUFFICIENT_SUPPORT`, `UNSUPPORTED_CLAIM`. | `backend/app/services/grounding.py`, `evaluator.py` |
| Threshold selection on the development set | Fixed | Ran a threshold sweep (0.70-0.90) measuring precision, recall, F1, FPR, FNR, and documented the selected value with a `threshold_version`. | `benchmarks/run_benchmarks.py`, `BENCHMARK_REPORT.md` |
| Deterministic tool-claim validation | Fixed | Replaced "verified reliably" with "validated deterministically for supported structured claim patterns," and added test cases for exact match, mismatch, wrong tool, ambiguous phrasing, and paraphrase. | `backend/app/services/tool_claim.py`, `tests/test_services.py` |
| Telemetry event taxonomy | Fixed | Enforced a fixed set of event types (`EXECUTION_FAILURE`, `CLAIM_CONSISTENCY_FAILURE`, `GROUNDING_RISK`, `GROUNDING_CONTRADICTION`, `UNSUPPORTED_CLAIM`, `AGENT_DISAGREEMENT`, `DRIFT_EVENT`, `QUALITY_REGRESSION`, `LATENCY_ANOMALY`). | `PROJECT_REPORT.md`, `backend/app/services/evaluator.py` |
| Drift terminology | Fixed | Separated reference baseline, current window, and live smoothed signal explicitly, and documented cold-start protection, baseline freeze, and reset. | `backend/app/services/drift.py`, `PROJECT_REPORT.md` |
| Multi-condition drift experiments | Fixed | Ran 9 controlled scenarios (no drift, small/moderate/large sudden, gradual, tool, error, quality, domain shift). Later superseded by the graded-shift-plus-negative-control version in `DRIFT_EXPERIMENT_REPORT.md`. | `benchmarks/drift_results.json`, `DETECTION_QUALITY_REPORT.md` |
| End-to-end LangGraph validation | Fixed | Added an unmocked integration test covering the full path from `LangGraphAdapter` through the SDK, FastAPI, SQLite WAL, evaluator, and alert engine. | `tests/test_e2e_langgraph.py` |
| Local dev mode / auth configuration | Partially revisited later | `LOCAL_DEV_MODE` support was added as described. A separate, more serious bug — the auth middleware's path allowlist matched every request regardless of this setting — was found and fixed in a later session. | `backend/app/middleware.py` |
| Dashboard redesign | Fixed | Replaced the earlier UI with a developer-facing control plane: navigation and health strip, agent topology, execution trace waterfall, evidence inspector, incident inbox, replay debugger, drift timeline, and a telemetry test bench. | `dashboard/src/App.tsx` |
| Docker configuration | Partially revisited later | Compose configuration was reviewed and cleaned up as described, but had not actually been build-tested. A later session running a real `docker compose up --build` found and fixed four additional bugs (missing `README.md` in the build context, unnecessary CUDA dependencies, a malformed SQLite URL, and a Windows bind-mount incompatibility with WAL mode). | `docker-compose.yml`, `backend/Dockerfile` |
| Automated test suite | Fixed, later expanded | 68 tests passing at the time of this audit. A later session added security regression tests and reached 99 passing. | `pytest tests/ -v` |

## 2. Takeaways

In-memory queue operations are now strictly distinguished from persistence and inference latencies. Deterministic checks (tool count matching, HTTP status) are distinguished from probabilistic ones (NLI, embedding similarity). The dashboard is built as an engineering debugging tool rather than a marketing-oriented interface.
