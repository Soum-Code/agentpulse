# AGENTPULSE EMPIRICAL AUDIT & MEASUREMENT METHODOLOGY REPORT

**Audit Date:** 2026-08-19  
**Status:** COMPLETE AUDIT OF PREVIOUS BENCHMARKS & REPORTED METRICS  

---

## 1. Metric Classification & Audit Matrix

| Metric / Reported Item | Previous Reported Value | Audit Classification | Root Cause / Analysis | Action Required |
| :--- | :---: | :---: | :--- | :--- |
| **Qwen 2.5 7B Direct Strategy Latency** | `0.06 ms` | **INVALID** | Measured fast deterministic fallback stub rather than full PyTorch 7B model generation on CPU. | Remeasure using dedicated inference timer on PyTorch forward pass & token generation. |
| **Qwen 2.5 7B CoT Strategy Latency** | `0.05 ms` | **INVALID** | Measured deterministic fallback string generation. | Remeasure actual token generation latency and throughput (tokens/sec). |
| **Qwen 2.5 7B AoT Strategy Latency** | `0.15 ms` | **INVALID** | Measured multi-step python loop overhead of fallback stub. | Remeasure actual atomic decomposition & multi-pass generation latency. |
| **SDK Enqueue Capacity** | `5,396,828 spans/sec` | **VALID (Qualified)** | Measures in-memory python `deque.append()` throughput under synthetic loop. | Retain but clearly qualify as synthetic in-memory buffer capacity, not network throughput. |
| **SDK Node Wrapper Overhead (P50)** | `0.005 ms` | **VALID** | Accurate measurement of python decorator execution overhead. | Retain with P50, P95, P99 distribution metrics. |
| **MiniLM Embedding Latency (P50)** | `15.13 ms` | **VALID** | Real PyTorch CPU forward pass latency for `all-MiniLM-L6-v2`. | Retain and report P50, P95, P99, and standard deviation. |
| **DeBERTa NLI Latency (P50)** | `88.51 ms` | **VALID** | Real PyTorch CPU cross-encoder forward pass for `nli-deberta-v3-small`. | Retain and report P50, P95, P99, and standard deviation. |
| **Cascade Evaluation Latency (P50)** | `89.45 ms` | **VALID** | Combined two-stage triage and NLI inference time on CPU. | Retain with full latency breakdown. |
| **Baseline D vs AgentPulse Recall** | Baseline D: `0.60` / AgentPulse: `0.20` | **AMBIGUOUS / REQUIRES_REMEASUREMENT** | Stage-1 semantic gate short-circuited NLI evaluation on high similarity, and prototype composite risk threshold (0.85) was overly conservative. | Fix Stage-1 semantic gate and re-calibrate risk aggregation weights using ablation study. |
| **Compounding Error Propagation** | Single mitigated run | **REQUIRES_REMEASUREMENT** | Only tested with Verifier active; did not compare against unmitigated control condition. | Implement Condition A (No Verifier) vs Condition B (With Verifier) to measure true propagation delta. |
| **9-Scenario Drift Detection** | 100% detected at span 1 | **AMBIGUOUS / REQUIRES_REMEASUREMENT** | Large artificial step shifts ($0.30 - 0.75$) were tested without testing subtle shifts (10%, 25%) or negative controls (legitimate changes). | Add 10%, 25%, 50% shift levels and negative controls (valid phrasing changes). |
| **Human Annotation Agreement** | $\kappa = 1.00$ | **AMBIGUOUS (Small Sample)** | Calculated over small 8-case test set where annotators had identical guidelines. | Document sample size limitation explicitly and expand dataset cases. |
| **Zero-FPR Claim** | `0.0% False Positive Rate` | **AMBIGUOUS (Overclaim)** | True for the 8-case test sample, but framed as universal "eliminates alert fatigue". | Reframe accurately to: "No false positives were observed in the evaluated sample." |

---

## 2. Detailed Root-Cause Analyses

### 2.1 The 0.05–0.15 ms Latency Issue
In `llm_adapters/local_hf.py`, when HuggingFace transformer weights were not loaded in the lightweight development environment, the adapter executed a deterministic fallback generator. The timing block measured this fallback string construction ($50\text{--}150\mu\text{s}$) instead of a full 7-billion parameter neural network forward pass.
*Remedy:* We isolate and report **13 separate latency layers**, measuring actual CPU/GPU inference time, prefill time, and generation tokens/sec explicitly.

### 2.2 The Baseline D Recall Anomaly
In the previous baseline comparison, Baseline D (raw DeBERTa NLI cross-encoder) had a recall of `0.60`, while Full AgentPulse had `0.20`. 
*Investigation:* Two compounding bugs caused this:
1. **Overly aggressive Stage-1 Semantic Gate:** If an ungrounded claim contained high keyword overlap with the premise (e.g. sharing 80% vocabulary but changing a critical negation or quantity), cosine similarity exceeded $0.85$, causing the evaluator to prematurely classify the span as supported without passing it to DeBERTa NLI!
2. **Overly conservative alert threshold:** Full composite risk required $R \ge 0.85$ to declare an alert, suppressing moderate NLI contradiction signals.
*Remedy:* (1) High semantic similarity now indicates *low semantic mismatch*, not automatic factual entailment. Any sentence with factual/numeric claims undergoes NLI evaluation. (2) Thresholds are systematically tuned via `experiments/ablation.py`.
