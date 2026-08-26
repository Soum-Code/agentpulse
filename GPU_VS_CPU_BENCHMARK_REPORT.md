# GPU vs. CPU Reasoning Strategy Benchmark Report

**Compiled:** 2026-08-26
**Runs compared:** Qwen3-8B (CPU, 2026-08-23) vs. Llama 3.1 8B (Kaggle GPU, 2026-08-24)
**Dataset:** `v1.0_test` (30 cases, 5 stochastic runs per case, 3 strategies: Direct / CoT / AoT, `max_tokens=200` per call) — identical for both runs.

| | Qwen3-8B | Llama 3.1 8B |
| :--- | :--- | :--- |
| Model ID | `Qwen/Qwen3-8B-GGUF:Q4_K_M` | `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M` |
| Adapter | `Qwen3GGUFAdapter` | `LlamaGGUFAdapter` |
| Hardware | Windows, 16 logical cores, **no GPU** | Kaggle, **Tesla P100-PCIE-16GB**, full GPU offload |
| Real inference confirmed | `real_inference: true` | `real_inference: true`, plus fail-loud `evaluation_models_confirmed_loaded` (NLI model/tokenizer, embedding model) all `true` |

**This is a hardware *and* model comparison, not a controlled ablation** — the GPU run also uses a
different model family, so no individual variable (CPU-vs-GPU, or Qwen-vs-Llama) is isolated here.
Read the numbers below as "this model on this hardware", not as a clean ablation.

---

## 1. Side-by-side strategy performance

| Model | Strategy | Mean latency (ms) | Mean tokens out | Tokens/sec | Mean grounding risk | Contradiction rate |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| Qwen3-8B (CPU) | DIRECT | 11564.1 | 37.5 | 3.243 | 0.424 | 0.133 |
| Qwen3-8B (CPU) | COT | 45422.7 | 186.4 | 4.104 | 0.283 | 0.127 |
| Qwen3-8B (CPU) | AOT | 85215.2 | 319.7 | 3.752 | 0.233 | 0.000 |
| Llama 3.1 8B (GPU) | DIRECT | 19496.8 | 59.0 | 3.026 | 0.328 | 0.060 |
| Llama 3.1 8B (GPU) | COT | 60329.4 | 185.7 | 3.078 | 0.228 | 0.140 |
| Llama 3.1 8B (GPU) | AOT | 171884.0 | 383.0 | 2.228 | 0.213 | 0.067 |

Tokens/sec = mean tokens out ÷ mean latency, used instead of raw latency alone since the two runs
don't produce the same number of output tokens per strategy.

---

## 2. Observations (derived from the table above, not pre-assumed)

1. **Llama on GPU is slower than Qwen on CPU, on every strategy, on both raw latency and tokens/sec.**
   E.g. DIRECT: 3.243 tok/s (Qwen/CPU) vs. 3.026 tok/s (Llama/GPU); AOT: 3.752 vs. 2.228 tok/s — the
   GPU run is the slower one throughout. This is the same surprising direction seen in an earlier,
   *discarded* Qwen3 GPU attempt (see `PROJECT_REPORT.md` Section 4) — but that attempt was thrown
   out because its grounding-risk output was invalid (flat zeros from a silently broken evaluation
   pipeline). This Llama run passed the fail-loud model-load assertion and produced varied,
   non-zero risk scores across the full range, so it isn't a repeat of that failure. It reads as a
   genuine property of this specific Kaggle P100 / llama.cpp / Llama-3.1-GGUF setup rather than a
   broken run. The underlying cause (GPU offload efficiency, build/quantization differences,
   something else) is not diagnosed further here.
2. **Grounding-risk ordering is consistent across both models**: DIRECT highest risk, COT middle,
   AOT lowest, for both Qwen (0.424 / 0.283 / 0.233) and Llama (0.328 / 0.228 / 0.213). This is a
   plausible cross-model consistency signal — not proof of anything, since no significance test was
   run across models and each model's own within-strategy spread (see the individual reports) is
   large enough that within-model differences were already found inconclusive for Qwen.
3. **Contradiction rate does not follow the same pattern across models.** For Qwen, AOT had zero
   contradictions (0.133 / 0.127 / 0.000 for DIRECT/COT/AOT). For Llama, COT had the *highest*
   contradiction rate, not AOT (0.060 / 0.140 / 0.067). This did not replicate and is reported as-is.

---

## 3. Limitations

- Not a controlled ablation: hardware (CPU vs. GPU) and model (Qwen3-8B vs. Llama 3.1 8B) both
  differ simultaneously between the two runs, so neither variable can be isolated from this data.
- Small sample per model: 30 cases x 5 runs. Within-model differences smaller than the
  within-strategy standard deviations reported in each model's own evaluation report should be
  treated as inconclusive (this was already the case for Qwen's grounding-risk comparison).
- No cross-model statistical significance test was run; the risk-ordering consistency in
  Observation 2 is a first-look pattern, not a validated finding.
- Absolute latencies are hardware- and quantization-specific (Q4_K_M for both, but different
  models/builds) and should not be read as general "CPU is faster than GPU" claims beyond this
  specific setup.

*Data sources:* `experiments/results/reasoning_strategy_results.json` (Qwen3-8B, CPU),
`experiments/results/reasoning_strategy_results_llama_gpu.json` (Llama 3.1 8B, Kaggle GPU).
Per-model detail and additional metrics: `REASONING_STRATEGY_EVALUATION_REPORT.md` (Qwen3-8B).
