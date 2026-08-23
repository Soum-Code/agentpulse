# Reasoning Strategy Evaluation Report

**Date:** 2026-08-23 10:43:48 UTC
**Evaluated Model:** `Qwen/Qwen3-8B-GGUF:Q4_K_M` (adapter: `Qwen3GGUFAdapter`, quantization: `Q4_K_M`)
**Inference:** Real local model inference via llama.cpp. CPU-only benchmark.
**Hardware:** Windows-11-10.0.26200-SP0, 16 logical cores, no GPU.
**Dataset:** `v1.0_test` (2 cases, 2 stochastic runs per case, max_tokens=120 per call)
**Warm-up:** one generation run before measurement, excluded from all figures below (4996 ms).

---

## 1. Strategy Performance Summary

Latency is per reasoning-strategy execution (which may involve more than one model
call, e.g. AoT), measured around the strategy call only.

| Reasoning Strategy | Mean Latency (ms) | Median (ms) | Std Dev (ms) | Mean Tokens In | Mean Tokens Out | Mean Grounding Risk | Risk Std Dev | Contradiction Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| DIRECT (Zero-Shot) | 16040.1 | 16040.1 | 7592.5 | 61.0 | 59.0 | 0.001 | 0.000 | 0.000 |
| COT (Chain-of-Thought) | 33037.4 | 33037.4 | 97.5 | 96.0 | 120.0 | 0.515 | 0.642 | 0.000 |
| AOT (Atom of Thoughts) | 95918.5 | 95918.5 | 60094.8 | 608.5 | 319.0 | 0.001 | 0.000 | 0.000 |

---

## 2. Observations (derived from the table above, not pre-assumed)

1. **Latency:** DIRECT was fastest at 16040.1 ms mean per execution.
2. **Token cost:** AOT produced the most output tokens (319.0 mean), i.e. the highest generation cost per case.
3. **Grounding risk:** **INCONCLUSIVE on grounding risk.** The spread between strategy means (0.514) is smaller than the largest within-strategy run-to-run standard deviation (0.642), so no strategy can be declared better on grounding risk from this sample.

## 3. Limitations

- Single model (Qwen/Qwen3-8B-GGUF:Q4_K_M); results are not claimed to generalize to other models or sizes.
- 2 evaluation cases x 2 runs per case &mdash; a small sample. Treat differences near the reported standard deviations as inconclusive.
- Quantized (Q4_K_M) CPU inference; absolute latencies are hardware- and quantization-specific and are not comparable to GPU or full-precision figures.
- Grounding risk is AgentPulse's own evaluator score, not human-verified ground truth for these generations.

*Data source:* `experiments/results/reasoning_strategy_results.json`
