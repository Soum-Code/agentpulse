"""Tool-Claim Validator Empirical Benchmark.

Evaluates the deterministic, pattern-based tool-claim validator
(`backend/app/services/tool_claim.py`) across categories covering its three
documented mismatch types (FABRICATED_TOOL, WRONG_COUNT, RESULT_DISTORTION)
plus true-negative controls that check it doesn't over-trigger, and at least
one case it is expected to miss.

Known limitation of this benchmark: the validator's bugs were found and fixed
in the same session that wrote most of these cases, so a benchmark built only
from cases the fixes specifically target would trivially score perfectly.
Cases 17-18 are deliberately adversarial paraphrases the validator was never
tuned against, to keep the reported recall honest rather than self-fulfilling.

Outputs:
- experiments/results/tool_claim_benchmark_results.json
"""

# WHAT THIS FILE IS FOR
# A small test of the "tool claim" check in backend/app/services/tool_claim.py. A tool claim is
# something an agent says about a tool, for example "we retrieved 3 records". The check compares
# that sentence with the tool calls that really happened. Here, each test case is one sentence
# plus a list of real tool calls plus a hand-written answer: should the check raise a flag?
# The script runs the check on every case, counts right and wrong verdicts, and prints
# precision, recall and F1 (explained near the end). The cases are written by hand, not taken
# from real agents, so the score is only a rough guide (see the note in the docstring above).
#
# HOW IT FITS IN
# Run by hand: python experiments/tool_claim_benchmark.py. It imports evaluate_tool_claims and
# ToolCallRecord from the backend and writes a JSON file under experiments/results/.
# Nothing in the app imports this file.

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure modules are importable
import sys
# The three paths below let this script import "app" (in backend/), the SDK (in sdk/src) and
# top-level folders of the repo, even though the script lives in experiments/.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.tool_claim import evaluate_tool_claims, ToolCallRecord


# Runs every hand-written case through the validator, prints the scores and saves them to a
# JSON file. Takes no input. Returns the same data that it saves (a dict).
def run_tool_claim_benchmark() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE TOOL-CLAIM VALIDATOR EMPIRICAL BENCHMARK")
    print("=" * 64)

    # Each case is a dict with:
    #   id / category : a name, and the group it belongs to (used in the printed report).
    #   claim         : the sentence an agent might write in its answer.
    #   tool_records  : the tool calls that REALLY happened (name, how many results, status).
    #   expected_failure : True if the validator should flag this case, False if it should not.
    test_cases = [
        # ─── WRONG_COUNT: exact tool-name match ────────────────────────
        {
            "id": "tc_exact_count_ok",
            "category": "WRONG_COUNT (exact match)",
            "claim": "We queried the search tool and retrieved 3 records.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=3, status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_exact_count_mismatch",
            "category": "WRONG_COUNT (exact match)",
            "claim": "We queried the search tool and retrieved 14 records.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=3, status="success")],
            "expected_failure": True,
        },
        # ─── WRONG_COUNT: partial/substring tool-name match ────────────
        # Regression cases for the bug where the partial-match branch skipped
        # the count check entirely (fixed this session, see tool_claim.py
        # _check_count_mismatch).
        {
            "id": "tc_partial_count_mismatch",
            "category": "WRONG_COUNT (partial match)",
            "claim": "We queried the customer database and retrieved 14 records.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": True,
        },
        {
            "id": "tc_partial_count_ok",
            "category": "WRONG_COUNT (partial match)",
            "claim": "We queried the customer database and retrieved 3 records.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": False,
        },
        # ─── FABRICATED_TOOL ────────────────────────────────────────────
        {
            "id": "tc_fabricated_unrelated_tool",
            "category": "FABRICATED_TOOL",
            "claim": "We invoked remote_server_reboot tool to restart cluster node 4.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": True,
        },
        {
            "id": "tc_fabricated_no_tool_calls",
            "category": "FABRICATED_TOOL",
            "claim": "Retrieved 12 records from the database.",
            "tool_records": [],
            "expected_failure": True,
        },
        {
            "id": "tc_fabricated_wrong_tool_name",
            "category": "FABRICATED_TOOL",
            "claim": "Executed the calculator tool to compute variance.",
            "tool_records": [ToolCallRecord(tool_name="database_lookup", status="success")],
            "expected_failure": True,
        },
        # ─── RESULT_DISTORTION: false success claim ────────────────────
        # Regression case for the previously-unimplemented mismatch type: the
        # validator extracted zero claims from "executed without any error"
        # phrasing (doesn't match the tool-name+keyword template), so a false
        # claim of success on an errored tool call went undetected entirely.
        {
            "id": "tc_false_success_claim",
            "category": "RESULT_DISTORTION",
            "claim": "The backup script executed without any error.",
            "tool_records": [ToolCallRecord(tool_name="backup_script", status="error", result_summary="DiskFull")],
            "expected_failure": True,
        },
        {
            "id": "tc_true_success_claim",
            "category": "RESULT_DISTORTION",
            "claim": "The backup script ran successfully.",
            "tool_records": [ToolCallRecord(tool_name="backup_script", status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_error_no_success_claim",
            "category": "RESULT_DISTORTION",
            "claim": "The backup script did not complete. Trying an alternate path next.",
            "tool_records": [ToolCallRecord(tool_name="backup_script", status="error", result_summary="DiskFull")],
            "expected_failure": False,
        },
        {
            "id": "tc_multi_tool_mixed_outcome",
            "category": "RESULT_DISTORTION",
            "claim": "The search completed successfully and the backup script also finished without any error.",
            "tool_records": [
                ToolCallRecord(tool_name="search", result_count=5, status="success"),
                ToolCallRecord(tool_name="backup_script", status="error", result_summary="DiskFull"),
            ],
            "expected_failure": True,
        },
        # ─── Anonymous / paraphrased count claims ──────────────────────
        {
            "id": "tc_paraphrased_count_ok",
            "category": "Paraphrase (anonymous count)",
            "claim": "The batch pipeline finished processing all 500 records.",
            "tool_records": [ToolCallRecord(tool_name="batch_pipeline", result_count=500, status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_paraphrased_count_mismatch",
            "category": "Paraphrase (anonymous count)",
            "claim": "Altogether, 7 publications were identified.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=2, status="success")],
            "expected_failure": True,
        },
        # ─── Zero-count edge cases ──────────────────────────────────────
        {
            "id": "tc_zero_count_ok",
            "category": "Edge case (zero count)",
            "claim": "The search tool found 0 results matching the filter.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=0, status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_zero_count_mismatch",
            "category": "Edge case (zero count)",
            "claim": "The search tool found 3 results matching the filter.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=0, status="success")],
            "expected_failure": True,
        },
        # ─── True negatives: nothing to flag ───────────────────────────
        {
            "id": "tc_no_claims_no_tools",
            "category": "True negative",
            "claim": "Based on general knowledge, transformers use self-attention.",
            "tool_records": [],
            "expected_failure": False,
        },
        {
            "id": "tc_ambiguous_natural_language",
            "category": "True negative",
            "claim": "We reviewed several relevant documents.",
            "tool_records": [ToolCallRecord(tool_name="search", result_count=4, status="success")],
            "expected_failure": False,
        },
        # ─── Known misses: adversarial paraphrases ─────────────────────
        # Not tuned against — included to keep recall honest rather than
        # reporting a perfect score on a self-selected, already-fixed set.
        # Both cases below are labelled "flag this" but are expected to be missed: the wording
        # gives the validator no digit count to compare and no success phrase to match. Such a
        # miss counts as a false negative (fn).
        {
            "id": "tc_known_miss_semantic_paraphrase",
            "category": "Known limitation (untuned paraphrase)",
            "claim": "The audit tool gave everything a clean bill of health.",
            "tool_records": [ToolCallRecord(tool_name="audit_tool", status="error", result_summary="3 critical findings")],
            "expected_failure": True,
        },
        {
            "id": "tc_known_miss_implicit_count",
            "category": "Known limitation (untuned paraphrase)",
            "claim": "Every one of the fourteen customer records came back clean.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": True,
        },
    ]

    # Four counters, one for each kind of verdict (together called a "confusion matrix"):
    #   tp (true positive)  = the validator flagged the case, and it should have.
    #   fp (false positive) = flagged, but it should not have been (a false alarm).
    #   fn (false negative) = not flagged, but it should have been (a miss).
    #   tn (true negative)  = not flagged, and it should not have been.
    tp, fp, fn, tn = 0, 0, 0, 0
    # Start a timer so that we can report the average time per case at the end.
    t0 = time.perf_counter()

    results = []
    for tc in test_cases:
        # Step 1: run the real validator on the sentence and the real tool calls.
        res = evaluate_tool_claims(tc["claim"], tc["tool_records"])
        # Step 2: the score is the share of claims that did not match (0.0 to 1.0). A case
        # counts as "flagged" when at least half of its claims are mismatches.
        pred_failure = res.tool_claim_score >= 0.50
        actual_failure = tc["expected_failure"]

        # Step 3: compare with the hand-written answer and add 1 to exactly one counter.
        if pred_failure and actual_failure: tp += 1
        elif pred_failure and not actual_failure: fp += 1
        elif not pred_failure and actual_failure: fn += 1
        else: tn += 1

        # Keep one record per case so the saved file shows exactly what happened.
        results.append({
            "case_id": tc["id"],
            "category": tc["category"],
            "tool_claim_score": res.tool_claim_score,
            "total_claims": res.total_claims,
            "mismatches": res.mismatches,
            "detected_as_failure": pred_failure,
            "ground_truth_failure": actual_failure,
            "correct": pred_failure == actual_failure,
        })

    # Average time per case in milliseconds: total seconds since t0, times 1000, divided by
    # the number of cases.
    lat = (time.perf_counter() - t0) * 1000.0 / len(test_cases)
    # Precision: of the cases the validator flagged, how many really needed a flag.
    # Recall: of the cases that needed a flag, how many the validator caught.
    # F1: one number that mixes both (their harmonic mean), low if either one is low.
    # Each "if ... else 0.0" avoids dividing by zero when there is nothing to divide by.
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

    # Everything that goes into the saved JSON file. The scores and the latency are rounded.
    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "total_test_cases": len(test_cases),
        "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "precision": round(prec, 3),
        "recall": round(rec, 3),
        "f1_score": round(f1, 3),
        "avg_latency_ms": round(lat, 4),
        "results": results,
    }

    # Save to experiments/results/, creating the folder first if it does not exist yet.
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "tool_claim_benchmark_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    print(f"\nTool-claim benchmark complete. Precision: {prec:.3f} | Recall: {rec:.3f} | F1: {f1:.3f} | Latency: {lat:.4f}ms")
    print(f"Confusion matrix: TP={tp} FP={fp} FN={fn} TN={tn}")
    # List the cases where the validator's verdict differed from the hand-written answer.
    misses = [r for r in results if not r["correct"]]
    if misses:
        print(f"\nMissed cases ({len(misses)}):")
        for m in misses:
            print(f"  {m['case_id']} ({m['category']}): predicted={m['detected_as_failure']} actual={m['ground_truth_failure']}")
    print(f"Results saved to: {res_json_path}")
    return out_payload


# Only run the benchmark when this file is started directly, not when it is imported.
if __name__ == "__main__":
    run_tool_claim_benchmark()
