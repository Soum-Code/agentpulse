# AgentPulse Benchmark Report

**Hardware:** Windows 11, AMD64, 16 logical CPU cores, no GPU.
**Python:** 3.13.7
**Source:** `benchmarks/run_benchmarks.py`, `benchmarks/benchmark_results.json`

## 1. Throughput

| Metric | Value | What it measures |
| :--- | :--- | :--- |
| SDK enqueue capacity | 5,396,828.8 spans/sec | In-memory deque append rate under a synthetic loop. This is not network or persistence throughput. |
| HTTP ingestion | non-blocking background worker | Batches spans over HTTP; not separately benchmarked here. |
| Database persistence | SQLite WAL | Single-node transaction flush; not separately benchmarked here. |

## 2. Latency percentiles

| Component | P50 (ms) | P95 (ms) | P99 (ms) | Model / mode |
| :--- | :---: | :---: | :---: | :--- |
| SDK wrapper overhead | 0.005 | 0.009 | 0.012 | Decorator dispatch, in-process |
| MiniLM embedding inference | 15.13 | 18.50 | 20.18 | `all-MiniLM-L6-v2`, ~128 tokens, CPU |
| DeBERTa NLI inference | 88.51 | 140.48 | 186.52 | `nli-deberta-v3-small`, ~256 tokens, CPU |
| Full evaluator cascade | 122.33 | 172.17 | 192.68 | Grounding + tool + disagreement, background task |

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
