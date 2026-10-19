"""Baseline: the CURRENT tool-claim validator against the real-data benchmark.

Steps 5-6 of the tool-claim redesign. Establishes the "before" figure that
any redesign must beat, measured on real agent traces rather than the 19
hand-written cases the validator was originally scored on.

WHAT IS BEING MEASURED

The shipped `evaluate_tool_claims()` is run UNMODIFIED against each case's
retrospective summary, with the case's structured tool-call names supplied as
the actual tool records. Scored on the 124 tier-1 cases, where the label comes
from the benchmark harness's own `success` field.

  positive class : the summary asserts completion on a run the harness scored
                   as FAILED (an overclaim)
  negative class : the summary asserts completion on a run that succeeded

Reported: precision, recall, F1 and the confusion matrix -- plus, separately,
how often the validator extracted anything at all, because a detector that
never fires produces a degenerate confusion matrix that F1 alone hides.

This is expected to score near zero. That is the point: it makes the "before"
concrete and proves the benchmark is usable before a redesign is built
against it. A benchmark nobody has run a baseline on is not a benchmark.

The 19-case benchmark and the validator are both left untouched.

Outputs:
- experiments/results/tool_claim_baseline_run.json
"""

# ---- What this file is for ---------------------------------------------------
# A script that you run by hand. It gives the "before" score of the tool-claim check
# (evaluate_tool_claims in backend/app/services/tool_claim.py). That check reads an agent's
# closing summary, looks for statements such as "I used the search tool" or "found 3
# documents", and compares them with the tool calls that really ran. Here it is run,
# unchanged, on real agent runs. For each run the dataset tells us whether the benchmark
# harness scored the run as failed. A summary that claims completion on a failed run is an
# "overclaim". The script counts how often the check flags such cases (precision, recall,
# F1, and a confusion matrix, which is the table of right and wrong answers) and how often
# it finds any claim at all.
#
# How it fits in: it reads datasets/external/exgentic_v2/derived/tool_claim_cases.json,
# which experiments/tool_claim_benchmark_build.py makes, and it writes
# experiments/results/tool_claim_baseline_run.json. Nothing in the app imports it.
# ------------------------------------------------------------------------------

from __future__ import annotations

import json
import sys
# Counter = a dict that counts things. defaultdict = a dict that creates a missing entry
# the first time you use it.
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# Make the backend, the SDK and the repo root importable when this file is run directly.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# ToolCallRecord = one tool call that really happened. evaluate_tool_claims = the check that
# is being measured.
from app.services.tool_claim import ToolCallRecord, evaluate_tool_claims

# CASES_PATH = the test set made by tool_claim_benchmark_build.py. OUT_PATH = where the
# results are written.
CASES_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "tool_claim_cases.json")
OUT_PATH = Path(__file__).parent / "results" / "tool_claim_baseline_run.json"

# A case counts as "flagged" when the validator reports any mismatch.
# Not literally "any": a case is flagged when the validator's score (the share of its claims
# that are mismatches, 0 to 1) is at least FLAG_THRESHOLD. So one wrong claim out of three
# is not enough, because 1/3 is below 0.5.
FLAG_THRESHOLD = 0.5


# Turn the four counts of a confusion matrix into scores. The "positive" class is an
# overclaim. tp = flagged and really an overclaim; fp = flagged but not an overclaim;
# fn = not flagged but an overclaim (missed); tn = not flagged and not an overclaim.
# precision = tp / (tp + fp): of the flagged cases, the share that were real overclaims.
# recall = tp / (tp + fn): of the real overclaims, the share that were flagged.
# f1 = one number mixing precision and recall. accuracy = (tp + tn) / all cases.
# Each division gives 0.0 when its bottom part would be 0.
def metrics(tp: int, fp: int, fn: int, tn: int) -> dict[str, Any]:
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) else 0.0
    return {
        "precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "accuracy": round((tp + tn) / (tp + fp + fn + tn), 4) if (tp + fp + fn + tn) else 0.0,
    }


def main() -> None:
    print("=" * 78)
    print("BASELINE — current validator vs. the real-data benchmark")
    print("=" * 78)

    # Step 1: load the cases. Stop with a clear message if the test set was never built.
    # "tier 1" cases are those whose summary claims completion; only they have a true label
    # (expected_overclaim). The source line shows the dataset name and the first 12
    # characters of its version id (the "revision").
    if not CASES_PATH.exists():
        raise SystemExit(f"Missing {CASES_PATH}. Run experiments/tool_claim_benchmark_build.py first.")

    data = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    cases = data["cases"]
    tier1 = [c for c in cases if c["label"]["tier"] == "tier_1_external"]
    print(f"\ncases: {len(cases)} total, {len(tier1)} tier-1 labelled")
    print(f"source: {data['provenance']['dataset_id']} @ {data['provenance']['revision'][:12]}")

    results: list[dict] = []
    extracted_any = 0
    flagged_any = 0

    # Step 2: run the check on EVERY case, not only tier 1. The "actual" tool calls are built
    # from the tool names the dataset lists for that run. Only the name is filled in:
    # status stays "success" and result_count stays empty. So in this script only a
    # FABRICATED_TOOL mismatch is possible: a claim about a tool whose name matches no listed
    # name (exactly or as part of one), or a count claim naming no tool ("found 3 documents")
    # when the list is empty. The "success wording on an errored call" check and the "wrong
    # count" check have nothing to compare with.
    for case in cases:
        records = [ToolCallRecord(tool_name=name)
                   for name in case["evidence"]["tool_names_called"]]
        outcome = evaluate_tool_claims(case["summary_text"], records)

        # predicted = the check flags this case (score at or above FLAG_THRESHOLD).
        # extracted_any counts the cases where the check found at least one claim to test;
        # flagged_any counts the cases it flagged.
        predicted = outcome.tool_claim_score >= FLAG_THRESHOLD
        if outcome.total_claims:
            extracted_any += 1
        if predicted:
            flagged_any += 1

        results.append({
            "case_id": case["case_id"],
            "tier": case["label"]["tier"],
            "benchmark": case["benchmark"], "harness": case["harness"],
            "model": case["model"],
            "expected_overclaim": case["label"]["expected_overclaim"],
            "claims_extracted": outcome.total_claims,
            "mismatches": outcome.mismatches,
            "tool_claim_score": outcome.tool_claim_score,
            "predicted_flag": predicted,
        })

    # Scored only where an external label exists.
    # Step 3: build the confusion matrix from the tier-1 cases. "actual" is True when the
    # case is a real overclaim (the summary says "done" but the harness scored the run as
    # failed). "pred" is True when the check flagged the case.
    tp = fp = fn = tn = 0
    for r in results:
        if r["tier"] != "tier_1_external":
            continue
        actual = bool(r["expected_overclaim"])
        pred = r["predicted_flag"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1

    # Step 4: the scores. "degenerate" = the check never flagged any tier-1 case (tp + fp is
    # 0). Then precision and recall are 0 by construction, which F1 alone would not explain.
    scored = metrics(tp, fp, fn, tn)
    degenerate = (tp + fp) == 0

    # Step 5: a count per "cell" = one (benchmark, harness) pair, all cases included. For
    # each cell: how many cases, in how many of them the check found a claim, in how many it
    # flagged. Adding a bool adds 1 for True and 0 for False.
    by_cell = defaultdict(lambda: Counter())
    for r in results:
        cell = f"{r['benchmark']}/{r['harness']}"
        by_cell[cell]["cases"] += 1
        by_cell[cell]["extracted"] += bool(r["claims_extracted"])
        by_cell[cell]["flagged"] += bool(r["predicted_flag"])

    # Step 6: the JSON that is saved. extraction_rate = the share of ALL cases (not only tier
    # 1) in which the check found at least one claim. `results` lists every case with its
    # outcome, so a reader can audit single cases.
    payload = {
        "data_class": "EXTERNAL_REAL_DATA",
        "validator": "backend/app/services/tool_claim.py (unmodified)",
        "source": data["provenance"],
        "label_semantics": data["label_semantics"],
        "scored_on": "tier_1_external only",
        "totals": {
            "cases_total": len(cases),
            "cases_tier_1": len(tier1),
            "cases_where_validator_extracted_anything": extracted_any,
            "cases_flagged": flagged_any,
            "extraction_rate": round(extracted_any / len(cases), 4),
        },
        "scored_metrics": scored,
        "degenerate_detector": degenerate,
        "degenerate_note": (
            "The detector never predicted the positive class, so precision and "
            "recall are 0 by construction and accuracy merely reflects the class "
            "balance. F1 alone would hide this."
        ) if degenerate else None,
        "per_cell": {k: dict(v) for k, v in sorted(by_cell.items())},
        "results": results,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("\n" + "-" * 78)
    print("EXTRACTION (does the validator find anything to check?)")
    print("-" * 78)
    print(f"  cases where it extracted any claim : {extracted_any} / {len(cases)}"
          f"  ({payload['totals']['extraction_rate']:.1%})")
    print(f"  cases it flagged                   : {flagged_any}")
    print(f"\n  {'cell':40s} {'cases':>6s} {'extracted':>10s} {'flagged':>8s}")
    for cell, c in sorted(by_cell.items()):
        print(f"  {cell:40s} {c['cases']:6d} {c['extracted']:10d} {c['flagged']:8d}")

    # Step 7: print the same findings as text. Note: the "124" in the next heading is typed
    # into the text. The real number of tier-1 cases is len(tier1), printed at the top.
    print("\n" + "-" * 78)
    print("SCORED on 124 externally-labelled cases")
    print("-" * 78)
    for k in ("precision", "recall", "f1", "accuracy"):
        print(f"  {k:10s} {scored[k]}")
    print(f"  TP={scored['tp']} FP={scored['fp']} FN={scored['fn']} TN={scored['tn']}")
    if degenerate:
        print(f"\n  ** DEGENERATE: {payload['degenerate_note']}")

    print(f"\nResults saved to: {OUT_PATH}")


if __name__ == "__main__":
    main()
