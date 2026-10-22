# AgentPulse Benchmark Report

**Hardware:** Windows 11, AMD64, 16 logical CPU cores, no GPU.
**Python:** 3.13.7
**Source:** `benchmarks/run_benchmarks.py`, `benchmarks/benchmark_results.json`
**Run:** one run, 2026-08-18 16:16 UTC, PyTorch inference (`load_models(use_onnx=False)`), not the ONNX backend the worker uses.

## 1. Throughput

| Metric | Value | What it measures |
| :--- | :--- | :--- |
| SDK enqueue capacity | 5,396,828.8 spans/sec | In-memory deque append rate under a synthetic loop. This is not network or persistence throughput. |
| HTTP ingestion | non-blocking background worker | Batches spans over HTTP; not benchmarked here, and no HTTP ingestion latency has been measured on its own. Layer `8_http_ingestion_overhead` (0.981 ms) in `experiments/results/latency_profiles.json` is a random number from `experiments/latency_profiler.py`, not a measurement. The only measured ingest path is the end-to-end submit time in `experiments/results/throughput_benchmark.json` (2026-08-27). |
| Database persistence | SQLite WAL | Single-node transaction flush; not separately benchmarked here. |

## 2. Latency percentiles

| Component | P50 (ms) | P95 (ms) | P99 (ms) | Model / mode |
| :--- | :---: | :---: | :---: | :--- |
| SDK wrapper overhead | 0.005 | 0.009 | 0.012 | Decorator dispatch, in-process; 2,000 calls |
| MiniLM embedding inference | 15.13 | 18.50 | 20.18 | `all-MiniLM-L6-v2`, one 10-word sentence, CPU; 100 calls |
| DeBERTa NLI inference | 88.51 | 140.48 | 186.52 | `nli-deberta-v3-small`, one pair of 15 and 11 words, CPU; 50 calls |
| Full evaluator cascade | 122.33 | 172.17 | 192.68 | `EvaluationPipeline.evaluate_span` called directly (not as a background task): grounding, tool-claim, drift and risk for every case, disagreement for 1 of the 9. **9 calls, one per case, so P95 and P99 are interpolations between the two slowest runs.** |

### Later runs of the same measurement

The table above is the 2026-08-18 run and is not the most recent grounding-latency measurement. The 30-case ablation of 2026-09-18 (`experiments/results/ablation_results.json`, same PyTorch path, one run) measured 19.1 ms for MiniLM, 132.09 ms for DeBERTa and 151.19 ms for the two together, and 165.18 ms for the full pipeline, all per-case means; the 2026-08-23 run of that script had measured 27.83 / 188.07 / 215.9 ms. The figures differ between runs and the cause of the difference was not identified.

## 3. Threshold sweep on the development split (early version, superseded)

This sweep predates the dev/test-separated ablation in `THRESHOLD_ANALYSIS.md`, which is the current reference for threshold selection. It's kept here as a historical record.

| Threshold | Precision | Recall | F1 | FPR | FNR |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 0.70 | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| 0.75 | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| 0.80 | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| 0.85 (selected at the time) | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| 0.90 | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |

Every threshold in this sweep produced identical metrics — on the small sample used here, the sweep did not discriminate between thresholds. See `THRESHOLD_ANALYSIS.md` for the current sweep, run on a larger split with the operating point selected on dev and reported on held-out test.
