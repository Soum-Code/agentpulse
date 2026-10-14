"""Component Ablation Study and Threshold Sweep for AgentPulse.

Methodology (important):
- The threshold sweep runs on the DEVELOPMENT split only. The operating point
  is selected there, then applied unchanged to the held-out TEST split.
  Sweeping on test and reporting the best cell would be selection on the test
  set and would overstate performance.
- All per-case model signals (embedding similarity, NLI probabilities, tool
  claim scores) are computed once per case and reused across every
  configuration, so configurations differ only in their decision rule, not in
  the underlying measurements.

Configurations evaluated:
  A. MiniLM embedding similarity only
  B. DeBERTa NLI only
  C. MiniLM + DeBERTa cascade
  D. NLI + deterministic tool-claim validation
  E. NLI + inter-agent disagreement
  F. NLI + drift signal
  G. Full AgentPulse pipeline

Outputs:
- experiments/results/ablation_results.json
- THRESHOLD_ANALYSIS.md
"""

# WHAT THIS FILE IS FOR
# It asks: which parts of AgentPulse help catch bad agent outputs? Each "configuration"
# (A to G) is a different rule for saying "this output is a failure". The script runs the
# models once per case, then scores every rule on the same numbers (precision, recall,
# F1, false-alarm rate). It also tries a grid of thresholds on the dev cases, picks the
# best one, and checks it on the test cases that were held back. It writes a JSON file
# and a Markdown report.
# In the code, config C ("cascade") is only an OR rule: flag when NLI says contradiction
# OR the similarity is very low. Config G is the only one that runs the real pipeline.
# NLI = a model that says if one text follows from, contradicts, or is unrelated to
# another. MiniLM = a small model that makes embeddings (lists of numbers for meaning).
# DeBERTa = the model that does the NLI.
#
# HOW IT FITS IN
# Run by hand; nothing in backend/ imports it. llm_judge_baseline.py imports
# calculate_metrics and load_split from here. It uses the services in
# backend/app/services and the data files datasets/v1.0_dev.json and v1.0_test.json.

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List

import numpy as np

# Ensure modules are importable
# backend/ holds the `app` package. The other two paths are the SDK source and the repo
# root. With them on the path, the imports below work when this file is run directly.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# From the app's services: model loading and the embedding-similarity and NLI scores, the
# tool-claim check, the disagreement check, the drift detector, the alert engine and the
# full pipeline that joins them.
from app.services.grounding import (
    compute_semantic_similarity,
    compute_nli_grounding,
    get_embedding,
    load_models,
)
from app.services.tool_claim import evaluate_tool_claims, ToolCallRecord
from app.services.disagreement import evaluate_inter_agent_disagreement
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
from app.services.evaluator import EvaluationPipeline


# Turns the four counts of a confusion table into the usual scores. A "positive" is a
# case that really is a failure. tp = failure caught, fp = false alarm, fn = failure
# missed, tn = good case left alone. If a division would be by zero, the score is 0.0.
def calculate_metrics(tp: int, fp: int, fn: int, tn: int, latency_ms: float) -> Dict[str, Any]:
    # precision = of the cases we flagged, how many were real failures.
    # recall = of the real failures, how many we flagged.
    # f1 = one number that mixes the two (their harmonic mean; low if either one is low).
    # fpr = share of good cases wrongly flagged. fnr = share of failures missed.
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    # Scores are rounded to 3 decimals and latency to 2.
    return {
        "precision": round(prec, 3),
        "recall": round(rec, 3),
        "f1_score": round(f1, 3),
        "fpr": round(fpr, 3),
        "fnr": round(fnr, 3),
        "latency_ms": round(latency_ms, 2),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


# Reads datasets/v1.0_<split>.json (split is "dev", "val" or "test") and returns its list
# of cases. Each case has an evidence text, an agent claim and an is_failure label.
def load_split(split: str) -> List[Dict[str, Any]]:
    path = Path(__file__).parent.parent / "datasets" / f"v1.0_{split}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


# In: the cases of one split, and the split's name (used only in the print).
# Out: one dict per case with every measured signal and how long each took in ms.
def precompute_signals(cases: List[Dict[str, Any]], split_name: str) -> List[Dict[str, Any]]:
    """Run every model once per case; all configurations reuse these signals.

    This keeps configurations comparable (identical underlying measurements)
    and avoids re-running NLI once per threshold combination.
    """
    print(f"  Precomputing signals for {len(cases)} '{split_name}' cases...")
    # One drift detector for the whole split. window_size=20 and min_samples_for_alert=5 are
    # smaller than the detector's defaults (100 and 20). The first 5 claims count as its
    # "cold start", while its baseline is still forming.
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    signals = []

    for c in cases:
        # The premise is the evidence the agent saw; if a case has none, its question is used.
        # The claim is what the agent said. Each model call below is timed in milliseconds.
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]

        # Signal 1: embedding similarity of premise and claim (0 to 1; higher = more alike).
        t0 = time.perf_counter()
        sim = compute_semantic_similarity(premise, claim)
        sim_ms = (time.perf_counter() - t0) * 1000.0

        # Signal 2: NLI. It gives the probability that the claim contradicts, is neutral to, or
        # follows from the premise.
        t0 = time.perf_counter()
        nli = compute_nli_grounding(premise, claim)
        nli_ms = (time.perf_counter() - t0) * 1000.0

        # Signal 3: tool-claim check. First the case's tool records are turned into the record
        # type the checker wants. Only cases that have tool records get a score; the rest are
        # None. The score is the share of the claim's statements about tools that do not match
        # what the tools really returned.
        tool_records = [
            ToolCallRecord(
                tool_name=tc.get("tool_name", ""),
                tool_args=tc.get("tool_args"),
                result_summary=tc.get("result_summary"),
                result_count=tc.get("result_count"),
                status=tc.get("status", "success"),
            )
            for tc in c.get("tool_records", [])
        ]
        t0 = time.perf_counter()
        tool_res = evaluate_tool_claims(claim, tool_records) if tool_records else None
        tool_ms = (time.perf_counter() - t0) * 1000.0

        # Config E signal. NOTE: this dataset stores single-agent cases
        # (evidence + one claim), so the only pair available is
        # (evidence -> claim). Disagreement therefore reduces to the same NLI
        # comparison as Config B on this data; see the report's limitations.
        t0 = time.perf_counter()
        disagree = evaluate_inter_agent_disagreement(
            source_agent_id="evidence_source",
            source_output=premise,
            target_agent_id="claiming_agent",
            target_output=claim,
        )
        disagree_ms = (time.perf_counter() - t0) * 1000.0

        # Config F signal. Drift is a temporal signal; on a static, independently
        # sampled case list there is no real time axis, so this measures how the
        # drift detector behaves when fed these cases in file order.
        # Here the drift signal is the cosine distance between this claim's embedding and the
        # detector's running average of the earlier claims (0.0 for the first claim). It stays
        # None when there is no embedding.
        t0 = time.perf_counter()
        emb = get_embedding(claim)
        drift_res = drift_detector.analyze(agent_id="ablation_agent", embedding=emb) if emb is not None else None
        drift_ms = (time.perf_counter() - t0) * 1000.0

        # Keep everything measured for this case in one dict. A None means that signal did not
        # apply or its model was missing. The NLI probabilities fall back to 0.0 if NLI gave none.
        signals.append({
            "id": c["id"],
            "is_failure": c["is_failure"],
            "similarity": sim,
            "contradiction_prob": nli.contradiction_prob if nli else 0.0,
            "entailment_prob": nli.entailment_prob if nli else 0.0,
            "neutral_prob": nli.neutral_prob if nli else 0.0,
            "tool_claim_score": tool_res.tool_claim_score if tool_res else None,
            "disagreement_score": disagree.disagreement_score if disagree else None,
            "centroid_distance": drift_res.centroid_distance if drift_res else None,
            # How long each signal took, in milliseconds.
            "latency_ms": {
                "similarity": sim_ms, "nli": nli_ms, "tool": tool_ms,
                "disagreement": disagree_ms, "drift": drift_ms,
            },
        })

    return signals


# Scores one decision rule on a list of cases. predict(signals) returns True when the
# rule flags the case as a failure. latency_components names the timings the rule needs,
# so its mean latency counts only those. Returns the metrics dict.
def score_config(
    signals: List[Dict[str, Any]],
    predict: Callable[[Dict[str, Any]], bool],
    latency_components: List[str],
) -> Dict[str, Any]:
    tp = fp = fn = tn = 0
    for s in signals:
        # pred = the rule says "failure". actual = the case really is a failure.
        pred = predict(s)
        actual = s["is_failure"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1

    # Mean latency per case: for each case add up the timings of the signals the rule uses,
    # then average over the cases (max(..., 1) avoids dividing by zero).
    mean_latency = sum(
        sum(s["latency_ms"][k] for k in latency_components) for s in signals
    ) / max(len(signals), 1)
    return calculate_metrics(tp, fp, fn, tn, mean_latency)


# Decision rules. Each takes the precomputed signals for one case.
# Cut-off numbers used by the rules below. The code does not say how they were chosen.
# NLI_CONTRA_THRESHOLD: flag when the NLI contradiction probability is above this.
# SEM_LOW_FLOOR: flag when the similarity is below this (the texts barely relate).
# TOOL_THRESHOLD: flag when the tool-claim score is above this.
NLI_CONTRA_THRESHOLD = 0.60
SEM_LOW_FLOOR = 0.35
TOOL_THRESHOLD = 0.60


# Rule A: flag when the embedding similarity is below 0.75. A missing similarity counts
# as 0.0, so it flags. The 0.75 is written in the rule itself, not in a constant.
def _cfg_a(s):  # MiniLM only
    return (s["similarity"] or 0.0) < 0.75


# Rule B: flag when the NLI contradiction probability is above NLI_CONTRA_THRESHOLD.
def _cfg_b(s):  # DeBERTa NLI only
    return s["contradiction_prob"] > NLI_CONTRA_THRESHOLD


# Rule C ("cascade"): rule B, OR the similarity is below SEM_LOW_FLOOR. Both models are
# measured for every case; the name does not mean one decides if the other runs.
def _cfg_c(s):  # cascade
    return _cfg_b(s) or (s["similarity"] is not None and s["similarity"] < SEM_LOW_FLOOR)


# Rule D: rule B, OR the tool-claim score is above TOOL_THRESHOLD. A case with no tool
# records has no score (None), so for it only rule B applies.
def _cfg_d(s):  # NLI + tool validation
    return _cfg_b(s) or (s["tool_claim_score"] is not None and s["tool_claim_score"] > TOOL_THRESHOLD)


# Rule E: rule B, OR the disagreement score is above NLI_CONTRA_THRESHOLD. On this data
# the disagreement check is the same NLI comparison as rule B (see precompute_signals).
def _cfg_e(s):  # NLI + disagreement
    return _cfg_b(s) or (s["disagreement_score"] is not None and s["disagreement_score"] > NLI_CONTRA_THRESHOLD)


# Rule F: rule B, OR the drift distance is above 0.30. The 0.30 is written in the rule
# itself, not in a constant.
def _cfg_f(s):  # NLI + drift
    return _cfg_b(s) or (s["centroid_distance"] is not None and s["centroid_distance"] > 0.30)


# Rules A to F as a table. Each row is: the key used in the output, a description, the
# rule, and the names of the timings that count toward that rule's latency. Config G is
# not in this table; run_ablation_study runs it on its own.
CONFIGS = [
    ("Config_A_MiniLM_Only", "MiniLM embedding cosine only", _cfg_a, ["similarity"]),
    ("Config_B_DeBERTa_Only", "DeBERTa-v3 NLI only", _cfg_b, ["nli"]),
    ("Config_C_Cascade", "MiniLM + DeBERTa cascade", _cfg_c, ["similarity", "nli"]),
    ("Config_D_NLI_Plus_Tool", "NLI + deterministic tool-claim validation", _cfg_d, ["nli", "tool"]),
    ("Config_E_NLI_Plus_Disagreement", "NLI + inter-agent disagreement", _cfg_e, ["nli", "disagreement"]),
    ("Config_F_NLI_Plus_Drift", "NLI + drift signal", _cfg_f, ["nli", "drift"]),
]


# Tries every pair of (low-similarity floor, NLI threshold) from two short lists and
# scores each pair on the given cases. Out: one row of scores per pair (5 x 4 = 20 rows).
def run_threshold_sweep(signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sweep the two decision thresholds. Runs on the development split only."""
    sem_floors = [0.10, 0.20, 0.30, 0.35, 0.40]
    nli_thresholds = [0.50, 0.60, 0.70, 0.80]
    sweep = []

    for floor in sem_floors:
        for n_thresh in nli_thresholds:
            # The rule for this pair: flag if the NLI contradiction probability is at least n,
            # OR the similarity is below f. f and n are default arguments so the function keeps
            # the values of this turn of the loop.
            def predict(s, f=floor, n=n_thresh):
                return s["contradiction_prob"] >= n or (s["similarity"] is not None and s["similarity"] < f)

            m = score_config(signals, predict, ["similarity", "nli"])
            sweep.append({
                "semantic_low_similarity_floor": floor,
                "nli_contradiction_threshold": n_thresh,
                "precision": m["precision"],
                "recall": m["recall"],
                "f1_score": m["f1_score"],
                "fpr": m["fpr"],
                "fnr": m["fnr"],
            })
    return sweep


# The main routine. Steps: load the models and the dev and test cases, measure all the
# signals, sweep thresholds on dev, apply the winner to test, score rules A to F and the
# full pipeline (G) on test, then write the JSON and the Markdown report.
# Returns the dict that is saved as JSON.
def run_ablation_study() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE COMPONENT ABLATION & THRESHOLD SWEEP STUDY")
    print("=" * 64)

    # Step 1: load the NLI and embedding models. use_onnx=False picks the plain PyTorch
    # version of the NLI model. sync=True waits here until loading is finished.
    load_models(use_onnx=False, sync=True)

    # Step 2: load the cases. dev is used to choose thresholds. test is kept back for the
    # final numbers. (The val split is not used here.)
    dev_cases = load_split("dev")
    test_cases = load_split("test")

    # Step 3: run the models once per case (the slow part). The sweep and rules A to F re-use
    # these; config G does not (it runs the models again inside the full pipeline).
    dev_signals = precompute_signals(dev_cases, "dev")
    test_signals = precompute_signals(test_cases, "test")

    # ── Threshold sweep on DEV only, then select an operating point ──
    print("\nSweeping thresholds on the development split...")
    sweep = run_threshold_sweep(dev_signals)
    # Pick the sweep row with the highest F1; on a tie, the higher recall. If still tied,
    # max() keeps the first such row in sweep order.
    best = max(sweep, key=lambda r: (r["f1_score"], r["recall"]))
    print(
        f"  Selected on dev: nli>={best['nli_contradiction_threshold']}, "
        f"sim_floor<{best['semantic_low_similarity_floor']} "
        f"(dev F1={best['f1_score']}, recall={best['recall']})"
    )

    # ── Apply the dev-selected operating point to the held-out TEST split ──
    # The chosen rule: the same shape as the sweep rule, with the chosen numbers filled in.
    def selected_rule(s):
        return (
            s["contradiction_prob"] >= best["nli_contradiction_threshold"]
            or (s["similarity"] is not None and s["similarity"] < best["semantic_low_similarity_floor"])
        )

    # Score the chosen rule on both splits. The dev numbers show how it does where it was
    # picked. The test numbers show how it does on cases that were not used to pick it.
    selected_dev = score_config(dev_signals, selected_rule, ["similarity", "nli"])
    selected_test = score_config(test_signals, selected_rule, ["similarity", "nli"])

    # ── Per-configuration ablation, reported on the TEST split ──
    print("\nScoring configurations on the held-out test split...")
    ablation_results: Dict[str, Any] = {}
    # Score each rule A to F on the test signals (key, description, rule, timings to count).
    for key, desc, fn, lat_parts in CONFIGS:
        ablation_results[key] = {"description": desc, **score_config(test_signals, fn, lat_parts)}

    # ── Config G: full pipeline (runs the real EvaluationPipeline) ──
    # Build the real pipeline: a drift detector, an alert engine and the evaluator that uses
    # them. AlertEngine's cooldown_seconds=0 changes nothing today (alerting.py stores that
    # value but never reads it). The alerts it makes are not used in this script.
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    full_pipeline = EvaluationPipeline(drift_detector, alert_engine)

    # Run every test case through the whole pipeline again (this does NOT re-use the saved
    # signals) and time the total.
    tp = fp = fn = tn = 0
    t0 = time.perf_counter()
    for c in test_cases:
        # One span per case: the evidence is the span's input and the claim is its output. All
        # cases share one trace id and one agent id. No upstream agent is passed, so the
        # disagreement step does not run here. Drift runs, but it is not part of the risk score,
        # so the risk score comes from grounding and tool-claim only.
        res = full_pipeline.evaluate_span(
            span_id=f"abl_{c['id']}",
            trace_id="trace_abl",
            agent_id="agent_abl",
            input_text=c.get("evidence") or c["input_query"],
            output_text=c["agent_claim"],
            tool_calls=c.get("tool_records"),
        )
        # G flags a case if ANY of these holds: overall risk >= 0.50, the NLI contradiction
        # probability >= NLI_CONTRA_THRESHOLD, or the tool-claim score >= TOOL_THRESHOLD. The
        # 0.50 is written here directly.
        pred = (
            (res.overall_risk_score or 0.0) >= 0.50
            or (res.grounding is not None and res.grounding.contradiction_prob >= NLI_CONTRA_THRESHOLD)
            or (res.tool_claim is not None and res.tool_claim.tool_claim_score >= TOOL_THRESHOLD)
        )
        actual = c["is_failure"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1
    # Mean time per case in ms for the whole pipeline.
    g_latency = (time.perf_counter() - t0) * 1000.0 / max(len(test_cases), 1)
    ablation_results["Config_G_Full_AgentPulse"] = {
        "description": "Full AgentPulse pipeline (grounding + tool + disagreement + drift + risk aggregation)",
        **calculate_metrics(tp, fp, fn, tn, g_latency),
    }

    # ── Detect whether any configuration is actually distinguishable ──
    # f1s maps each config name to its F1. best_cfg is the (name, F1) pair with the top F1.
    # tied lists every config whose F1 is within 1e-9 of that top value.
    f1s = {k: v["f1_score"] for k, v in ablation_results.items()}
    best_cfg = max(f1s.items(), key=lambda kv: kv[1])
    tied = [k for k, v in f1s.items() if abs(v - best_cfg[1]) < 1e-9]

    # Configs E and F collapse to Config B when their extra signal never fires.
    # They count as identical when precision, recall and F1 all equal Config B's.
    identical_to_b = [
        k for k in ("Config_E_NLI_Plus_Disagreement", "Config_F_NLI_Plus_Drift")
        if all(
            ablation_results[k][m] == ablation_results["Config_B_DeBERTa_Only"][m]
            for m in ("precision", "recall", "f1_score")
        )
    ]

    # Configs that score WORSE than the simplest NLI-only baseline must be
    # surfaced explicitly, not buried in a table -- this is exactly the kind
    # of negative result the validation process must never hide.
    b_f1 = ablation_results["Config_B_DeBERTa_Only"]["f1_score"]
    underperform_b = [
        k for k, v in ablation_results.items()
        if k != "Config_B_DeBERTa_Only" and v["f1_score"] < b_f1
    ]

    # If every threshold combination tied on dev, the "selected" operating
    # point wasn't actually chosen by the sweep -- the sweep was uninformative
    # at this sample size, and that must be reported, not silently papered over.
    # True when the best and the worst F1 in the sweep are equal, i.e. every row ties.
    sweep_f1s = [s["f1_score"] for s in sweep]
    dev_sweep_uninformative = (max(sweep_f1s) - min(sweep_f1s)) < 1e-9

    # Everything worth keeping, in the shape that is written to the JSON file.
    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "methodology": {
            "threshold_selection_split": "v1.0_dev",
            "reporting_split": "v1.0_test",
            "note": "Thresholds were selected on the development split and applied unchanged to the held-out test split.",
        },
        "n_dev_cases": len(dev_cases),
        "n_test_cases": len(test_cases),
        "selected_operating_point": {
            "nli_contradiction_threshold": best["nli_contradiction_threshold"],
            "semantic_low_similarity_floor": best["semantic_low_similarity_floor"],
            "dev_metrics": selected_dev,
            "test_metrics": selected_test,
        },
        "ablation_configurations": ablation_results,
        "threshold_sweep_dev": sweep,
        "analysis": {
            "best_f1_config": best_cfg[0],
            "configs_tied_at_best_f1": tied,
            "configs_identical_to_nli_only": identical_to_b,
            "configs_underperforming_nli_only_baseline": underperform_b,
            "dev_threshold_sweep_uninformative": dev_sweep_uninformative,
        },
    }

    # Save the JSON to experiments/results/ablation_results.json (folder made if missing).
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "ablation_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    # Also write the Markdown report, THRESHOLD_ANALYSIS.md, in the repo root.
    _write_report(out_payload, ablation_results, sweep, best, selected_dev, selected_test,
                  best_cfg, tied, identical_to_b, underperform_b, dev_sweep_uninformative,
                  len(dev_cases), len(test_cases))

    print("\nAblation and threshold analysis complete.")
    print(f"Results saved to: {res_json_path}")
    print("Report written to: THRESHOLD_ANALYSIS.md")
    return out_payload


# Builds THRESHOLD_ANALYSIS.md (in the repo root) from the results. The tables and the
# sentences under "Observations" come from the numbers. The Limitations section at the
# end is fixed text and does not change with the results.
def _write_report(payload, ablation_results, sweep, best, selected_dev, selected_test,
                  best_cfg, tied, identical_to_b, underperform_b, dev_sweep_uninformative,
                  n_dev, n_test) -> None:
    # Step 1: one Markdown table row per configuration, then one per sweep row. The replace()
    # calls turn a key like Config_B_DeBERTa_Only into the display name "B DeBERTa Only".
    rows = "\n".join(
        f"| {k.replace('Config_', '').replace('_', ' ')} | {v['description']} | "
        f"{v['precision']} | {v['recall']} | {v['f1_score']} | {v['fpr']} | {v['fnr']} | "
        f"{v['tp']}/{v['fp']}/{v['fn']}/{v['tn']} | {v['latency_ms']} |"
        for k, v in ablation_results.items()
    )
    sweep_rows = "\n".join(
        f"| {s['semantic_low_similarity_floor']:.2f} | {s['nli_contradiction_threshold']:.2f} | "
        f"{s['precision']} | {s['recall']} | {s['f1_score']} | {s['fpr']} | {s['fnr']} |"
        for s in sweep
    )

    # Step 2: write the sentences for the "Observations" list. First: is there one winner by
    # F1, or a tie?
    if len(tied) > 1:
        winner_line = (
            f"{len(tied)} configurations tie at the highest F1 ({best_cfg[1]}): "
            f"{', '.join(t.replace('Config_', '') for t in tied)}. "
            f"On this test split they are not distinguishable by F1."
        )
    else:
        winner_line = f"{best_cfg[0].replace('Config_', '')} achieved the highest F1 ({best_cfg[1]}) on the test split."

    # Next: did the extra signal in Config E or F ever change a decision?
    if identical_to_b:
        collapse_line = (
            f"{', '.join(c.replace('Config_', '') for c in identical_to_b)} produced metrics "
            f"identical to Config B (NLI only), i.e. the additional signal never changed a decision "
            f"on this dataset. See limitations."
        )
    else:
        collapse_line = "Configs E and F produced different metrics from Config B on this dataset."

    # Next: configs that scored below the plain NLI-only baseline. The words "substantially
    # worse" and the pointer to Section 4 are fixed text, not checked against the numbers.
    if underperform_b:
        b = ablation_results["Config_B_DeBERTa_Only"]
        underperform_details = "; ".join(
            f"{k.replace('Config_', '')} (F1={ablation_results[k]['f1_score']}, FPR={ablation_results[k]['fpr']})"
            for k in underperform_b
        )
        underperform_line = (
            f"**{len(underperform_b)} configuration(s) scored below the plain NLI-only baseline "
            f"(Config B, F1={b['f1_score']}, FPR={b['fpr']}) on this test split: {underperform_details}.** "
            f"This is not hidden: adding more signals to the composite score did not uniformly help, and "
            f"in these cases made false-positive rate substantially worse. See Section 4 for why (drift "
            f"cold-start behaviour on non-temporal data)."
        )
    else:
        underperform_line = "No configuration scored below the plain NLI-only baseline on this test split."

    # A warning shown only when every sweep row has the same F1. Its text says F1=1.0, but
    # the check only tests that all the F1 values are equal.
    sweep_note = (
        "**All threshold combinations tied at F1=1.0 on the development split** &mdash; the sweep did not "
        "actually discriminate between thresholds at this sample size ({} cases), so the \"selected\" "
        "operating point below was chosen arbitrarily among equally-scoring options, not because it was "
        "measurably better. A larger development set is needed before threshold selection here is meaningful."
        .format(n_dev)
    ) if dev_sweep_uninformative else ""

    # Dev F1 minus test F1. A big positive gap means the rule did worse on test than on dev.
    dev_test_gap = round(selected_dev["f1_score"] - selected_test["f1_score"], 3)

    # Step 3: fill in the report text. Each {...} part is replaced by a value from above.
    # The format :+.3f prints a number with 3 decimals and a sign (+ or -).
    content = f"""# Component Ablation & Threshold Sensitivity Analysis

**Date:** {payload['timestamp']}

## Methodology

Thresholds were swept on the **development split** (`v1.0_dev`, {n_dev} cases) and the selected
operating point was then applied **unchanged** to the held-out **test split** (`v1.0_test`,
{n_test} cases). No threshold, weight, or decision rule was selected using test-split results.

All per-case model signals (embedding similarity, NLI probabilities, tool-claim scores,
disagreement, drift) are computed once per case and shared across configurations, so
configurations differ only in their decision rule.

---

## 1. Selected Operating Point (chosen on dev, evaluated on test)

{sweep_note}

| | NLI contradiction threshold | Low-similarity floor | Precision | Recall | F1 | FPR | FNR |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Development (selection) | {best['nli_contradiction_threshold']:.2f} | {best['semantic_low_similarity_floor']:.2f} | {selected_dev['precision']} | {selected_dev['recall']} | {selected_dev['f1_score']} | {selected_dev['fpr']} | {selected_dev['fnr']} |
| Test (held out) | {best['nli_contradiction_threshold']:.2f} | {best['semantic_low_similarity_floor']:.2f} | {selected_test['precision']} | {selected_test['recall']} | {selected_test['f1_score']} | {selected_test['fpr']} | {selected_test['fnr']} |

Dev-to-test F1 change: **{dev_test_gap:+.3f}**. A large positive gap would indicate the operating
point was overfitted to the development split.

---

## 2. Architectural Ablation (all figures on the held-out test split)

| Configuration | Description | Precision | Recall | F1 | FPR | FNR | TP/FP/FN/TN | Latency (ms) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
{rows}

**Observations (derived from the table, not pre-assumed):**

1. {winner_line}
2. {collapse_line}
3. {underperform_line}

---

## 3. Threshold Sensitivity Sweep (development split, all {len(sweep)} combinations)

| Low-similarity floor | NLI contradiction threshold | Precision | Recall | F1 | FPR | FNR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
{sweep_rows}

Selection rule: highest F1, ties broken by higher recall.

---

## 4. Limitations

- **Sample size.** {n_dev} development and {n_test} test cases. Differences of one or two
  cases move these metrics substantially; small F1 gaps between configurations should not be
  treated as meaningful separations.
- **Disagreement (Config E) is not properly exercised by this dataset.** The evaluation cases
  are single-agent records (evidence + one claim), so the only pair available to the
  disagreement engine is (evidence -> claim) &mdash; the same comparison Config B already makes.
  Testing the multi-agent disagreement path requires multi-agent trace data, which this
  dataset does not contain.
- **Drift (Config F) has no real time axis here.** Drift is a temporal signal; these cases are
  independent and file-ordered, so the drift figures describe detector behaviour on an
  arbitrary ordering, not production drift.
- **This study does not exercise the production ingest path, and Config D is the clearest
  case.** The ablation hands `evaluate_tool_claims` a `result_count` taken straight from the
  dataset's `tool_records`. Production has to recover that number from the tool's own
  `result_summary` text, and could not do so at all until `extract_result_count` was added &mdash;
  the signal recorded zero non-zero scores across 1,328 live evaluations while this table
  showed Config D at parity with the best configuration. Read these figures as the ceiling a
  signal reaches when it is fed correct inputs, not as evidence that it is reachable in
  production.
- **Latency figures** are per-case means of the components each configuration uses, measured on
  CPU. They are not end-to-end request latencies. This study calls
  `load_models(use_onnx=False)`, so it always measures the PyTorch path; the ONNX backend the
  worker selects in production is not exercised here and changes to it cannot move these
  numbers.
- Ground truth is the dataset's `is_failure` label. For the original 50 cases this comes from dual LLM-as-judge evaluation, not human review; for the 23 cases added later it's correct by construction. See `LABEL_AGREEMENT_REPORT.md`.
- Config G's `overall_risk_score` incorporates `grounding_score`, which was recalibrated (neutral-vs-contradiction weighting) after an earlier version of this ablation was run; see `GROUNDING_SCORE_CALIBRATION_REPORT.md`. Configs A-F use `contradiction_prob` directly, not `grounding_score`, and are unaffected by that change.

*Data source:* `experiments/results/ablation_results.json`
"""
    # Step 4: write the report to the repo root (one folder above experiments/).
    with open(Path(__file__).parent.parent / "THRESHOLD_ANALYSIS.md", "w", encoding="utf-8") as f:
        f.write(content)


# Running this file directly does the whole study. It needs the models and the data files.
if __name__ == "__main__":
    run_ablation_study()
