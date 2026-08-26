"""Inter-Agent Disagreement Engine Empirical Benchmark.

Evaluates `backend/app/services/disagreement.py` against a constructed
multi-agent benchmark dataset (`datasets/v1.0_multiagent.json`).

Why this exists: THRESHOLD_ANALYSIS.md notes that ablation Config E
(NLI + inter-agent disagreement) "produced metrics identical to Config B
(NLI only), i.e. the additional signal never changed a decision on this
dataset" -- because v1.0_dev/val/test cases are single-agent (evidence + one
claim), so the only pair available to the disagreement engine is
(evidence -> claim), the same comparison Config B already makes. The engine
was therefore never actually exercised. This benchmark exercises it.

METHODOLOGY -- three separate measurements, deliberately not conflated:

1. HEADLINE (`current_wiring`): simulates exactly what evaluator.py does today
   -- each agent compared against its IMMEDIATE UPSTREAM only, one direction
   (upstream=premise, current=hypothesis), default threshold 0.6. This is the
   honest measure of the shipped engine.

2. DIAGNOSTIC A (`labeled_pair_forward`): scores the specific pair the dataset
   labels as contradicting, in the forward direction, even when those two
   agents are not adjacent and so are never compared by the current wiring.
   Purpose: distinguish an ARCHITECTURAL miss (pair never compared) from a
   MODEL miss (pair compared, NLI didn't detect it). Only an architectural
   miss would justify implementing N-way comparison.

3. DIAGNOSTIC B (`labeled_pair_reverse`): the same labeled pair with premise
   and hypothesis swapped. NLI is not symmetric, but that is a theoretical
   property, not a reason to change code. Purpose: detect whether real
   DIRECTIONAL false negatives exist (reverse detects what forward misses).

Diagnostics call the unmodified engine with different arguments. No engine
code is changed by this script, and diagnostics are NOT folded into the
headline precision/recall.

Outputs:
- experiments/results/disagreement_benchmark_results.json
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure modules are importable (same pattern as ablation.py / tool_claim_benchmark.py)
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.disagreement import (
    RELEVANCE_FLOOR,
    evaluate_inter_agent_disagreement,
    evaluate_trace_disagreements,
)
from app.services.grounding import load_models, models_loaded

DISAGREEMENT_THRESHOLD = 0.6  # engine default (disagreement.py), not tuned here

# Configurations compared, so each fix's effect is isolated rather than
# reported as one lumped improvement:
#   baseline    - adjacent-only, no relevance gate (the originally shipped engine)
#   gate_only   - adjacent-only + relevance gate
#   nway_gated  - all-pairs + relevance gate (current engine default)
CONFIGURATIONS = ("baseline", "gate_only", "nway_gated")


def load_multiagent_cases() -> List[Dict[str, Any]]:
    path = Path(__file__).parent.parent / "datasets" / "v1.0_multiagent.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


def calculate_metrics(tp: int, fp: int, fn: int, tn: int) -> Dict[str, Any]:
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    return {
        "precision": round(prec, 3),
        "recall": round(rec, 3),
        "f1_score": round(f1, 3),
        "fpr": round(fpr, 3),
        "fnr": round(fnr, 3),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def _output_for(case: Dict[str, Any], agent_id: str) -> Optional[str]:
    for ao in case["agent_outputs"]:
        if ao["agent_id"] == agent_id:
            return ao["output"]
    return None


def score_adjacent(case: Dict[str, Any], relevance_floor: float) -> Dict[str, Any]:
    """Adjacent-upstream-only, single direction -- exactly evaluator.py's behaviour.

    evaluator.py passes `upstream_output`/`upstream_agent_id` (the immediately
    preceding agent) as source and the current span's agent as target. A trace
    with N agents therefore produces N-1 comparisons, and any non-adjacent pair
    is never compared at all.

    `relevance_floor=0.0` disables the relevance gate, reproducing the engine
    exactly as originally shipped.
    """
    outputs = case["agent_outputs"]
    pair_scores = []

    for i in range(1, len(outputs)):
        upstream = outputs[i - 1]
        current = outputs[i]
        res = evaluate_inter_agent_disagreement(
            source_agent_id=upstream["agent_id"],
            source_output=upstream["output"],
            target_agent_id=current["agent_id"],
            target_output=current["output"],
            threshold=DISAGREEMENT_THRESHOLD,
            relevance_floor=relevance_floor,
        )
        if res is None:
            continue
        pair_scores.append({
            "pair": [upstream["agent_id"], current["agent_id"]],
            "score": res.disagreement_score,
            "similarity": res.semantic_similarity,
            "gated": res.gated_low_relevance,
            "flagged": res.is_disagreement,
        })

    max_score = max((p["score"] for p in pair_scores if not p["gated"]), default=0.0)
    return {
        "pairs_compared": pair_scores,
        "n_pairs_compared": len(pair_scores),
        "n_gated": sum(1 for p in pair_scores if p["gated"]),
        "max_disagreement_score": round(max_score, 4),
        "flagged": any(p["flagged"] for p in pair_scores),
    }


def score_nway(case: Dict[str, Any], relevance_floor: float) -> Dict[str, Any]:
    """All-pairs trace-level comparison via evaluate_trace_disagreements."""
    outputs = [(ao["agent_id"], ao["output"]) for ao in case["agent_outputs"]]
    res = evaluate_trace_disagreements(
        outputs,
        threshold=DISAGREEMENT_THRESHOLD,
        relevance_floor=relevance_floor,
    )
    if res is None:
        return {
            "pairs_compared": [], "n_pairs_compared": 0, "n_gated": 0,
            "max_disagreement_score": 0.0, "flagged": False,
        }
    return {
        "pairs_compared": [
            {
                "pair": [p.source_agent_id, p.target_agent_id],
                "score": p.disagreement_score,
                "similarity": p.semantic_similarity,
                "gated": p.gated_low_relevance,
                "flagged": p.is_disagreement,
            }
            for p in res.flagged_pairs
        ],
        "n_pairs_compared": res.pairs_evaluated,
        "n_gated": res.pairs_gated_low_relevance,
        "max_disagreement_score": res.max_disagreement_score,
        "flagged": res.is_disagreement,
    }


def score_config(case: Dict[str, Any], config: str) -> Dict[str, Any]:
    if config == "baseline":
        return score_adjacent(case, relevance_floor=0.0)
    if config == "gate_only":
        return score_adjacent(case, relevance_floor=RELEVANCE_FLOOR)
    if config == "nway_gated":
        return score_nway(case, relevance_floor=RELEVANCE_FLOOR)
    raise ValueError(f"unknown configuration: {config}")


def score_labeled_pair(case: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Diagnostics A + B: score the labeled contradicting pair both directions.

    Returns None for cases with no labeled contradicting pair (true negatives).
    """
    pair = case.get("contradicting_pair")
    if not pair:
        return None

    src_id, tgt_id = pair
    src_out = _output_for(case, src_id)
    tgt_out = _output_for(case, tgt_id)
    if src_out is None or tgt_out is None:
        return None

    fwd = evaluate_inter_agent_disagreement(
        source_agent_id=src_id, source_output=src_out,
        target_agent_id=tgt_id, target_output=tgt_out,
        threshold=DISAGREEMENT_THRESHOLD,
    )
    rev = evaluate_inter_agent_disagreement(
        source_agent_id=tgt_id, source_output=tgt_out,
        target_agent_id=src_id, target_output=src_out,
        threshold=DISAGREEMENT_THRESHOLD,
    )
    if fwd is None or rev is None:
        return None

    return {
        "pair": [src_id, tgt_id],
        "forward_score": fwd.disagreement_score,
        "forward_flagged": fwd.is_disagreement,
        "reverse_score": rev.disagreement_score,
        "reverse_flagged": rev.is_disagreement,
        "directional_gap": round(abs(fwd.disagreement_score - rev.disagreement_score), 4),
    }


def run_disagreement_benchmark() -> Dict[str, Any]:
    print("=" * 68)
    print("AGENTPULSE INTER-AGENT DISAGREEMENT ENGINE BENCHMARK")
    print("=" * 68)

    # Fail loud rather than silently scoring a dead pipeline. PROJECT_REPORT.md
    # Section 4 documents a 9-hour Kaggle run wasted because a failed model load
    # produced a benchmark full of fake 0.0 scores instead of an error.
    print("\nLoading evaluation models (synchronous)...")
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not (loaded["nli_model"] and loaded["nli_tokenizer"]):
        raise RuntimeError(
            f"NLI model/tokenizer not loaded ({loaded}). Refusing to run -- "
            "every disagreement score would be a meaningless None/0.0."
        )

    cases = load_multiagent_cases()
    print(f"  Loaded {len(cases)} constructed multi-agent cases.\n")

    t_wall = time.perf_counter()

    # Run every configuration over every case so their effects are isolated.
    per_config: Dict[str, Dict[str, Any]] = {}
    case_scores: Dict[str, Dict[str, Any]] = {c["id"]: {} for c in cases}
    for config in CONFIGURATIONS:
        lat: List[float] = []
        for case in cases:
            t0 = time.perf_counter()
            case_scores[case["id"]][config] = score_config(case, config)
            lat.append((time.perf_counter() - t0) * 1000.0)
        per_config[config] = {"latencies": lat}

    # Headline metrics are reported for the current engine default.
    headline_config = "nway_gated"

    tp = fp = fn = tn = 0
    results: List[Dict[str, Any]] = []
    latencies: List[float] = per_config[headline_config]["latencies"]

    for case in cases:
        current = case_scores[case["id"]][headline_config]
        diagnostic = score_labeled_pair(case)

        predicted = current["flagged"]
        actual = case["expected_disagreement"]

        if predicted and actual: tp += 1
        elif predicted and not actual: fp += 1
        elif not predicted and actual: fn += 1
        else: tn += 1

        # Attribution: when the engine flags a labeled-contradiction case, did it
        # fire on the pair the dataset actually labels as contradicting, or on a
        # different pair? A flag raised on the wrong pair still scores as a TP in
        # the headline, but the engine did not detect the contradiction -- it
        # produced the right answer for the wrong reason. Tracked separately so
        # the headline recall isn't quietly inflated by accidents.
        attribution = None
        if predicted and actual and case.get("contradicting_pair"):
            labeled = set(case["contradicting_pair"])
            fired = [p["pair"] for p in current["pairs_compared"] if p["flagged"]]
            attribution = "correct_pair" if any(set(p) == labeled for p in fired) else "wrong_pair"

        # Classify the miss type -- this is what decides whether A2 needs N-way.
        miss_type = None
        if not predicted and actual:
            if diagnostic is None:
                miss_type = "unscored"
            elif not case.get("adjacent", False) and diagnostic["forward_flagged"]:
                miss_type = "ARCHITECTURAL (non-adjacent pair never compared)"
            elif diagnostic["forward_flagged"]:
                miss_type = "WIRING (pair adjacent and detectable, but not flagged by max rule)"
            elif diagnostic["reverse_flagged"]:
                miss_type = "DIRECTIONAL (only detected with premise/hypothesis swapped)"
            else:
                miss_type = "MODEL (NLI did not detect it in either direction)"

        results.append({
            "case_id": case["id"],
            "category": case["category"],
            "domain": case["domain"],
            "n_agents": len(case["agent_outputs"]),
            "adjacent": case.get("adjacent"),
            "ground_truth_disagreement": actual,
            "current_wiring": current,
            "labeled_pair_diagnostic": diagnostic,
            "predicted_disagreement": predicted,
            "correct": predicted == actual,
            "miss_type": miss_type,
            "attribution": attribution,
            "all_configurations": {
                cfg: {
                    "flagged": case_scores[case["id"]][cfg]["flagged"],
                    "max_disagreement_score": case_scores[case["id"]][cfg]["max_disagreement_score"],
                    "n_pairs_compared": case_scores[case["id"]][cfg]["n_pairs_compared"],
                    "n_gated": case_scores[case["id"]][cfg]["n_gated"],
                }
                for cfg in CONFIGURATIONS
            },
        })

    wall_s = time.perf_counter() - t_wall
    metrics = calculate_metrics(tp, fp, fn, tn)

    # Aggregate the two diagnostics across all labeled-contradiction cases.
    diags = [r["labeled_pair_diagnostic"] for r in results if r["labeled_pair_diagnostic"]]
    architectural_misses = [r["case_id"] for r in results if r["miss_type"] and r["miss_type"].startswith("ARCHITECTURAL")]
    directional_misses = [r["case_id"] for r in results if r["miss_type"] and r["miss_type"].startswith("DIRECTIONAL")]
    model_misses = [r["case_id"] for r in results if r["miss_type"] and r["miss_type"].startswith("MODEL")]
    wrong_pair_tps = [r["case_id"] for r in results if r["attribution"] == "wrong_pair"]

    # Strict recall: a labeled contradiction only counts as detected if the engine
    # flagged it AND fired on the labeled contradicting pair.
    strict_tp = sum(1 for r in results if r["attribution"] == "correct_pair")
    strict_fn = sum(
        1 for r in results
        if r["ground_truth_disagreement"] and r["attribution"] != "correct_pair"
    )
    strict_recall = strict_tp / (strict_tp + strict_fn) if (strict_tp + strict_fn) > 0 else 0.0

    # Per-configuration comparison table (isolates each fix's contribution).
    config_metrics = {}
    for cfg in CONFIGURATIONS:
        c_tp = c_fp = c_fn = c_tn = 0
        for case in cases:
            pred = case_scores[case["id"]][cfg]["flagged"]
            act = case["expected_disagreement"]
            if pred and act: c_tp += 1
            elif pred and not act: c_fp += 1
            elif not pred and act: c_fn += 1
            else: c_tn += 1
        lat = per_config[cfg]["latencies"]
        config_metrics[cfg] = {
            **calculate_metrics(c_tp, c_fp, c_fn, c_tn),
            "mean_latency_ms": round(sum(lat) / len(lat), 2),
            "median_latency_ms": round(sorted(lat)[len(lat) // 2], 2),
            "total_pairs_compared": sum(
                case_scores[c["id"]][cfg]["n_pairs_compared"] for c in cases
            ),
            "total_pairs_gated": sum(
                case_scores[c["id"]][cfg]["n_gated"] for c in cases
            ),
        }

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "engine_state": f"headline configuration = {headline_config} (current engine default)",
        "dataset": "v1.0_multiagent (constructed benchmark, not production-collected)",
        "total_cases": len(cases),
        "threshold": DISAGREEMENT_THRESHOLD,
        "relevance_floor": RELEVANCE_FLOOR,
        "evaluation_models_confirmed_loaded": loaded,
        "configuration_comparison": config_metrics,
        "headline_current_wiring": metrics,
        "latency_ms_per_case": {
            "mean": round(sum(latencies) / len(latencies), 2),
            "median": round(sorted(latencies)[len(latencies) // 2], 2),
            "min": round(min(latencies), 2),
            "max": round(max(latencies), 2),
        },
        "total_wall_time_seconds": round(wall_s, 1),
        "diagnostics": {
            "labeled_pairs_scored": len(diags),
            "forward_detected": sum(1 for d in diags if d["forward_flagged"]),
            "reverse_detected": sum(1 for d in diags if d["reverse_flagged"]),
            "detected_only_in_reverse": sum(
                1 for d in diags if d["reverse_flagged"] and not d["forward_flagged"]
            ),
            "mean_directional_gap": (
                round(sum(d["directional_gap"] for d in diags) / len(diags), 4) if diags else None
            ),
            "architectural_miss_case_ids": architectural_misses,
            "directional_miss_case_ids": directional_misses,
            "model_miss_case_ids": model_misses,
            "wrong_pair_true_positives": wrong_pair_tps,
            "strict_tp": strict_tp,
            "strict_fn": strict_fn,
            "strict_recall": round(strict_recall, 3),
        },
        "results": results,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    out_path = res_dir / "disagreement_benchmark_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # ── Console summary ────────────────────────────────────────────────
    print("-" * 68)
    print("CONFIGURATION COMPARISON (each fix isolated)")
    print("-" * 68)
    print(f"  {'config':12s} {'P':>6s} {'R':>6s} {'F1':>6s} {'FPR':>6s}  {'pairs':>6s} {'gated':>6s} {'ms/case':>8s}")
    for cfg in CONFIGURATIONS:
        m = config_metrics[cfg]
        print(f"  {cfg:12s} {m['precision']:6.3f} {m['recall']:6.3f} {m['f1_score']:6.3f} "
              f"{m['fpr']:6.3f}  {m['total_pairs_compared']:6d} {m['total_pairs_gated']:6d} "
              f"{m['mean_latency_ms']:8.1f}")

    print("\n" + "-" * 68)
    print(f"HEADLINE ({headline_config} = current engine default)")
    print("-" * 68)
    print(f"  Precision: {metrics['precision']:.3f} | Recall: {metrics['recall']:.3f} | F1: {metrics['f1_score']:.3f}")
    print(f"  TP={tp} FP={fp} FN={fn} TN={tn}   (FPR={metrics['fpr']:.3f}, FNR={metrics['fnr']:.3f})")
    print(f"  Latency/case: mean {payload['latency_ms_per_case']['mean']}ms, median {payload['latency_ms_per_case']['median']}ms")

    print("\n" + "-" * 68)
    print("DIAGNOSTICS (do NOT feed the headline -- evidence for what A2 should fix)")
    print("-" * 68)
    d = payload["diagnostics"]
    print(f"  Labeled contradicting pairs scored directly: {d['labeled_pairs_scored']}")
    print(f"    detected forward:            {d['forward_detected']}")
    print(f"    detected reverse:            {d['reverse_detected']}")
    print(f"    detected ONLY in reverse:    {d['detected_only_in_reverse']}")
    print(f"    mean directional gap:        {d['mean_directional_gap']}")
    print(f"  ARCHITECTURAL misses (non-adjacent, never compared): {len(architectural_misses)} {architectural_misses}")
    print(f"  DIRECTIONAL  misses (reverse-only detection):        {len(directional_misses)} {directional_misses}")
    print(f"  MODEL        misses (NLI missed it both ways):       {len(model_misses)} {model_misses}")
    print(f"  WRONG-PAIR true positives (right answer, wrong reason): {len(wrong_pair_tps)} {wrong_pair_tps}")
    print(f"  Strict recall (must fire on the labeled pair): {d['strict_recall']:.3f} "
          f"(TP={strict_tp}, FN={strict_fn})  vs headline recall {metrics['recall']:.3f}")

    wrong = [r for r in results if not r["correct"]]
    if wrong:
        print(f"\n  All {len(wrong)} incorrect cases:")
        for r in wrong:
            print(f"    {r['case_id']:6s} [{r['category']}] pred={r['predicted_disagreement']} "
                  f"actual={r['ground_truth_disagreement']} miss={r['miss_type']}")

    print(f"\nResults saved to: {out_path}")
    return payload


if __name__ == "__main__":
    run_disagreement_benchmark()
