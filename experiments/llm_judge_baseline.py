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

# What this file is for: it checks two ways of catching claims that the evidence does not
# support, on the same 30 test cases. System A is AgentPulse's own scoring
# (evaluate_grounding): MiniLM similarity and then a DeBERTa NLI model, always both, with no
# threshold between them. The NLI result is the score. System B is a local LLM (Qwen3-8B) that
# is asked "SUPPORTED or CONTRADICTED?". For each system the script counts hits and misses
# (precision, recall, F1, false positive rate) and the time spent, then saves them to JSON.
# NLI = a model that says if one sentence follows from another.
#
# How it fits in: run by hand (python experiments/llm_judge_baseline.py); nothing imports it.
# It imports calculate_metrics and load_split from ablation.py, the scoring code from
# backend/app/services/grounding.py and the adapters from llm_adapters/. The result file is
# written up in LLM_JUDGE_COMPARISON_REPORT.md.

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure modules are importable (same pattern as ablation.py)
# The three lines below add the backend folder (package "app"), the SDK source folder and the
# repo root (packages "llm_adapters" and "demo") to Python's search path.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# load_models loads the two scoring models; models_loaded says which of them are ready.
from app.services.grounding import (
    evaluate_grounding,
    load_models,
    models_loaded,
)
from llm_adapters import get_llm_adapter

# Reuse the ablation study's helpers rather than reimplementing them.
# (load_split reads datasets/v1.0_<split>.json. calculate_metrics turns the counts of true
# positives, false positives, false negatives and true negatives into precision, recall, etc.)
from ablation import calculate_metrics, load_split

# A claim is predicted to be a failure when its grounding score is at or above this value.
# The score is a risk number: 0 = supported by the evidence, 1 = not supported.
# Operating point for the NLI cascade, carried over unchanged from
# THRESHOLD_ANALYSIS.md's selected point (chosen on the dev split, never on test).
NLI_RISK_THRESHOLD = 0.50

# The most tokens (small pieces of words) the judge may write for one answer. The prompt below
# asks for a single word.
JUDGE_MAX_TOKENS = 128

# Deliberately generic: this is what a team gets from an off-the-shelf judge
# prompt, not a variant tuned against this dataset. Tuning it here would make
# the comparison a measure of prompt engineering effort rather than of approach.
# {evidence} and {claim} are blanks. run_comparison fills them in with str.format for each case.
# parse_judge_verdict then looks for the words SUPPORTED or CONTRADICTED in the reply.
JUDGE_PROMPT = """You are evaluating whether an AI agent's claim is supported by the evidence it was given.

EVIDENCE:
{evidence}

AGENT CLAIM:
{claim}

Is the agent's claim fully supported by the evidence above?
Answer with exactly one word: SUPPORTED or CONTRADICTED."""


# In: the judge's reply text. Out: (predicted_failure, parse_status). True means "the judge
# says the claim is NOT supported". parse_status is "ok", "ambiguous" or "unparseable".
def parse_judge_verdict(text: str) -> tuple[bool, str]:
    """Map the judge's free text onto a failure prediction.

    Returns (predicted_failure, parse_status). Unparseable output is recorded
    as such rather than silently defaulting to one class -- a judge that fails
    to follow the output format is a real cost of the approach and should show
    up in the results, not be hidden by a fallback.
    """
    # Upper-case the reply so the match ignores case. "text or ''" copes with a None reply.
    # The two tests are substring tests: "CONTRADICT" also matches CONTRADICTED, and "SUPPORT"
    # matches SUPPORTED, UNSUPPORTED and NOT SUPPORTED too, so the last two read as "supported".
    upper = (text or "").upper()
    has_contra = "CONTRADICT" in upper
    has_support = "SUPPORT" in upper

    # Only the word CONTRADICT: a clear "failure" answer.
    if has_contra and not has_support:
        return True, "ok"
    # Only the word SUPPORT: a clear "no failure" answer.
    if has_support and not has_contra:
        return False, "ok"
    if has_contra and has_support:
        # Both words present: take whichever appears first.
        # index() is the position of the word in the text. If CONTRADICT comes first the
        # comparison is True (failure), otherwise False. The status "ambiguous" is saved.
        return upper.index("CONTRADICT") < upper.index("SUPPORT"), "ambiguous"
    # Neither word: the prediction is False (not a failure) and the status says
    # "unparseable". The status is saved so these cases can be counted (see "degenerate" in
    # run_comparison), but the metrics still treat the case as a "no failure" prediction.
    return False, "unparseable"


# Says which group a test case belongs to. The ids look like "test_07". The group matters
# because the labels of the two groups were made in different ways (see the top docstring).
def case_provenance(case_id: str) -> str:
    """test_01..test_20 = LLM-judge-labelled originals; test_21+ = deterministic."""
    # rsplit("_", 1) cuts at the last underscore; [1] is the number part; int() makes "07" 7.
    idx = int(case_id.rsplit("_", 1)[1])
    return "llm_judge_labelled" if idx <= 20 else "deterministic"


# In: a list of numbers (times in ms). Out: mean, median, standard deviation, min and max,
# rounded to 2 decimals, or an empty dict for an empty list.
def summarize(values: List[float]) -> Dict[str, float]:
    """Mean alone is misleading for Qwen CPU inference -- variance is high."""
    if not values:
        return {}
    # statistics.stdev needs at least 2 numbers, so a single value gets a stdev of 0.0.
    return {
        "mean": round(statistics.mean(values), 2),
        "median": round(statistics.median(values), 2),
        "stdev": round(statistics.stdev(values), 2) if len(values) > 1 else 0.0,
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


# In: the per-case records, and the name of the field that holds one system's prediction
# ("nli_predicted_failure" or "judge_predicted_failure"). Out: precision, recall, F1 and so on.
def metrics_for(records: List[Dict[str, Any]], pred_key: str) -> Dict[str, Any]:
    # Count how the prediction compares with the real label of each case:
    #   tp = predicted failure and it was a failure;  fp = predicted failure but it was fine;
    #   fn = predicted fine but it was a failure;     tn = predicted fine and it was fine.
    tp = sum(1 for r in records if r[pred_key] and r["ground_truth_failure"])
    fp = sum(1 for r in records if r[pred_key] and not r["ground_truth_failure"])
    fn = sum(1 for r in records if not r[pred_key] and r["ground_truth_failure"])
    tn = sum(1 for r in records if not r[pred_key] and not r["ground_truth_failure"])
    # The last argument is a latency; 0.0 is passed because timing is reported elsewhere.
    return calculate_metrics(tp, fp, fn, tn, 0.0)


# Runs the whole comparison: check the models, run both systems on every test case, build the
# numbers, save experiments/results/llm_judge_comparison.json and print a summary. Out: the
# saved data as a dict. It raises RuntimeError rather than save results it cannot trust.
def run_comparison() -> Dict[str, Any]:
    print("=" * 70)
    print("NLI CASCADE vs. GENERIC LLM-JUDGE -- HEAD-TO-HEAD")
    print("=" * 70)

    # Step 1: read the cases of the test split (30 in the current file). Each has an id, a
    # domain, a question (input_query), the evidence, the agent's claim and the true label
    # is_failure (True = the claim is not supported by the evidence).
    cases = load_split("test")
    print(f"\nDataset: v1.0_test, {len(cases)} cases")

    # ── Fail loud on both systems before measuring anything ────────────
    # PROJECT_REPORT.md section 4 documents a 9-hour run wasted because a
    # silently-failed model load produced a file full of fake 0.0 scores.
    # Step 2: load the MiniLM and DeBERTa models and wait (sync=True). use_onnx is left at its
    # default (True): ONNX Runtime is tried first and PyTorch is the fallback. A failed load
    # is only logged by load_models, so models_loaded() is checked: all three parts (NLI model,
    # its tokenizer, embedding model) must be present or the script stops.
    print("\nLoading NLI evaluation models (synchronous)...")
    load_models(sync=True)
    loaded = models_loaded()
    print(f"  models_loaded(): {loaded}")
    if not (loaded["nli_model"] and loaded["nli_tokenizer"] and loaded["embedding_model"]):
        raise RuntimeError(
            f"Evaluation models not loaded ({loaded}). Refusing to run -- "
            "every NLI score would be meaningless."
        )

    # Step 3: load the judge. "qwen3" gives the Qwen3-8B GGUF adapter (llama.cpp). A missing
    # model file raises FileNotFoundError here (see llm_adapters/local_gguf.py).
    # The short warm-up call below does three jobs. It proves the judge writes some text (an
    # empty reply stops the script). Its settings (provider, runtime, device, quantization,
    # temperature, seed) are saved in the JSON. Its time is saved as warmup_ms and is not a
    # per-case time.
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

    # Step 4: run both systems on every case. records gets one dict per case; the two latency
    # lists get one time (ms) per case. t_wall starts the stopwatch for the whole loop.
    records: List[Dict[str, Any]] = []
    nli_latencies: List[float] = []
    judge_latencies: List[float] = []
    t_wall = time.perf_counter()

    for i, c in enumerate(cases, 1):
        # The premise is the evidence the agent saw; if a case has none, its question is used.
        # The claim is what the agent said. truth is the real label (True = a failure).
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]
        truth = c["is_failure"]

        # ── System A: AgentPulse NLI cascade ───────────────────────────
        # evaluate_grounding returns None when it gets no usable text or no model gives a
        # result. Then the score is None and the case is predicted "not a failure".
        t0 = time.perf_counter()
        g = evaluate_grounding(premise, claim)
        nli_ms = (time.perf_counter() - t0) * 1000.0
        nli_latencies.append(nli_ms)
        nli_score = g.grounding_score if g else None
        nli_pred = bool(nli_score is not None and nli_score >= NLI_RISK_THRESHOLD)

        # ── System B: generic LLM judge ────────────────────────────────
        # The prompt gets the same premise and claim. The time used is the adapter's own
        # latency_ms. dataset_version is only a label that is copied into the result.
        res = adapter.generate_with_metadata(
            JUDGE_PROMPT.format(evidence=premise, claim=claim),
            max_tokens=JUDGE_MAX_TOKENS,
            dataset_version="v1.0_test",
        )
        judge_latencies.append(res.latency_ms)
        judge_pred, parse_status = parse_judge_verdict(res.text)

        # Keep everything about this case in one dict (later turned into JSON). The judge's
        # raw reply is cut to its first 200 characters. Scores and times are rounded.
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

        # The progress line ends with one tag per system: "OK" = it matched the true label;
        # "NLI" or "JDG" = the NLI system or the judge got this case wrong (a missed failure or
        # a false alarm). So "OK /OK " means both were right.
        mark = "OK " if nli_pred == truth else "NLI"
        mark += "/OK " if judge_pred == truth else "/JDG"
        print(f"  [{i:2d}/{len(cases)}] {c['id']:8s} truth={str(truth):5s} "
              f"nli={str(nli_pred):5s} judge={str(judge_pred):5s} "
              f"({res.latency_ms/1000:5.1f}s) {mark}")

    # Seconds for the whole case loop (the warm-up is not included).
    wall_s = time.perf_counter() - t_wall

    # ── Degenerate-output guard ────────────────────────────────────────
    # A judge that answers the same way every time can still post a plausible
    # accuracy on an unbalanced split. Surface it rather than reporting F1 alone.
    # Step 5: simple checks on the outputs.
    #   judge_positive_rate = the share of cases the judge called a failure (True counts as 1);
    #   judge_unparseable / judge_ambiguous = how many replies were hard to read;
    #   nli_distinct_scores = how many different NLI scores there were (1 would be suspicious).
    # If every NLI score is 0.0 (or there is no NLI score at all) the script stops below,
    # because that points to a broken model.
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

    # Step 6: score both systems three times: on all cases, on the "deterministic" cases
    # (test_21 and up) and on the "llm_judge_labelled" cases (test_01 to test_20). See the
    # PROVENANCE SPLIT note in the top docstring for why the groups are kept apart.
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

    # Step 7: total tokens the judge read (in) and wrote (out). "or 0" turns a missing (None)
    # count into 0 so the sum works.
    total_tokens_out = sum(r["judge_tokens_out"] or 0 for r in records)
    total_tokens_in = sum(r["judge_tokens_in"] or 0 for r in records)

    # Step 8: gather everything that will be saved. real_inference is a fixed True, backed
    # by the load checks and the warm-up check near the top. The "models" text under
    # nli_cascade is typed in by hand (it matches the load_models defaults).
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
            # The NLI model only classifies, it writes no text, so this is a fixed 0.
            "nli_generation_tokens": 0,
            "total_wall_time_seconds": round(wall_s, 1),
        },
        "results": records,
    }

    # Step 9: save the JSON to experiments/results/ (an older file is overwritten).
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    out_path = res_dir / "llm_judge_comparison.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # ── Console summary ────────────────────────────────────────────────
    # Step 10: print the results. P = precision (of the cases flagged, how many were real
    # failures), R = recall (of the real failures, how many were flagged), F1 = one number
    # that mixes the two, FPR = share of good cases wrongly flagged.
    print("\n" + "-" * 70)
    print("DETECTION QUALITY")
    print("-" * 70)
    print(f"  {'subset':22s} {'n':>3s}  {'system':12s} {'P':>6s} {'R':>6s} {'F1':>6s} {'FPR':>6s}")
    for name, block in comparison.items():
        for sysname, key in (("NLI cascade", "nli_cascade"), ("LLM judge", "llm_judge")):
            m = block[key]
            print(f"  {name:22s} {block['n_cases']:3d}  {sysname:12s} "
                  f"{m['precision']:6.3f} {m['recall']:6.3f} {m['f1_score']:6.3f} {m['fpr']:6.3f}")

    # Second table: how long each system took per case, and how many tokens the judge wrote.
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


# Runs only when the file is started directly, not when another file imports it.
if __name__ == "__main__":
    run_comparison()
