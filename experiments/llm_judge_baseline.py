"""NLI Cascade vs. Generic LLM-Judge: Head-to-Head Benchmark.

Tests the claim that AgentPulse's fixed NLI cascade (MiniLM -> DeBERTa) detects
ungrounded agent claims at comparable quality to a generic LLM-as-judge, for a
fraction of the inference effort -- the central differentiator argument in
COMPETITIVE_POSITIONING.md section 5.4, which is currently a hypothesis rather
than a result.

Both systems are run over the same `v1.0_test` split against the same
`is_failure` ground truth used by experiments/ablation.py, so figures here are
directly comparable to THRESHOLD_ANALYSIS.md's Config B/G.

The judge is a local Qwen3-8B (Q4_K_M via llama.cpp) -- the same adapter and
weights already benchmarked in REASONING_STRATEGY_EVALUATION_REPORT.md. Running
locally means no API key, no external spend, and a reproducible comparison; it
also means these are *this* judge's numbers, not "LLM judges" in general.

PROVENANCE SPLIT (important, and reported separately below):
The 30 test cases are not one homogeneous set. `test_01`..`test_20` come from
the original 50 cases labelled by dual LLM-as-judge passes
(LABEL_AGREEMENT_REPORT.md); `test_21`..`test_30` were appended by
scripts/expand_dataset.py and are correct by deterministic construction.
Scoring an LLM judge against labels that were themselves produced by LLM judges
is partially circular and flatters the judge, so metrics are reported for both
subsets separately as well as overall.

Outputs:
- experiments/results/llm_judge_comparison.json
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure modules are importable (same pattern as ablation.py)
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.grounding import (
    evaluate_grounding,
    load_models,
    models_loaded,
)
from llm_adapters import get_llm_adapter

# Reuse the ablation study's helpers rather than reimplementing them.
from ablation import calculate_metrics, load_split

# Operating point for the NLI cascade, carried over unchanged from
# THRESHOLD_ANALYSIS.md's selected point (chosen on the dev split, never on test).
NLI_RISK_THRESHOLD = 0.50

JUDGE_MAX_TOKENS = 128

# Deliberately generic: this is what a team gets from an off-the-shelf judge
# prompt, not a variant tuned against this dataset. Tuning it here would make
# the comparison a measure of prompt engineering effort rather than of approach.
JUDGE_PROMPT = """You are evaluating whether an AI agent's claim is supported by the evidence it was given.

EVIDENCE:
{evidence}

AGENT CLAIM:
{claim}

Is the agent's claim fully supported by the evidence above?
Answer with exactly one word: SUPPORTED or CONTRADICTED."""


def parse_judge_verdict(text: str) -> tuple[bool, str]:
    """Map the judge's free text onto a failure prediction.

    Returns (predicted_failure, parse_status). Unparseable output is recorded
    as such rather than silently defaulting to one class -- a judge that fails
    to follow the output format is a real cost of the approach and should show
    up in the results, not be hidden by a fallback.
    """
    upper = (text or "").upper()
    has_contra = "CONTRADICT" in upper
    has_support = "SUPPORT" in upper

    if has_contra and not has_support:
        return True, "ok"
    if has_support and not has_contra:
        return False, "ok"
    if has_contra and has_support:
        # Both words present: take whichever appears first.
        return upper.index("CONTRADICT") < upper.index("SUPPORT"), "ambiguous"
    return False, "unparseable"


def case_provenance(case_id: str) -> str:
    """test_01..test_20 = LLM-judge-labelled originals; test_21+ = deterministic."""
    idx = int(case_id.rsplit("_", 1)[1])
    return "llm_judge_labelled" if idx <= 20 else "deterministic"


def summarize(values: List[float]) -> Dict[str, float]:
    """Mean alone is misleading for Qwen CPU inference -- variance is high."""
    if not values:
        return {}
    return {
        "mean": round(statistics.mean(values), 2),
        "median": round(statistics.median(values), 2),
        "stdev": round(statistics.stdev(values), 2) if len(values) > 1 else 0.0,
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


def metrics_for(records: List[Dict[str, Any]], pred_key: str) -> Dict[str, Any]:
    tp = sum(1 for r in records if r[pred_key] and r["ground_truth_failure"])
    fp = sum(1 for r in records if r[pred_key] and not r["ground_truth_failure"])
    fn = sum(1 for r in records if not r[pred_key] and r["ground_truth_failure"])
    tn = sum(1 for r in records if not r[pred_key] and not r["ground_truth_failure"])
    return calculate_metrics(tp, fp, fn, tn, 0.0)


def run_comparison() -> Dict[str, Any]:
    print("=" * 70)
    print("NLI CASCADE vs. GENERIC LLM-JUDGE -- HEAD-TO-HEAD")
    print("=" * 70)

    cases = load_split("test")
    print(f"\nDataset: v1.0_test, {len(cases)} cases")

    # ── Fail loud on both systems before measuring anything ────────────
    # PROJECT_REPORT.md section 4 documents a 9-hour run wasted because a
    # silently-failed model load produced a file full of fake 0.0 scores.
    print("\nLoading NLI evaluation models (synchronous)...")
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not (loaded["nli_model"] and loaded["nli_tokenizer"] and loaded["embedding_model"]):
        raise RuntimeError(
            f"Evaluation models not loaded ({loaded}). Refusing to run -- "
            "every NLI score would be meaningless."
        )

    print("\nLoading Qwen3-8B GGUF judge (real weights, this takes a moment)...")
    adapter = get_llm_adapter(model_name="qwen3", device="cpu", load_immediately=True)
    probe = adapter.generate_with_metadata(
        "Reply with exactly one word: SUPPORTED", max_tokens=16
    )
    print(f"  warm-up: {probe.latency_ms:.0f} ms, {probe.tokens_out} tokens out, "
          f"text={probe.text.strip()[:40]!r}")
    if not probe.text.strip():
        raise RuntimeError(
            "Judge produced empty output on warm-up. Refusing to run -- this is "
            "the stub-fallback failure mode described in REAL_MODEL_BENCHMARK_REPORT.md."
        )

    records: List[Dict[str, Any]] = []
    nli_latencies: List[float] = []
    judge_latencies: List[float] = []
    t_wall = time.perf_counter()

    for i, c in enumerate(cases, 1):
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]
        truth = c["is_failure"]

        # ── System A: AgentPulse NLI cascade ───────────────────────────
        t0 = time.perf_counter()
        g = evaluate_grounding(premise, claim)
        nli_ms = (time.perf_counter() - t0) * 1000.0
        nli_latencies.append(nli_ms)
        nli_score = g.grounding_score if g else None
        nli_pred = bool(nli_score is not None and nli_score >= NLI_RISK_THRESHOLD)

        # ── System B: generic LLM judge ────────────────────────────────
        res = adapter.generate_with_metadata(
            JUDGE_PROMPT.format(evidence=premise, claim=claim),
            max_tokens=JUDGE_MAX_TOKENS,
            dataset_version="v1.0_test",
        )
        judge_latencies.append(res.latency_ms)
        judge_pred, parse_status = parse_judge_verdict(res.text)

        records.append({
            "case_id": c["id"],
            "provenance": case_provenance(c["id"]),
            "domain": c.get("domain"),
            "ground_truth_failure": truth,
            "nli_grounding_score": round(nli_score, 4) if nli_score is not None else None,
            "nli_stage": g.evaluation_stage if g else None,
            "nli_predicted_failure": nli_pred,
            "nli_latency_ms": round(nli_ms, 2),
            "judge_raw_output": res.text.strip()[:200],
            "judge_parse_status": parse_status,
            "judge_predicted_failure": judge_pred,
            "judge_latency_ms": round(res.latency_ms, 2),
            "judge_tokens_in": res.tokens_in,
            "judge_tokens_out": res.tokens_out,
        })

        mark = "OK " if nli_pred == truth else "NLI"
        mark += "/OK " if judge_pred == truth else "/JDG"
        print(f"  [{i:2d}/{len(cases)}] {c['id']:8s} truth={str(truth):5s} "
              f"nli={str(nli_pred):5s} judge={str(judge_pred):5s} "
              f"({res.latency_ms/1000:5.1f}s) {mark}")

    wall_s = time.perf_counter() - t_wall

    # ── Degenerate-output guard ────────────────────────────────────────
    # A judge that answers the same way every time can still post a plausible
    # accuracy on an unbalanced split. Surface it rather than reporting F1 alone.
    judge_preds = [r["judge_predicted_failure"] for r in records]
    nli_scores = [r["nli_grounding_score"] for r in records if r["nli_grounding_score"] is not None]
    degenerate = {
        "judge_predicted_all_same": len(set(judge_preds)) == 1,
        "judge_positive_rate": round(sum(judge_preds) / len(judge_preds), 3),
        "judge_unparseable": sum(1 for r in records if r["judge_parse_status"] == "unparseable"),
        "judge_ambiguous": sum(1 for r in records if r["judge_parse_status"] == "ambiguous"),
        "nli_distinct_scores": len(set(nli_scores)),
        "nli_all_zero": all(s == 0.0 for s in nli_scores) if nli_scores else True,
    }
    if degenerate["nli_all_zero"]:
        raise RuntimeError("Every NLI score is 0.0 -- the flat-zero failure mode. Refusing to report.")

    subsets = {
        "overall": records,
        "deterministic": [r for r in records if r["provenance"] == "deterministic"],
        "llm_judge_labelled": [r for r in records if r["provenance"] == "llm_judge_labelled"],
    }
    comparison = {
        name: {
            "n_cases": len(subset),
            "nli_cascade": metrics_for(subset, "nli_predicted_failure"),
            "llm_judge": metrics_for(subset, "judge_predicted_failure"),
        }
        for name, subset in subsets.items()
    }

    total_tokens_out = sum(r["judge_tokens_out"] or 0 for r in records)
    total_tokens_in = sum(r["judge_tokens_in"] or 0 for r in records)

    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "dataset": "v1.0_test",
        "n_cases": len(cases),
        "real_inference": True,
        "evaluation_models_confirmed_loaded": loaded,
        "judge": {
            "model_id": adapter.model_id,
            "provider": probe.provider,
            "runtime": probe.runtime,
            "device": probe.device,
            "quantization": probe.quantization,
            "max_tokens": JUDGE_MAX_TOKENS,
            "temperature": probe.temperature,
            "seed": probe.seed,
            "prompt": JUDGE_PROMPT,
            "warmup_ms": round(probe.latency_ms, 2),
        },
        "nli_cascade": {
            "risk_threshold": NLI_RISK_THRESHOLD,
            "models": "sentence-transformers/all-MiniLM-L6-v2 + cross-encoder/nli-deberta-v3-small",
        },
        "output_sanity_checks": degenerate,
        "comparison": comparison,
        "inference_effort": {
            "nli_latency_ms": summarize(nli_latencies),
            "judge_latency_ms": summarize(judge_latencies),
            "judge_generation_tokens_out_total": total_tokens_out,
            "judge_prompt_tokens_in_total": total_tokens_in,
            "judge_generation_tokens_out_mean": round(total_tokens_out / len(records), 1),
            "nli_generation_tokens": 0,
            "total_wall_time_seconds": round(wall_s, 1),
        },
        "results": records,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    out_path = res_dir / "llm_judge_comparison.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # ── Console summary ────────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("DETECTION QUALITY")
    print("-" * 70)
    print(f"  {'subset':22s} {'n':>3s}  {'system':12s} {'P':>6s} {'R':>6s} {'F1':>6s} {'FPR':>6s}")
    for name, block in comparison.items():
        for sysname, key in (("NLI cascade", "nli_cascade"), ("LLM judge", "llm_judge")):
            m = block[key]
            print(f"  {name:22s} {block['n_cases']:3d}  {sysname:12s} "
                  f"{m['precision']:6.3f} {m['recall']:6.3f} {m['f1_score']:6.3f} {m['fpr']:6.3f}")

    print("\n" + "-" * 70)
    print("INFERENCE EFFORT")
    print("-" * 70)
    n_lat = payload["inference_effort"]["nli_latency_ms"]
    j_lat = payload["inference_effort"]["judge_latency_ms"]
    print(f"  NLI cascade  latency ms: mean {n_lat['mean']:>9.2f} median {n_lat['median']:>9.2f} "
          f"stdev {n_lat['stdev']:>9.2f} (min {n_lat['min']}, max {n_lat['max']})")
    print(f"  LLM judge    latency ms: mean {j_lat['mean']:>9.2f} median {j_lat['median']:>9.2f} "
          f"stdev {j_lat['stdev']:>9.2f} (min {j_lat['min']}, max {j_lat['max']})")
    print(f"  Judge generation tokens: {total_tokens_out} total, "
          f"{payload['inference_effort']['judge_generation_tokens_out_mean']} mean/case")
    print(f"  NLI generation tokens:   0 (classification, not generation)")
    print(f"  Total wall time: {wall_s:.1f}s")

    print("\n  Output sanity: judge positive rate "
          f"{degenerate['judge_positive_rate']}, unparseable {degenerate['judge_unparseable']}, "
          f"ambiguous {degenerate['judge_ambiguous']}, NLI distinct scores {degenerate['nli_distinct_scores']}")
    print(f"\nResults saved to: {out_path}")
    return payload


if __name__ == "__main__":
    run_comparison()
