# Empirical Audit and Measurement Methodology

**Date:** August 19, 2026 (findings), updated August 23, 2026 (remedy status).
**Purpose:** Independent audit of previously reported benchmarks and metrics, classifying each as valid, invalid, ambiguous, or requiring remeasurement.

## 1. Metric classification

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

## 2. Root-cause detail

### 2.1 The sub-millisecond latency numbers

`llm_adapters/local_hf.py` falls back to a deterministic string generator when a model isn't loaded. The original timing block measured that fallback (50-150 microseconds), not a 7-billion-parameter forward pass. The fix is a separate adapter (`llm_adapters/local_gguf.py`) that loads a real quantized model and fails loudly rather than falling back silently.

### 2.2 The Baseline D recall anomaly

Two bugs caused Baseline D (raw DeBERTa NLI) to outperform the full AgentPulse pipeline on recall:

1. The Stage-1 semantic gate treated high cosine similarity as automatic support, even when a claim shared most of its vocabulary with the premise but changed a critical negation or number. High similarity now indicates low semantic mismatch risk only — it does not bypass NLI evaluation for claims containing factual or numeric assertions.
2. The composite risk threshold for an alert was 0.85, which suppressed moderate NLI contradiction signals. Thresholds are now selected via a sweep on the development split and reported on held-out test (`experiments/ablation.py`).
