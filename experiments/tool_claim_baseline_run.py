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

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.tool_claim import ToolCallRecord, evaluate_tool_claims

CASES_PATH = (Path(__file__).parent.parent / "datasets" / "external" /
              "exgentic_v2" / "derived" / "tool_claim_cases.json")
OUT_PATH = Path(__file__).parent / "results" / "tool_claim_baseline_run.json"

# A case counts as "flagged" when the validator reports any mismatch.
FLAG_THRESHOLD = 0.5


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

    for case in cases:
        records = [ToolCallRecord(tool_name=name)
                   for name in case["evidence"]["tool_names_called"]]
        outcome = evaluate_tool_claims(case["summary_text"], records)

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

    scored = metrics(tp, fp, fn, tn)
    degenerate = (tp + fp) == 0

    by_cell = defaultdict(lambda: Counter())
    for r in results:
        cell = f"{r['benchmark']}/{r['harness']}"
        by_cell[cell]["cases"] += 1
        by_cell[cell]["extracted"] += bool(r["claims_extracted"])
        by_cell[cell]["flagged"] += bool(r["predicted_flag"])

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
