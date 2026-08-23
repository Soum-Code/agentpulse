# AgentPulse Detection Quality Report

**Date:** August 18, 2026
**Threshold configuration:** `threshold_version: v1.0`, grounding threshold 0.85 (early prototype value; see `THRESHOLD_ANALYSIS.md` for the current sweep).

## 1. Early drift experiment (superseded)

This was the first drift experiment, using large, unrealistic step shifts and no negative controls. `DRIFT_EXPERIMENT_REPORT.md` replaces it with graded shifts (10/25/50%) and three negative controls, and is the current reference. Kept here as a historical record.

| Scenario | Type | Magnitude | Detected | Time to detect | Final ASI | Centroid distance |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| No drift | stationary | 0.0 | No (correctly ignored) | — | 100.0 | 0.0 |
| Small sudden drift | sudden | 0.25 | Yes | 1 | 97.4 | 0.076 |
| Moderate sudden drift | sudden | 0.45 | Yes | 1 | 97.4 | 0.076 |
| Large sudden drift | sudden | 0.85 | Yes | 1 | 97.4 | 0.076 |
| Gradual drift | gradual | 0.6 | Yes | 18 | 91.3 | 0.249 |
| Tool-use distribution drift | tool_entropy | 0.5 | Yes | 1 | 82.4 | 0.076 |
| Error-rate surge | error_rate | 0.7 | Yes | 1 | 97.4 | 0.076 |
| Quality regression | quality | 0.65 | Yes | 1 | 97.4 | 0.076 |
| Legitimate domain expansion | domain_shift | 0.3 | Yes | 1 | 94.9 | 0.145 |

Every scenario here — including the legitimate domain expansion, which should arguably not have alerted — was detected within 1 span. That uniformity across very different shift magnitudes was the reason a more graded experiment with negative controls was run afterward.

## 2. Detection taxonomy

- `CLAIM_CONSISTENCY_FAILURE`: tool arguments, execution records, or numeric counts don't match the claimed output.
- `GROUNDING_CONTRADICTION`: DeBERTa NLI contradiction probability exceeds 0.60.
- `INSUFFICIENT_SUPPORT` / `UNSUPPORTED_CLAIM`: DeBERTa NLI neutral probability exceeds 0.60, or entailment support is low.
- `AGENT_DISAGREEMENT`: a logical contradiction detected between sequential agents in the same trace.
- `DRIFT_EVENT`: centroid distance, tool entropy, or error rate exceeds the baseline tolerance.
