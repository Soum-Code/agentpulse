# AgentPulse Detection Quality Report

**Date:** 2026-08-18 16:16:01 UTC  
**Evaluation Standard:** Labelled Multi-Agent Telemetry Benchmark Set  
**Threshold Configuration:** `threshold_version: v1.0` (Grounding Threshold = `0.85`)

---

## 1. Multi-Condition Drift Experimentation Matrix

| Scenario Name | Drift Type | Magnitude | Detection Status | Time-To-Detect (Spans) | Final ASI | Final Centroid Dist |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **No Drift (Stationary)** | `stationary` | 0.0 | ⚪ Normal / Ignored | N/A | 100.0/100 | 0.0 |
| **Small Sudden Drift** | `sudden` | 0.25 | ✅ Detected | 1 | 97.4/100 | 0.076 |
| **Moderate Sudden Drift** | `sudden` | 0.45 | ✅ Detected | 1 | 97.4/100 | 0.076 |
| **Large Sudden Drift** | `sudden` | 0.85 | ✅ Detected | 1 | 97.4/100 | 0.076 |
| **Gradual Drift** | `gradual` | 0.6 | ✅ Detected | 18 | 91.3/100 | 0.249 |
| **Tool-Use Distribution Drift** | `tool_entropy` | 0.5 | ✅ Detected | 1 | 82.4/100 | 0.076 |
| **Error-Rate Surge Drift** | `error_rate` | 0.7 | ✅ Detected | 1 | 97.4/100 | 0.076 |
| **Quality Regression Drift** | `quality` | 0.65 | ✅ Detected | 1 | 97.4/100 | 0.076 |
| **Legitimate Domain Expansion** | `domain_shift` | 0.3 | ✅ Detected | 1 | 94.9/100 | 0.145 |

---

## 2. Detection Taxonomy Breakdown

1. **`CLAIM_CONSISTENCY_FAILURE`:** Deterministically validated when tool arguments, execution records, or numeric counts do not match output claims.
2. **`GROUNDING_CONTRADICTION`:** DeBERTa NLI outputs high contradiction probability ($p_{\text{contra}} > 0.60$).
3. **`INSUFFICIENT_SUPPORT / UNSUPPORTED_CLAIM`:** DeBERTa NLI outputs high neutral probability ($p_{\text{neut}} > 0.60$) or low entailment support.
4. **`AGENT_DISAGREEMENT`:** Cross-agent logical contradiction detected between sequential agents in the same trace.
5. **`DRIFT_EVENT`:** Centroid distance, tool entropy, or error rate exceeds the reference baseline tolerance.
