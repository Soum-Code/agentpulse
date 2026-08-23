# Real-Model Benchmark and Performance Profile

**History:** an earlier version of this report contained a "13-layer latency profile" and a "multi-model reasoning strategy matrix" comparing Qwen and Llama that were not measurements — `experiments/run_experiment.py` wrote them as fixed strings, and `get_llm_adapter` was never called with `load_immediately=True` anywhere in the codebase, so no model weights were ever loaded to produce those numbers. Confirmed directly: a grep for `load_immediately=True` across the repository returned zero matches before the fix below.

**Fix:** `llm_adapters/local_gguf.py` loads a real quantized model (`Qwen/Qwen3-8B-GGUF`, Q4_K_M, via llama.cpp) and measures actual generation latency and token counts, failing loudly instead of silently substituting fake data if loading fails.

## Measured hardware and throughput

- Hardware: 16 logical / 8 physical CPU cores, no GPU.
- Sustained generation throughput: 4.3 tokens/sec (measured with a calibration prompt, distinct from the per-call numbers below which include prompt processing and evaluator overhead).

## Full reasoning-strategy benchmark (real inference)

30 test cases x 5 stochastic runs x 3 strategies (Direct/CoT/AoT), `max_tokens=200` per call. Full table and the derived (not assumed) observations are in `REASONING_STRATEGY_EVALUATION_REPORT.md` and `PROJECT_REPORT.md` Section 4 — summary:

| Strategy | Mean latency (ms) | Mean tokens out | Mean grounding risk |
| :--- | :---: | :---: | :---: |
| DIRECT | 11564.1 | 37.5 | 0.424 |
| COT | 45422.7 | 186.4 | 0.283 |
| AOT | 85215.2 | 319.7 | 0.233 |

The apparent downward trend in grounding risk (DIRECT to AOT) is **not** reported as a finding — the spread between strategy means is smaller than the largest within-strategy run-to-run standard deviation, so it's within noise on this sample. What is a real, measured difference: AOT costs ~8.5x DIRECT's output tokens for a risk difference that isn't statistically distinguishable here.

## Limitations

- Single model (`Qwen/Qwen3-8B-GGUF:Q4_K_M`). No second model (Llama, Mistral) has been benchmarked with real inference — any claim of cross-model generalization is not supported by this report.
- CPU-only, quantized (Q4_K_M) inference. Absolute latencies are hardware- and quantization-specific and are not comparable to GPU or full-precision figures.
- 30 cases x 5 runs is a small sample; treat differences near the reported standard deviations as inconclusive rather than as findings.
