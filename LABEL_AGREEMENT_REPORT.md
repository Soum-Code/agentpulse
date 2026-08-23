# Label Agreement Report

**Date:** August 18, 2026
**Scope:** `v1.0_dev`, `v1.0_val`, `v1.0_test` — the original 50 cases in these splits (a further 23 cases were added later by deterministic construction and are not covered here; see Section 5).

**What this measures:** ground truth labels for these 50 cases were produced by two independent evaluation passes, each reviewing the agent output, the retrieved context, the tool execution records, and the AgentPulse evaluator's own NLI output, then assigning one of three labels under a fixed protocol. The two passes were both LLM-based evaluation, not independent human review. This report should not be read as human-verified ground truth — the label is "agreement between two independent automated evaluation passes under an explicit taxonomy," which is a real and useful signal for prototype threshold calibration, but a weaker one than human expert annotation would be.

## 1. Labeling protocol

Each case was reviewed against:
1. The agent's final output text.
2. The retrieved context or input premise.
3. The tool execution record — arguments, result counts, status.
4. AgentPulse's own DeBERTa NLI output (3-class probabilities) and similarity score.

Classification taxonomy:
- `SUPPORTED`: the claim is entailed by the evidence.
- `UNSUPPORTED`: the claim isn't directly contradicted, but lacks premise support (neutral probability above 0.60, or insufficient context).
- `CONTRADICTED`: the claim conflicts with the evidence or tool records (contradiction probability above 0.60, or a tool-count discrepancy).

## 2. Inter-evaluator agreement (Cohen's kappa)

$$\kappa = \frac{p_o - p_e}{1 - p_e}$$

| Split | Cases | Observed agreement | Expected chance agreement | Kappa |
| :--- | :---: | :---: | :---: | :---: |
| v1.0_dev | 15 | 0.933 | 0.48 | 0.871 |
| v1.0_val | 15 | 0.933 | 0.48 | 0.871 |
| v1.0_test | 20 | 1.000 | 0.50 | 1.000 |
| Overall | 50 | 0.960 | 0.49 | 0.922 |

## 3. Dataset distribution by domain and failure mode (50 cases)

| Domain | Supported | Contradicted / grounding failure | Tool count discrepancy | Tool failure misclaim | Total |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Research | 10 | 6 | 0 | 0 | 16 |
| Technical support | 8 | 0 | 6 | 2 | 16 |
| Data analysis | 9 | 0 | 7 | 0 | 16 |
| Platform ops | 2 | 0 | 0 | 0 | 2 |
| Total | 29 | 6 | 13 | 2 | 50 |

## 4. Qualifications

High agreement (kappa = 0.922) followed from a protocol that separated verifiable factual claims (numbers, citations, tool outputs) from subjective stylistic variance — it does not by itself establish that the taxonomy generalizes to harder, more ambiguous cases. 50 cases is enough for prototype threshold calibration and regression checks, but production drift monitoring needs ongoing evaluation on live traffic, and a genuinely human-reviewed subset would be a stronger basis for any claim beyond internal prototype calibration.

## 5. The later 23 added cases are not covered by this report

A further 23 cases were added afterward (`scripts/expand_dataset.py`), bringing the three splits to 21/22/30 (73 total). Their ground truth is correct by construction, not by evaluator judgment — a `SUPPORTED` case restates the evidence with nothing added, a `TOOL_COUNT_MISMATCH` case claims a count that differs from the actual tool record, and so on. There is no agreement statistic to report for that batch because there was no judgment call involved. Don't pool it with the kappa figures above, and don't describe the 73-case combined dataset as "50 evaluated cases" or "73 evaluated cases" without noting the split between the two construction methods.
