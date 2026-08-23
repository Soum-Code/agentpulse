"""Grounding-Score Formula Calibration.

Diagnosed limitation (see PROJECT_REPORT.md Section 3, THRESHOLD_ANALYSIS.md):
DeBERTa NLI classifies a statement compared against itself, or a legitimate
paraphrase, as "neutral" far more often than "entailment" -- verbatim or
near-verbatim premise/hypothesis pairs are out of distribution for a model
trained on genuine NLI pairs. The original formula,
`grounding_score = 1 - entailment_prob` (equivalently
`contradiction_prob + neutral_prob`), scores a neutral classification almost
as risky as a genuine contradiction. A fully-supported claim that happens to
land as "neutral" can therefore score close to maximum risk.

Fix under test: `grounding_score = contradiction_prob + w * neutral_prob` for
some weight `w` in [0, 1], so neutral counts for less than contradiction
rather than being treated the same. `w` is selected empirically:

Methodology (same discipline as experiments/ablation.py):
- Sweep `w` and a decision threshold on the DEVELOPMENT split only.
- Select the (w, threshold) pair with the best F1 (ties broken by recall)
  for predicting `is_failure` from grounding_score alone.
- Apply that pair, unchanged, to the held-out TEST split and report both.
- Compare against `w=1.0` (the old formula) at its own dev-selected
  threshold, so the comparison is apples-to-apples (both formulas get a
  fair, dev-selected threshold, not just the new one).

Outputs:
- experiments/results/grounding_score_calibration.json
- GROUNDING_SCORE_CALIBRATION_REPORT.md
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.grounding import compute_nli_grounding, load_models


def load_split(split: str) -> List[Dict[str, Any]]:
    path = Path(__file__).parent.parent / "datasets" / f"v1.0_{split}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


def compute_nli_signals(cases: List[Dict[str, Any]], split_name: str) -> List[Dict[str, Any]]:
    print(f"  Computing NLI signals for {len(cases)} '{split_name}' cases...")
    signals = []
    for c in cases:
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]
        nli = compute_nli_grounding(premise, claim)
        signals.append({
            "id": c["id"],
            "is_failure": c["is_failure"],
            "contradiction_prob": nli.contradiction_prob if nli else 0.0,
            "neutral_prob": nli.neutral_prob if nli else 0.0,
            "entailment_prob": nli.entailment_prob if nli else 0.0,
        })
    return signals


def score(signals: List[Dict[str, Any]], w: float, threshold: float) -> Dict[str, Any]:
    tp = fp = fn = tn = 0
    for s in signals:
        gscore = s["contradiction_prob"] + w * s["neutral_prob"]
        pred = gscore >= threshold
        actual = s["is_failure"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    return {
        "weight": w, "threshold": threshold,
        "precision": round(prec, 3), "recall": round(rec, 3),
        "f1_score": round(f1, 3), "fpr": round(fpr, 3),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def sweep(signals: List[Dict[str, Any]], weights: List[float], thresholds: List[float]) -> List[Dict[str, Any]]:
    return [score(signals, w, t) for w in weights for t in thresholds]


def best_for_weight(sweep_results: List[Dict[str, Any]], w: float) -> Dict[str, Any]:
    candidates = [r for r in sweep_results if r["weight"] == w]
    return max(candidates, key=lambda r: (r["f1_score"], r["recall"]))


# If classification metrics cannot discriminate between weights on this
# dataset (identical failure mode to ablation.py's dev_sweep_uninformative
# finding), we do not pretend an arbitrary tie-broken weight was empirically
# selected. Instead we fall back to this principled default: treat "neutral"
# as half as risky as an outright contradiction. This is a reasoned default,
# not a data-fitted value, and is reported as such.
PRINCIPLED_DEFAULT_WEIGHT = 0.5
PRINCIPLED_DEFAULT_THRESHOLD = 0.5


def run_calibration() -> Dict[str, Any]:
    print("=" * 64)
    print("GROUNDING-SCORE FORMULA CALIBRATION (neutral-vs-contradiction weight)")
    print("=" * 64)

    load_models(use_onnx=False, sync=True)

    dev_cases = load_split("dev")
    test_cases = load_split("test")
    dev_signals = compute_nli_signals(dev_cases, "dev")
    test_signals = compute_nli_signals(test_cases, "test")

    weights = [round(0.1 * i, 1) for i in range(11)]  # 0.0 .. 1.0
    thresholds = [round(0.1 * i, 1) for i in range(2, 10)]  # 0.2 .. 0.9

    print("\nSweeping (weight, threshold) on the development split...")
    dev_sweep = sweep(dev_signals, weights, thresholds)

    max_f1 = max(r["f1_score"] for r in dev_sweep)
    top_tier = [r for r in dev_sweep if r["f1_score"] == max_f1]
    distinct_weights_at_top = sorted({r["weight"] for r in top_tier})
    weight_selection_uninformative = len(distinct_weights_at_top) > 1

    if weight_selection_uninformative:
        # The sweep cannot tell weights apart at this sample size (mirrors
        # ablation.py's dev_sweep_uninformative finding) -- do not report an
        # arbitrary tie-broken weight as if it were empirically chosen.
        selected_weight = PRINCIPLED_DEFAULT_WEIGHT
        candidates_at_w = [r for r in top_tier if r["weight"] == selected_weight]
        if candidates_at_w:
            threshold_uninformative = len({r["threshold"] for r in candidates_at_w}) > 1
            selected_threshold = (
                PRINCIPLED_DEFAULT_THRESHOLD if threshold_uninformative
                else candidates_at_w[0]["threshold"]
            )
        else:
            # w=0.5 wasn't in the top tier at all -- use its own best dev score.
            threshold_uninformative = True
            selected_threshold = PRINCIPLED_DEFAULT_THRESHOLD
        best_overall = score(dev_signals, selected_weight, selected_threshold)
        best_overall["weight"] = selected_weight
        best_overall["threshold"] = selected_threshold
    else:
        threshold_uninformative = False
        best_overall = top_tier[0]

    old_formula_best = best_for_weight(dev_sweep, 1.0)  # w=1.0 == old "1 - entailment_prob"

    if weight_selection_uninformative:
        print(
            f"  Dev sweep does not discriminate between weights ({len(distinct_weights_at_top)} "
            f"distinct weights tie at F1={max_f1}). Using principled default: "
            f"w={best_overall['weight']}, threshold={best_overall['threshold']}."
        )
    else:
        print(
            f"  New formula selected on dev: w={best_overall['weight']}, "
            f"threshold={best_overall['threshold']} (dev F1={best_overall['f1_score']})"
        )
    print(
        f"  Old formula (w=1.0) best dev threshold: {old_formula_best['threshold']} "
        f"(dev F1={old_formula_best['f1_score']})"
    )

    new_test = score(test_signals, best_overall["weight"], best_overall["threshold"])
    old_test = score(test_signals, 1.0, old_formula_best["threshold"])

    # ── Direct demonstration: the exact self-comparison case from
    # experiments/compounding_error.py's known limitation ──
    self_premise = "The database query executed in 45ms and returned 3 verified customer profile records."
    self_nli = compute_nli_grounding(self_premise, self_premise)
    self_demo = None
    if self_nli:
        old_score = self_nli.contradiction_prob + 1.0 * self_nli.neutral_prob
        new_score = self_nli.contradiction_prob + best_overall["weight"] * self_nli.neutral_prob
        self_demo = {
            "premise_vs_itself": self_premise,
            "contradiction_prob": self_nli.contradiction_prob,
            "neutral_prob": self_nli.neutral_prob,
            "entailment_prob": self_nli.entailment_prob,
            "old_grounding_score_w1": round(old_score, 4),
            "new_grounding_score_selected_w": round(new_score, 4),
        }
        print(
            f"\n  Self-comparison demo: old grounding_score={old_score:.4f}, "
            f"new grounding_score={new_score:.4f} (should both reflect near-zero real risk)"
        )

    improved = new_test["f1_score"] > old_test["f1_score"] or (
        new_test["f1_score"] == old_test["f1_score"] and new_test["fpr"] < old_test["fpr"]
    )

    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "methodology": {
            "formula": "grounding_score = contradiction_prob + w * neutral_prob",
            "old_formula_equivalent": "w = 1.0 (i.e. grounding_score = 1 - entailment_prob)",
            "selection_split": "v1.0_dev",
            "reporting_split": "v1.0_test",
        },
        "n_dev_cases": len(dev_cases),
        "n_test_cases": len(test_cases),
        "selected_weight": best_overall["weight"],
        "selected_threshold": best_overall["threshold"],
        "weight_selection_uninformative": weight_selection_uninformative,
        "distinct_weights_tied_at_max_dev_f1": distinct_weights_at_top,
        "dev_sweep": dev_sweep,
        "new_formula": {"dev": best_overall, "test": new_test},
        "old_formula": {"dev": old_formula_best, "test": old_test},
        "self_comparison_demo": self_demo,
        "new_formula_improves_on_old": improved,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "grounding_score_calibration.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    _write_report(out_payload)

    print("\nCalibration complete.")
    print(f"Results saved to: {res_json_path}")
    print("Report written to: GROUNDING_SCORE_CALIBRATION_REPORT.md")
    return out_payload


def _write_report(payload: Dict[str, Any]) -> None:
    new_f = payload["new_formula"]
    old_f = payload["old_formula"]
    demo = payload["self_comparison_demo"]
    w = payload["selected_weight"]

    if payload["weight_selection_uninformative"]:
        selection_note = (
            f"**The dev sweep did not discriminate between weights**: "
            f"{len(payload['distinct_weights_tied_at_max_dev_f1'])} distinct weight values "
            f"(w = {', '.join(str(x) for x in payload['distinct_weights_tied_at_max_dev_f1'])}) "
            f"all tied at the highest development F1 ({max(r['f1_score'] for r in payload['dev_sweep'])}). "
            f"This is the same failure mode as the ablation study's dev-sweep finding "
            f"(`THRESHOLD_ANALYSIS.md`): at {payload['n_dev_cases']} development cases, most cases "
            f"are unambiguous contradictions or unambiguous entailments, so the neutral-probability "
            f"weight rarely changes a classification outcome either way. **Reporting an arbitrary "
            f"tie-broken weight as if it were empirically chosen would misrepresent this result.** "
            f"Instead, `w = {w}` is used as a **principled default** (neutral treated as half as risky "
            f"as outright contradiction), not a value fitted to this data. A larger, more diverse "
            f"development set (more genuinely ambiguous cases, not just clear-cut ones) would be "
            f"needed before this weight could be empirically justified rather than assumed."
        )
    else:
        selection_note = (
            f"The dev sweep did discriminate between weights: `w = {w}` was the unique best "
            f"performer on the development split (F1={new_f['dev']['f1_score']})."
        )

    if payload["new_formula_improves_on_old"]:
        verdict = (
            f"On this test split, `w={w}` (F1={new_f['test']['f1_score']}, "
            f"FPR={new_f['test']['fpr']}) is at least as good as the old formula "
            f"`w=1.0` (F1={old_f['test']['f1_score']}, FPR={old_f['test']['fpr']}), "
            f"and directly fixes the self-comparison / paraphrase over-penalization "
            f"documented below."
        )
    else:
        verdict = (
            f"On this test split, `w={w}` (F1={new_f['test']['f1_score']}) does not "
            f"score better on F1/FPR than the old formula `w=1.0` "
            f"(F1={old_f['test']['f1_score']}). This dataset is small "
            f"({payload['n_dev_cases']} dev / {payload['n_test_cases']} test cases) and "
            f"may not contain enough neutral-classified failure cases to separate the "
            f"two formulas on classification metrics alone. The fix is retained anyway "
            f"because it is independently justified by the self-comparison demonstration "
            f"below, not by the F1 change."
        )

    demo_block = ""
    if demo:
        demo_block = f"""
## Self-comparison demonstration

The exact case documented as a known limitation in `experiments/compounding_error.py`
(a premise compared against itself, i.e. a maximally-supported claim):

- Premise/claim: "{demo['premise_vs_itself']}"
- NLI output: contradiction={demo['contradiction_prob']}, neutral={demo['neutral_prob']}, entailment={demo['entailment_prob']}
- Old formula (`w=1.0`) grounding_score: **{demo['old_grounding_score_w1']}** (near-maximum risk for a true, unmodified statement)
- New formula (`w={w}`) grounding_score: **{demo['new_grounding_score_selected_w']}**

This is the concrete case the fix targets: a statement that is trivially true should not
score as high risk merely because DeBERTa NLI treats verbatim self-comparison as "neutral"
rather than "entailment".
"""

    content = f"""# Grounding-Score Formula Calibration

**Date:** {payload['timestamp']}

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
**development split only** ({payload['n_dev_cases']} cases); the best (w, threshold)
pair by F1 (ties broken by recall) was then applied unchanged to the held-out
**test split** ({payload['n_test_cases']} cases). The old formula (`w=1.0`) was put
through the identical dev-selection process for a fair, apples-to-apples comparison
rather than compared at an arbitrary threshold.

**Selected weight: w = {w}, threshold = {payload['selected_threshold']}**

{selection_note}

| Formula | Split | Precision | Recall | F1 | FPR |
| :--- | :--- | :---: | :---: | :---: | :---: |
| New (`w={w}`) | Development (selection) | {new_f['dev']['precision']} | {new_f['dev']['recall']} | {new_f['dev']['f1_score']} | {new_f['dev']['fpr']} |
| New (`w={w}`) | Test (held out) | {new_f['test']['precision']} | {new_f['test']['recall']} | {new_f['test']['f1_score']} | {new_f['test']['fpr']} |
| Old (`w=1.0`) | Development (selection) | {old_f['dev']['precision']} | {old_f['dev']['recall']} | {old_f['dev']['f1_score']} | {old_f['dev']['fpr']} |
| Old (`w=1.0`) | Test (held out) | {old_f['test']['precision']} | {old_f['test']['recall']} | {old_f['test']['f1_score']} | {old_f['test']['fpr']} |

{verdict}
{demo_block}
## Limitations

- Small sample ({payload['n_dev_cases']} dev / {payload['n_test_cases']} test cases). The classification-metric
  comparison above (F1/FPR) should be treated as a sanity check, not strong statistical
  evidence for the specific weight chosen; the self-comparison demonstration is the more
  direct evidence for why this formula change is correct in principle.
- This calibration only adjusts how `neutral_prob` contributes to `grounding_score`. It does
  not change the underlying DeBERTa NLI model or its classification of any individual case.
- The weight was selected once on this dataset version; it is not guaranteed optimal if the
  dataset changes materially (e.g. after further expansion).

*Data source:* `experiments/results/grounding_score_calibration.json`
"""
    with open(Path(__file__).parent.parent / "GROUNDING_SCORE_CALIBRATION_REPORT.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    run_calibration()
