# Grounding-Score Formula Calibration

> **Note, 2026-10-22: the weight chosen here was set on swapped labels and has been re-measured.** This calibration ran while `compute_nli_grounding` had the NLI model's `entailment` and `neutral` outputs swapped, so the "neutral" it describes was the model's entailment class and the `w = 0.5` default, the F1 / FPR figures below and the self-comparison demonstration do not describe the real neutral class. `GROUNDING_RECALIBRATION_2026-10.md` re-measured the weight on the corrected labels; `NEUTRAL_RISK_WEIGHT` is **0.3** since `model_version` `v1.2`, with the 0.7 / 0.4 cut-offs unchanged. This document is kept below as it was written.

**Date:** 2026-08-23 17:52:22 UTC

## Problem

The original grounding-score formula, `grounding_score = 1 - entailment_prob`, is
equivalent to `contradiction_prob + neutral_prob` -- it scores a "neutral" NLI
classification almost as risky as a genuine "contradiction". DeBERTa NLI classifies
verbatim or near-verbatim premise/hypothesis pairs as "neutral" far more often than
"entailment" (out-of-distribution for a model trained on genuine NLI pairs), so
true, well-supported claims can score close to maximum risk under the old formula.

> **[2026-10-25] Inverted.** On the corrected labels DeBERTa calls verbatim pairs *entailment*, not neutral (`GROUNDING_RECALIBRATION_2026-10.md`, section 0 item 1). The problem this report set out to fix came from the swapped labels.

## Fix and selection methodology

New formula: `grounding_score = contradiction_prob + w * neutral_prob`, where `w`
down-weights neutral relative to contradiction. `w` and a decision threshold (for
predicting `is_failure` from grounding_score alone) were swept together on the
**development split only** (21 cases); the best (w, threshold)
pair by F1 (ties broken by recall) was then applied unchanged to the held-out
**test split** (30 cases). The old formula (`w=1.0`) was put
through the identical dev-selection process for a fair, apples-to-apples comparison
rather than compared at an arbitrary threshold.

**Selected weight: w = 0.5, threshold = 0.5**

> **[2026-10-25]** On corrected labels (0.5, 0.5) is not in the top tier on dev (dev F1 0.857, FPR 0.250; T8b). The shipped weight is **0.3** since `model_version` v1.2 (PR #89), chosen in `GROUNDING_RECALIBRATION_2026-10.md` section 3.6 as a design choice. The sentence below that ten weights tie at dev F1 1.0 is still true on corrected labels.

**The dev sweep did not discriminate between weights**: 10 distinct weight values (w = 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9) all tied at the highest development F1 (1.0). This is the same failure mode as the ablation study's dev-sweep finding (`THRESHOLD_ANALYSIS.md`): at 21 development cases, most cases are unambiguous contradictions or unambiguous entailments, so the neutral-probability weight rarely changes a classification outcome either way. **Reporting an arbitrary tie-broken weight as if it were empirically chosen would misrepresent this result.** Instead, `w = 0.5` is used as a **principled default** (neutral treated as half as risky as outright contradiction), not a value fitted to this data. A larger, more diverse development set (more genuinely ambiguous cases, not just clear-cut ones) would be needed before this weight could be empirically justified rather than assumed.

| Formula | Split | Precision | Recall | F1 | FPR | Corrected labels (P / R / F1 / FPR) |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| New (`w=0.5`) | Development (selection) | 1.0 | 1.0 | 1.0 | 0.0 | 0.75 / 1.0 / 0.857 / 0.25 |
| New (`w=0.5`) | Test (held out) | 0.929 | 1.0 | 0.963 | 0.059 | 0.812 / 1.0 / 0.897 / 0.176 |
| Old (`w=1.0`) | Development (selection) | 0.692 | 1.0 | 0.818 | 0.333 | 0.6 / 1.0 / 0.75 / 0.5 (t = 0.9) |
| Old (`w=1.0`) | Test (held out) | 0.542 | 1.0 | 0.703 | 0.647 | 0.722 / 1.0 / 0.839 / 0.294 (t = 0.9) |

The first five columns are as published (swapped labels). The last column is the same procedure on corrected labels (`GROUNDING_RECALIBRATION_2026-10.md` T8b). For the weight that ships today (0.3, cut-offs 0.7 and 0.4): test F1 0.963, FPR 0.059 at both cut-offs (T3c); held-out pool F1 0.927 at 0.7 and 0.952 at 0.4, FPR 0.074 (T3d).

On this test split, `w=0.5` (F1=0.963, FPR=0.059) is at least as good as the old formula `w=1.0` (F1=0.703, FPR=0.647), and directly fixes the self-comparison / paraphrase over-penalization documented below.

> **[2026-10-25]** On corrected labels the point estimates still favour 0.5 over the old formula (0.897 / 0.176 against 0.839 / 0.294), but the intervals overlap widely, and the over-penalization this sentence says it fixes did not exist (see below).

## Self-comparison demonstration

The exact case documented as a known limitation in `experiments/compounding_error.py`
(a premise compared against itself, i.e. a maximally-supported claim):

- Premise/claim: "The database query executed in 45ms and returned 3 verified customer profile records."
- NLI output: contradiction=0.0023, neutral=0.9865, entailment=0.0112
- Old formula (`w=1.0`) grounding_score: **0.9888** (near-maximum risk for a true, unmodified statement)
- New formula (`w=0.5`) grounding_score: **0.4956**

This is the concrete case the fix targets: a statement that is trivially true should not
score as high risk merely because DeBERTa NLI treats verbatim self-comparison as "neutral"
rather than "entailment".

> **[2026-10-25] Wrong on corrected labels.** The real output is contradiction 0.0023, **entailment 0.9865, neutral 0.0112**: DeBERTa does call self-comparison entailment. The old formula gives about 0.0135 (derived) and `w = 0.5` about 0.0079 (derived; re-measured as 0.008 in `experiments/results/grounding_recalibration_2026-10-22_compounding.json`, Node A). At the shipped `w = 0.3` it is about 0.006 (derived). The case shows no over-penalization to fix.

## Limitations

- Small sample (21 dev / 30 test cases). The classification-metric
  comparison above (F1/FPR) should be treated as a sanity check, not strong statistical
  evidence for the specific weight chosen; the self-comparison demonstration is the more
  direct evidence for why this formula change is correct in principle. [2026-10-25: on
  corrected labels the self-comparison is evidence for the opposite; see above.]
- This calibration only adjusts how `neutral_prob` contributes to `grounding_score`. It does
  not change the underlying DeBERTa NLI model or its classification of any individual case.
- The weight was selected once on this dataset version; it is not guaranteed optimal if the
  dataset changes materially (e.g. after further expansion).

*Data source:* `experiments/results/grounding_score_calibration.json`
