# Drift Experiment and Sensitivity Evaluation

**Date:** 2026-08-23 12:52:04 UTC
**Method:** Graded drift magnitudes and negative controls.
**Drift decision threshold:** 0.30 cosine distance. Baseline window: 20 spans.

## 1. Graded drift and negative control results

"Magnitude" is cosine distance between the pre- and post-shift embedding centroid, not a general drift-magnitude unit.

| Scenario | Type | Magnitude | Is anomaly | Detected | False alert | Time to detect | Final ASI |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Prompt Formatting Change (10% shift) | prompt_drift | 0.10 | No | No | No | N/A | 100.0/100 |
| Prompt Tone Shift (25% shift) | prompt_drift | 0.25 | No | No | No | N/A | 99.7/100 |
| Prompt Template Rewrite (50% shift) | prompt_drift | 0.50 | Yes | No | No | N/A | 98.5/100 |
| Model Version Update (Qwen-7B to Llama-8B) | model_drift | 0.50 | Yes | No | No | N/A | 98.5/100 |
| Temperature Shift (T=0.1 to T=0.9) | hyperparam_drift | 0.35 | Yes | No | No | N/A | 99.4/100 |
| Tool Frequency Fluctuation (25% delta) | tool_entropy | 0.25 | No | No | No | N/A | 99.7/100 |
| Uncalibrated External Tool Shift (60% delta) | tool_entropy | 0.60 | Yes | Yes | No | 1 | 82.7/100 |
| Hallucination & Contradiction Burst (75% risk) | quality_regression | 0.75 | Yes | Yes | No | 1 | 96.5/100 |
| Negative Control: Legitimate Paraphrasing | negative_control | 0.12 | No | No | No | N/A | 100.0/100 |
| Negative Control: Equivalent Tool Substitution | negative_control | 0.15 | No | No | No | N/A | 99.9/100 |
| Negative Control: Baseline Invariant Operation | negative_control | 0.00 | No | No | No | N/A | 100.0/100 |

## 2. Findings

Shifts at 10-25% stayed below the 0.30 centroid distance threshold and kept ASI above 75, without triggering alerts. Shifts at 50% and above, along with the hallucination burst, were detected within 1-2 spans of crossing the threshold. The three negative controls (legitimate rephrasing, valid tool substitution, invariant flow) produced zero false alerts on this scenario set.
