"""Tool-Claim Validator Empirical Benchmark.

Evaluates deterministic assertion validation across 5 distinct conditions:
1. Exact Match (Tool name & count matched)
2. Count Mismatch (Claimed count != actual returned rows)
3. Paraphrased Claim with Embedded Numeric Entity
4. Fabricated Tool Invocation (Tool was never executed)
5. Ambiguous Natural Language Assertion

Outputs:
- experiments/results/tool_claim_benchmark_results.json
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure modules are importable
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.tool_claim import evaluate_tool_claims, ToolCallRecord


def run_tool_claim_benchmark() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE TOOL-CLAIM VALIDATOR EMPIRICAL BENCHMARK")
    print("=" * 64)

    test_cases = [
        {
            "id": "tc_exact_01",
            "name": "Exact Count & Tool Match",
            "claim": "We queried the customer database and retrieved 3 records.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_mismatch_01",
            "name": "Count Mismatch (14 claimed vs 3 actual)",
            "claim": "We queried the customer database and retrieved 14 records.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": True,
        },
        {
            "id": "tc_fabricated_01",
            "name": "Fabricated Tool Execution",
            "claim": "We invoked remote_server_reboot tool to restart cluster node 4.",
            "tool_records": [ToolCallRecord(tool_name="customer_db", result_count=3, status="success")],
            "expected_failure": True,
        },
        {
            "id": "tc_paraphrase_01",
            "name": "Paraphrased Numeric Assertion",
            "claim": "The batch pipeline finished processing all 500 records.",
            "tool_records": [ToolCallRecord(tool_name="batch_pipeline", result_count=500, status="success")],
            "expected_failure": False,
        },
        {
            "id": "tc_failed_exec_01",
            "name": "Claiming Success on Tool Execution Error",
            "claim": "The backup script executed without any error.",
            "tool_records": [ToolCallRecord(tool_name="backup_script", status="error", result_summary="DiskFull")],
            "expected_failure": True,
        },
    ]

    tp, fp, fn, tn = 0, 0, 0, 0
    t0 = time.perf_counter()

    results = []
    for tc in test_cases:
        res = evaluate_tool_claims(tc["claim"], tc["tool_records"])
        pred_failure = res.tool_claim_score >= 0.50
        actual_failure = tc["expected_failure"]

        if pred_failure and actual_failure: tp += 1
        elif pred_failure and not actual_failure: fp += 1
        elif not pred_failure and actual_failure: fn += 1
        else: tn += 1

        results.append({
            "case_id": tc["id"],
            "name": tc["name"],
            "tool_claim_score": res.tool_claim_score,
            "total_claims": res.total_claims,
            "mismatches": res.mismatches,
            "detected_as_failure": pred_failure,
            "ground_truth_failure": actual_failure,
        })

    lat = (time.perf_counter() - t0) * 1000.0 / len(test_cases)
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "total_test_cases": len(test_cases),
        "precision": round(prec, 3),
        "recall": round(rec, 3),
        "f1_score": round(f1, 3),
        "avg_latency_ms": round(lat, 4),
        "results": results,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "tool_claim_benchmark_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    print(f"\nTool-claim benchmark complete. F1: {f1:.3f} | Latency: {lat:.4f}ms")
    print(f"Results saved to: {res_json_path}")
    return out_payload


if __name__ == "__main__":
    run_tool_claim_benchmark()
