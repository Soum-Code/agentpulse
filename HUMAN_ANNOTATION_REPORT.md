# Human Annotation & Ground Truth Evaluation Report

**Date:** August 18, 2026  
**Evaluation Standard:** Labelled Multi-Agent Evaluation Subsets (`v1.0_dev`, `v1.0_val`, `v1.0_test`)  
**Annotators:** 2 Independent Expert AI Systems Evaluators  

---

## 1. Annotation Protocol & Labeling Guidelines

To establish reliable ground truth without relying on model-as-a-judge heuristics, each trace was reviewed by two independent annotators who evaluated:
1. **Agent Output:** The final synthesized text produced by the agent.
2. **Context & Evidence:** Raw retrieved document chunks and input premise.
3. **Tool Trace:** Actual tool execution records, argument dictionaries, result counts, and status codes.
4. **AgentPulse Evaluator Output:** DeBERTa NLI 3-class probabilities and similarity scores.

### Classification Taxonomy:
- **`SUPPORTED`:** Claim is logically entailed by the provided evidence.
- **`UNSUPPORTED`:** Claim is not directly contradicted, but lacks substantive premise support ($p_{\text{neut}} > 0.60$ or insufficient context).
- **`CONTRADICTED`:** Claim directly conflicts with evidence or raw tool records ($p_{\text{contra}} > 0.60$ or tool count discrepancy).

---

## 2. Inter-Rater Agreement (Cohen's Kappa)

$$\kappa = \frac{p_o - p_e}{1 - p_e}$$

| Split | Total Cases | Observed Agreement ($p_o$) | Expected Chance Agreement ($p_e$) | Cohen's Kappa ($\kappa$) | Sample Context |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`v1.0_dev`** | 15 | 0.933 | 0.48 | **0.871** | Near-perfect agreement on dev tuning split |
| **`v1.0_val`** | 15 | 0.933 | 0.48 | **0.871** | Near-perfect agreement on validation split |
| **`v1.0_test`** | 20 | 1.000 | 0.50 | **1.000** | Full consensus reached on curated test cases |
| **Overall** | **50** | **0.960** | **0.49** | **0.922** | **High Reliability Across Domain Sets** |

---

## 3. Dataset Distribution by Domain & Failure Mode (50 Cases)

| Domain | Supported Cases | Contradictions / Grounding Failures | Tool Count Discrepancies | Tool Failure Misclaims | Total |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Research Assistant** | 10 | 6 | 0 | 0 | 16 |
| **Technical Support** | 8 | 0 | 6 | 2 | 16 |
| **Data Analysis** | 9 | 0 | 7 | 0 | 16 |
| **Platform Ops** | 2 | 0 | 0 | 0 | 2 |
| **Total** | **29** | **6** | **13** | **2** | **50** |

---

## 4. Methodological Qualifications

1. **Explicit Annotation Boundaries:** High inter-annotator agreement ($\kappa = 0.922$) was achieved because guidelines explicitly separated verifiable factual claims (numbers, citations, tool outputs) from subjective stylistic variance.
2. **Sample Size Qualification:** While 50 instances provide sufficient validation for prototype threshold calibration and regression benchmarking, production drift monitoring requires continuous annotation on real customer trace streams.

## 5. Dataset Expansion (23 additional cases, not independently dual-annotated)

The 50 cases above (Sections 1-3) went through the two-independent-annotator process described in
this report. A further 23 cases (`scripts/expand_dataset.py`) were added later to
bring the evaluation datasets to 73 total cases, closer to the "100+ preferred" scale for threshold
and ablation work. **These 23 cases were not independently dual-annotated** &mdash; their ground truth
is correct by construction rather than by subjective judgment:

- `SUPPORTED` cases restate the evidence/tool result with no added claim.
- `CONTRADICTED / GROUNDING_CONTRADICTION` cases assert a different, checkable fact than the
  evidence states (e.g. misattributing a published result to the wrong paper/year).
- `CONTRADICTED / TOOL_COUNT_MISMATCH` cases claim a tool result count that differs from the
  `tool_records` entry.
- `CONTRADICTED / TOOL_EXECUTION_FAILURE_CLAIM` cases claim success when `tool_records` shows
  `status="error"`.

Because the label follows mechanically from how each case was built, this batch does not need
(and does not report) a separate Cohen's Kappa &mdash; there is no independent human judgment call to
measure agreement on. It should not be pooled with the $\kappa = 0.922$ figure above, which
describes only the original 50 human-annotated cases. Any report citing "50 human-annotated cases"
should keep that number distinct from the 73-case combined dataset size.
