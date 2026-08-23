# Component Ablation & Threshold Sensitivity Analysis

**Date:** 2026-08-23 11:28:51 UTC

## Methodology

Thresholds were swept on the **development split** (`v1.0_dev`, 21 cases) and the selected
operating point was then applied **unchanged** to the held-out **test split** (`v1.0_test`,
30 cases). No threshold, weight, or decision rule was selected using test-split results.

All per-case model signals (embedding similarity, NLI probabilities, tool-claim scores,
disagreement, drift) are computed once per case and shared across configurations, so
configurations differ only in their decision rule.

---

## 1. Selected Operating Point (chosen on dev, evaluated on test)

**All threshold combinations tied at F1=1.0 on the development split** &mdash; the sweep did not actually discriminate between thresholds at this sample size (21 cases), so the "selected" operating point below was chosen arbitrarily among equally-scoring options, not because it was measurably better. A larger development set is needed before threshold selection here is meaningful.

| | NLI contradiction threshold | Low-similarity floor | Precision | Recall | F1 | FPR | FNR |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Development (selection) | 0.50 | 0.10 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| Test (held out) | 0.50 | 0.10 | 0.929 | 1.0 | 0.963 | 0.059 | 0.0 |

Dev-to-test F1 change: **+0.037**. A large positive gap would indicate the operating
point was overfitted to the development split.

---

## 2. Architectural Ablation (all figures on the held-out test split)

| Configuration | Description | Precision | Recall | F1 | FPR | FNR | TP/FP/FN/TN | Latency (ms) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| A MiniLM Only | MiniLM embedding cosine only | 0.733 | 0.846 | 0.786 | 0.235 | 0.154 | 11/4/2/13 | 48.53 |
| B DeBERTa Only | DeBERTa-v3 NLI only | 0.929 | 1.0 | 0.963 | 0.059 | 0.0 | 13/1/0/16 | 300.48 |
| C Cascade | MiniLM + DeBERTa cascade | 0.929 | 1.0 | 0.963 | 0.059 | 0.0 | 13/1/0/16 | 349.02 |
| D NLI Plus Tool | NLI + deterministic tool-claim validation | 0.929 | 1.0 | 0.963 | 0.059 | 0.0 | 13/1/0/16 | 300.54 |
| E NLI Plus Disagreement | NLI + inter-agent disagreement | 0.929 | 1.0 | 0.963 | 0.059 | 0.0 | 13/1/0/16 | 598.03 |
| F NLI Plus Drift | NLI + drift signal | 0.448 | 1.0 | 0.619 | 0.941 | 0.0 | 13/16/0/1 | 329.93 |
| G Full AgentPulse | Full AgentPulse pipeline (grounding + tool + disagreement + drift + risk aggregation) | 0.542 | 1.0 | 0.703 | 0.647 | 0.0 | 13/11/0/6 | 359.33 |

**Observations (derived from the table, not pre-assumed):**

1. 4 configurations tie at the highest F1 (0.963): B_DeBERTa_Only, C_Cascade, D_NLI_Plus_Tool, E_NLI_Plus_Disagreement. On this test split they are not distinguishable by F1.
2. E_NLI_Plus_Disagreement produced metrics identical to Config B (NLI only), i.e. the additional signal never changed a decision on this dataset. See limitations.
3. **3 configuration(s) scored below the plain NLI-only baseline (Config B, F1=0.963, FPR=0.059) on this test split: A_MiniLM_Only (F1=0.786, FPR=0.235); F_NLI_Plus_Drift (F1=0.619, FPR=0.941); G_Full_AgentPulse (F1=0.703, FPR=0.647).** This is not hidden: adding more signals to the composite score did not uniformly help, and in these cases made false-positive rate substantially worse. See Section 4 for why (drift cold-start behaviour on non-temporal data).

---

## 3. Threshold Sensitivity Sweep (development split, all 20 combinations)

| Low-similarity floor | NLI contradiction threshold | Precision | Recall | F1 | FPR | FNR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 0.10 | 0.50 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.10 | 0.60 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.10 | 0.70 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.10 | 0.80 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.20 | 0.50 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.20 | 0.60 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.20 | 0.70 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.20 | 0.80 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.30 | 0.50 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.30 | 0.60 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.30 | 0.70 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.30 | 0.80 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.35 | 0.50 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.35 | 0.60 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.35 | 0.70 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.35 | 0.80 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.40 | 0.50 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.40 | 0.60 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.40 | 0.70 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |
| 0.40 | 0.80 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 |

Selection rule: highest F1, ties broken by higher recall.

---

## 4. Limitations

- **Sample size.** 21 development and 30 test cases. Differences of one or two
  cases move these metrics substantially; small F1 gaps between configurations should not be
  treated as meaningful separations.
- **Disagreement (Config E) is not properly exercised by this dataset.** The evaluation cases
  are single-agent records (evidence + one claim), so the only pair available to the
  disagreement engine is (evidence -> claim) &mdash; the same comparison Config B already makes.
  Testing the multi-agent disagreement path requires multi-agent trace data, which this
  dataset does not contain.
- **Drift (Config F) has no real time axis here.** Drift is a temporal signal; these cases are
  independent and file-ordered, so the drift figures describe detector behaviour on an
  arbitrary ordering, not production drift.
- **Latency figures** are per-case means of the components each configuration uses, measured on
  CPU. They are not end-to-end request latencies.
- Ground truth is the dataset's `is_failure` label. For the original 50 cases this comes from dual LLM-as-judge evaluation, not human review; for the 23 cases added later it's correct by construction. See `LABEL_AGREEMENT_REPORT.md`.

*Data source:* `experiments/results/ablation_results.json`
