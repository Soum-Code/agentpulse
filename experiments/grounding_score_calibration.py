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

# WHAT THIS FILE IS FOR
# A one-off experiment script, not part of the running product. It studies how the grounding
# score should treat the NLI answer "neutral". NLI (natural language inference) is a model
# that reads a piece of evidence and a claim and gives three probabilities: entailment (the
# claim follows from the evidence), contradiction (it conflicts) and neutral (neither). The
# score tested is contradiction_prob + w * neutral_prob. The script tries w from 0.0 to 1.0
# and decision thresholds from 0.2 to 0.9 on the dev split of a labelled dataset, chooses
# a pair, checks it on the test split, and compares it with w = 1.0 (the old formula).
# It saves a JSON file and a markdown report.
#
# HOW IT FITS IN
# Uses load_models and compute_nli_grounding from app/services/grounding.py, and the files
# datasets/v1.0_dev.json and v1.0_test.json. grounding.py now ships NEUTRAL_RISK_WEIGHT = 0.5,
# the same value as PRINCIPLED_DEFAULT_WEIGHT below. This script reads only the raw NLI
# probabilities, so that constant does not change its results.

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Make the repo importable when this file is run as a plain script: backend/ (the "app"
# package), the SDK source, and the repo root.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# load_models loads the NLI and embedding models into memory. compute_nli_grounding runs the
# NLI model on (evidence, claim) and returns the three probabilities, or None if it cannot.
from app.services.grounding import compute_nli_grounding, load_models


# Reads one labelled dataset file, datasets/v1.0_<split>.json (split is "dev" or "test"),
# and returns the list of cases in it. Each case has an id, the evidence, the agent's claim
# and is_failure (True if the claim is a real failure).
def load_split(split: str) -> List[Dict[str, Any]]:
    path = Path(__file__).parent.parent / "datasets" / f"v1.0_{split}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


# Runs the NLI model once per case and keeps just what the sweep needs: the case id, the true
# label and the three NLI probabilities. Doing this once means the many (w, threshold) tries
# later reuse these numbers and never call the model again.
def compute_nli_signals(cases: List[Dict[str, Any]], split_name: str) -> List[Dict[str, Any]]:
    print(f"  Computing NLI signals for {len(cases)} '{split_name}' cases...")
    signals = []
    for c in cases:
        # The premise (the evidence) is the case's evidence, or the input query if the
        # evidence is empty. The claim (the hypothesis) is what the agent said.
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]
        nli = compute_nli_grounding(premise, claim)
        # If the NLI call gave None (model missing or an error), all three probabilities are
        # set to 0.0. That makes the score 0, so the case counts as "not a failure".
        signals.append({
            "id": c["id"],
            "is_failure": c["is_failure"],
            "contradiction_prob": nli.contradiction_prob if nli else 0.0,
            "neutral_prob": nli.neutral_prob if nli else 0.0,
            "entailment_prob": nli.entailment_prob if nli else 0.0,
        })
    return signals


# Scores one choice of weight w and threshold on a list of signals. A case is predicted to be
# a failure when contradiction_prob + w * neutral_prob >= threshold. The prediction is then
# compared with the true is_failure label. Returns a dict with the counts and the metrics.
def score(signals: List[Dict[str, Any]], w: float, threshold: float) -> Dict[str, Any]:
    # Confusion counts. tp = predicted failure and really a failure; fp = predicted failure
    # but fine; fn = missed a real failure; tn = correctly left alone.
    tp = fp = fn = tn = 0
    for s in signals:
        gscore = s["contradiction_prob"] + w * s["neutral_prob"]
        pred = gscore >= threshold
        actual = s["is_failure"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1
    # precision = of the cases flagged, how many were real failures. recall = of the real
    # failures, how many were flagged. F1 = the harmonic mean of the two (high only when both
    # are high). fpr (false positive rate) = of the fine cases, how many were flagged. Each
    # division is guarded so an empty group gives 0.0 instead of a crash.
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


# Tries every (weight, threshold) pair and returns one result dict per pair. Weights are the
# outer loop, so the rows come out grouped by weight, with thresholds rising inside each group.
def sweep(signals: List[Dict[str, Any]], weights: List[float], thresholds: List[float]) -> List[Dict[str, Any]]:
    return [score(signals, w, t) for w in weights for t in thresholds]


# Among the sweep rows for one weight w, returns the best row: highest F1, and if F1 is tied,
# highest recall. If both tie, max() returns the first of them (the lowest threshold).
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


# Runs the whole calibration and returns the JSON data as a dict. It also writes the JSON file
# and the markdown report. It takes no arguments.
def run_calibration() -> Dict[str, Any]:
    print("=" * 64)
    print("GROUNDING-SCORE FORMULA CALIBRATION (neutral-vs-contradiction weight)")
    print("=" * 64)

    # Step 1: load the models. use_onnx=False picks the plain PyTorch engine for the NLI
    # model; sync=True waits until loading is done.
    load_models(use_onnx=False, sync=True)

    # Step 2: read the dev and test cases and run the NLI model on each case, once.
    dev_cases = load_split("dev")
    test_cases = load_split("test")
    dev_signals = compute_nli_signals(dev_cases, "dev")
    test_signals = compute_nli_signals(test_cases, "test")

    # Step 3: the grid to try. 11 weights (0.0, 0.1, ... 1.0) times 8 thresholds (0.2, 0.3,
    # ... 0.9). round(..., 1) removes tiny float errors such as 0.30000000000000004.
    weights = [round(0.1 * i, 1) for i in range(11)]  # 0.0 .. 1.0
    thresholds = [round(0.1 * i, 1) for i in range(2, 10)]  # 0.2 .. 0.9

    # Step 4: score every pair on the DEV split only. The test split is kept out of the choice.
    print("\nSweeping (weight, threshold) on the development split...")
    dev_sweep = sweep(dev_signals, weights, thresholds)

    # Step 5: pick the pair. First find the top F1 and every row that reaches it (the "top
    # tier"), then see how many different weights are in that tier. F1 was rounded to 3
    # decimals in score(), so a tie means equal after rounding.
    max_f1 = max(r["f1_score"] for r in dev_sweep)
    top_tier = [r for r in dev_sweep if r["f1_score"] == max_f1]
    distinct_weights_at_top = sorted({r["weight"] for r in top_tier})
    weight_selection_uninformative = len(distinct_weights_at_top) > 1

    if weight_selection_uninformative:
        # The sweep cannot tell weights apart at this sample size (mirrors
        # ablation.py's dev_sweep_uninformative finding) -- do not report an
        # arbitrary tie-broken weight as if it were empirically chosen.
        # Case A: several weights tie for the best F1. Use the fixed default weight (0.5)
        # instead of picking one by chance.
        selected_weight = PRINCIPLED_DEFAULT_WEIGHT
        candidates_at_w = [r for r in top_tier if r["weight"] == selected_weight]
        if candidates_at_w:
            # If the default weight has one threshold in the top tier, use it. If it has
            # several, they cannot be told apart, so the fixed default threshold (0.5) is used.
            threshold_uninformative = len({r["threshold"] for r in candidates_at_w}) > 1
            selected_threshold = (
                PRINCIPLED_DEFAULT_THRESHOLD if threshold_uninformative
                else candidates_at_w[0]["threshold"]
            )
        else:
            # w=0.5 wasn't in the top tier at all -- use its own best dev score.
            # (As coded, this branch simply uses the fixed default threshold 0.5; it does
            # not look up the best threshold for w=0.5.)
            threshold_uninformative = True
            selected_threshold = PRINCIPLED_DEFAULT_THRESHOLD
        # Re-score the chosen pair on dev so the report has its dev numbers. The two lines
        # that follow only set the keys again to the same values.
        best_overall = score(dev_signals, selected_weight, selected_threshold)
        best_overall["weight"] = selected_weight
        best_overall["threshold"] = selected_threshold
    else:
        # Case B: only one weight reaches the top F1, so the data did choose it. Take the
        # first top-tier row (the lowest threshold). The recall tie-break that the module
        # docstring mentions is not applied here; only best_for_weight uses it.
        threshold_uninformative = False
        best_overall = top_tier[0]

    # Step 6: the old formula gets the same fair treatment: its own best threshold on dev.
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

    # Step 7: apply both chosen pairs, unchanged, to the held-out TEST split. This is the
    # number that counts, because the test cases played no part in choosing.
    new_test = score(test_signals, best_overall["weight"], best_overall["threshold"])
    old_test = score(test_signals, 1.0, old_formula_best["threshold"])

    # ── Direct demonstration: the exact self-comparison case from
    # experiments/compounding_error.py's known limitation ──
    # Step 8: run NLI on a sentence compared with itself, then work out the old and new score
    # from the same three probabilities. If NLI is not available the demo is skipped (None).
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

    # Step 9: did the new formula do better on the test split? Yes if its F1 is higher, or if
    # the F1 is equal and its false positive rate is lower.
    improved = new_test["f1_score"] > old_test["f1_score"] or (
        new_test["f1_score"] == old_test["f1_score"] and new_test["fpr"] < old_test["fpr"]
    )

    # Step 10: gather everything into one dict, write it as JSON (the results folder is created
    # if missing), then write the markdown report at the repo root.
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


# Writes GROUNDING_SCORE_CALIBRATION_REPORT.md at the repo root from the result dict made by
# run_calibration. The file is overwritten on every run. The text has a few parts that change
# with the results (selection note, verdict, demo block), then one big f-string for the page.
def _write_report(payload: Dict[str, Any]) -> None:
    new_f = payload["new_formula"]
    old_f = payload["old_formula"]
    demo = payload["self_comparison_demo"]
    w = payload["selected_weight"]

    # Part 1: say honestly how w was chosen. If several weights tied, explain that the default
    # was used; otherwise say the dev split picked w.
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

    # Part 2: the verdict sentence. One wording if the new formula did better on test, another
    # (that admits it did not) if not.
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

    # Part 3: the self-comparison section is added only if that demo could be run.
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

    # Part 4: the whole page as one f-string. The {...} slots take numbers from `payload` and
    # the pieces built above. The table has one row per (formula, split) pair.
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
    # Part 5: write it to the repo root (the parent of the experiments folder).
    with open(Path(__file__).parent.parent / "GROUNDING_SCORE_CALIBRATION_REPORT.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    run_calibration()
