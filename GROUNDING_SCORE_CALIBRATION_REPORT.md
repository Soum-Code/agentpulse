# Grounding-Score Formula Calibration

**Date:** 2026-08-23 17:52:22 UTC

## Problem

The original grounding-score formula, `grounding_score = 1 - entailment_prob`, is
equivalent to `contradiction_prob + neutral_prob` -- it scores a "neutral" NLI
classification almost as risky as a genuine "contradiction". DeBERTa NLI classifies
verbatim or near-verbatim premise/hypothesis pairs as "neutral" far more often than
"entailment" (out-of-distribution for a model trained on genuine NLI pairs), so
true, well-supported claims can score close to maximum risk under the old formula.

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

**The dev sweep did not discriminate between weights**: 10 distinct weight values (w = 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9) all tied at the highest development F1 (1.0). This is the same failure mode as the ablation study's dev-sweep finding (`THRESHOLD_ANALYSIS.md`): at 21 development cases, most cases are unambiguous contradictions or unambiguous entailments, so the neutral-probability weight rarely changes a classification outcome either way. **Reporting an arbitrary tie-broken weight as if it were empirically chosen would misrepresent this result.** Instead, `w = 0.5` is used as a **principled default** (neutral treated as half as risky as outright contradiction), not a value fitted to this data. A larger, more diverse development set (more genuinely ambiguous cases, not just clear-cut ones) would be needed before this weight could be empirically justified rather than assumed.

| Formula | Split | Precision | Recall | F1 | FPR |
| :--- | :--- | :---: | :---: | :---: | :---: |
| New (`w=0.5`) | Development (selection) | 1.0 | 1.0 | 1.0 | 0.0 |
| New (`w=0.5`) | Test (held out) | 0.929 | 1.0 | 0.963 | 0.059 |
| Old (`w=1.0`) | Development (selection) | 0.692 | 1.0 | 0.818 | 0.333 |
| Old (`w=1.0`) | Test (held out) | 0.542 | 1.0 | 0.703 | 0.647 |

On this test split, `w=0.5` (F1=0.963, FPR=0.059) is at least as good as the old formula `w=1.0` (F1=0.703, FPR=0.647), and directly fixes the self-comparison / paraphrase over-penalization documented below.

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

## Limitations

- Small sample (21 dev / 30 test cases). The classification-metric
  comparison above (F1/FPR) should be treated as a sanity check, not strong statistical
  evidence for the specific weight chosen; the self-comparison demonstration is the more
  direct evidence for why this formula change is correct in principle.
- This calibration only adjusts how `neutral_prob` contributes to `grounding_score`. It does
  not change the underlying DeBERTa NLI model or its classification of any individual case.
- The weight was selected once on this dataset version; it is not guaranteed optimal if the
  dataset changes materially (e.g. after further expansion).

*Data source:* `experiments/results/grounding_score_calibration.json`
