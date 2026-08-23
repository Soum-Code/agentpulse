# AgentPulse: Setup and Verification Walkthrough

## 1. What's in this repository

- `PROJECT_REPORT.md` — architecture and mathematical formulation.
- `REMEDIATION_AUDIT.md` — itemized log of fixes applied to earlier overclaims and bugs.
- `BENCHMARK_REPORT.md` — measured latency and throughput figures.
- `DETECTION_QUALITY_REPORT.md`, `DRIFT_EXPERIMENT_REPORT.md` — drift detection results.
- `THRESHOLD_ANALYSIS.md` — ablation study and threshold selection.

## 2. Backend and dashboard

The dashboard was rebuilt from an earlier decorative design into a developer-facing control plane: a health strip, agent topology graph, execution trace waterfall, a tabbed evidence inspector, an incident inbox, a replay debugger, a drift timeline, a quality-vs-operations scatter view, and a telemetry test bench.

Screenshots and a recorded demo aren't included in this repository — a prior version of this document linked to images on a different machine's local cache, which don't exist here. To see the dashboard, run it locally:

```bash
cd backend && uvicorn app.main:app --reload
cd dashboard && npm install && npm run dev
```

Then open `http://localhost:5173`.

## 3. Fixes applied (see `REMEDIATION_AUDIT.md` for the full list)

- Separated in-memory queue capacity (5.39M spans/sec, synthetic) from persistence and model inference latencies.
- Replaced "zero latency" language with measured overhead figures (0.005 ms P50 for the SDK decorator).
- Defined a 3-class NLI grounding taxonomy: `GROUNDING_CONTRADICTION`, `INSUFFICIENT_SUPPORT`, `UNSUPPORTED_CLAIM`.
- Separated baseline concepts explicitly: reference baseline, current window, live smoothed signal. Added cold-start protection, `freeze_baseline()`, and `reset_baseline()`.
- Measured real CPU inference latency: MiniLM P50 = 15.13 ms (P95 = 18.50 ms), DeBERTa NLI P50 = 88.51 ms (P95 = 140.48 ms), full cascade P50 = 122.33 ms (P95 = 172.17 ms).

## 4. Running the tests

```bash
pytest tests/ -v
```

At the time this document was last updated, this ran 99 tests, all passing, in under 5 seconds. Run it yourself to confirm current status — this number changes as tests are added.

## 5. Verification checklist

- [x] `pytest tests/ -v` passes cleanly.
- [x] Benchmarks in `BENCHMARK_REPORT.md` are separated into throughput, decorator overhead, and model inference categories.
- [x] Drift results are recorded with graded shifts and negative controls in `DRIFT_EXPERIMENT_REPORT.md`.
- [x] Dashboard builds and runs locally against the backend.
- [ ] Reasoning-strategy results in `REASONING_STRATEGY_EVALUATION_REPORT.md` reflect real model inference — confirm the timestamp and `real_inference: true` field in `experiments/results/reasoning_strategy_results.json` before citing this report; it's still being regenerated as of this writing.
