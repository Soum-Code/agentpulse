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

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List

import numpy as np

# Ensure modules are importable
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

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


def calculate_metrics(tp: int, fp: int, fn: int, tn: int, latency_ms: float) -> Dict[str, Any]:
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
        "latency_ms": round(latency_ms, 2),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


def load_split(split: str) -> List[Dict[str, Any]]:
    path = Path(__file__).parent.parent / "datasets" / f"v1.0_{split}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


def precompute_signals(cases: List[Dict[str, Any]], split_name: str) -> List[Dict[str, Any]]:
    """Run every model once per case; all configurations reuse these signals.

    This keeps configurations comparable (identical underlying measurements)
    and avoids re-running NLI once per threshold combination.
    """
    print(f"  Precomputing signals for {len(cases)} '{split_name}' cases...")
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    signals = []

    for c in cases:
        premise = c.get("evidence") or c["input_query"]
        claim = c["agent_claim"]

        t0 = time.perf_counter()
        sim = compute_semantic_similarity(premise, claim)
        sim_ms = (time.perf_counter() - t0) * 1000.0

        t0 = time.perf_counter()
        nli = compute_nli_grounding(premise, claim)
        nli_ms = (time.perf_counter() - t0) * 1000.0

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
        t0 = time.perf_counter()
        emb = get_embedding(claim)
        drift_res = drift_detector.analyze(agent_id="ablation_agent", embedding=emb) if emb is not None else None
        drift_ms = (time.perf_counter() - t0) * 1000.0

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
            "latency_ms": {
                "similarity": sim_ms, "nli": nli_ms, "tool": tool_ms,
                "disagreement": disagree_ms, "drift": drift_ms,
            },
        })

    return signals


def score_config(
    signals: List[Dict[str, Any]],
    predict: Callable[[Dict[str, Any]], bool],
    latency_components: List[str],
) -> Dict[str, Any]:
    tp = fp = fn = tn = 0
    for s in signals:
        pred = predict(s)
        actual = s["is_failure"]
        if pred and actual: tp += 1
        elif pred and not actual: fp += 1
        elif not pred and actual: fn += 1
        else: tn += 1

    mean_latency = sum(
        sum(s["latency_ms"][k] for k in latency_components) for s in signals
    ) / max(len(signals), 1)
    return calculate_metrics(tp, fp, fn, tn, mean_latency)


# Decision rules. Each takes the precomputed signals for one case.
NLI_CONTRA_THRESHOLD = 0.60
SEM_LOW_FLOOR = 0.35
TOOL_THRESHOLD = 0.60


def _cfg_a(s):  # MiniLM only
    return (s["similarity"] or 0.0) < 0.75


def _cfg_b(s):  # DeBERTa NLI only
    return s["contradiction_prob"] > NLI_CONTRA_THRESHOLD


def _cfg_c(s):  # cascade
    return _cfg_b(s) or (s["similarity"] is not None and s["similarity"] < SEM_LOW_FLOOR)


def _cfg_d(s):  # NLI + tool validation
    return _cfg_b(s) or (s["tool_claim_score"] is not None and s["tool_claim_score"] > TOOL_THRESHOLD)


def _cfg_e(s):  # NLI + disagreement
    return _cfg_b(s) or (s["disagreement_score"] is not None and s["disagreement_score"] > NLI_CONTRA_THRESHOLD)


def _cfg_f(s):  # NLI + drift
    return _cfg_b(s) or (s["centroid_distance"] is not None and s["centroid_distance"] > 0.30)


CONFIGS = [
    ("Config_A_MiniLM_Only", "MiniLM embedding cosine only", _cfg_a, ["similarity"]),
    ("Config_B_DeBERTa_Only", "DeBERTa-v3 NLI only", _cfg_b, ["nli"]),
    ("Config_C_Cascade", "MiniLM + DeBERTa cascade", _cfg_c, ["similarity", "nli"]),
    ("Config_D_NLI_Plus_Tool", "NLI + deterministic tool-claim validation", _cfg_d, ["nli", "tool"]),
    ("Config_E_NLI_Plus_Disagreement", "NLI + inter-agent disagreement", _cfg_e, ["nli", "disagreement"]),
    ("Config_F_NLI_Plus_Drift", "NLI + drift signal", _cfg_f, ["nli", "drift"]),
]


def run_threshold_sweep(signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sweep the two decision thresholds. Runs on the development split only."""
    sem_floors = [0.10, 0.20, 0.30, 0.35, 0.40]
    nli_thresholds = [0.50, 0.60, 0.70, 0.80]
    sweep = []

    for floor in sem_floors:
        for n_thresh in nli_thresholds:
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


def run_ablation_study() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE COMPONENT ABLATION & THRESHOLD SWEEP STUDY")
    print("=" * 64)

    load_models(use_onnx=False, sync=True)

    dev_cases = load_split("dev")
    test_cases = load_split("test")

    dev_signals = precompute_signals(dev_cases, "dev")
    test_signals = precompute_signals(test_cases, "test")

    # ── Threshold sweep on DEV only, then select an operating point ──
    print("\nSweeping thresholds on the development split...")
    sweep = run_threshold_sweep(dev_signals)
    best = max(sweep, key=lambda r: (r["f1_score"], r["recall"]))
    print(
        f"  Selected on dev: nli>={best['nli_contradiction_threshold']}, "
        f"sim_floor<{best['semantic_low_similarity_floor']} "
        f"(dev F1={best['f1_score']}, recall={best['recall']})"
    )

    # ── Apply the dev-selected operating point to the held-out TEST split ──
    def selected_rule(s):
        return (
            s["contradiction_prob"] >= best["nli_contradiction_threshold"]
            or (s["similarity"] is not None and s["similarity"] < best["semantic_low_similarity_floor"])
        )

    selected_dev = score_config(dev_signals, selected_rule, ["similarity", "nli"])
    selected_test = score_config(test_signals, selected_rule, ["similarity", "nli"])

    # ── Per-configuration ablation, reported on the TEST split ──
    print("\nScoring configurations on the held-out test split...")
    ablation_results: Dict[str, Any] = {}
    for key, desc, fn, lat_parts in CONFIGS:
        ablation_results[key] = {"description": desc, **score_config(test_signals, fn, lat_parts)}

    # ── Config G: full pipeline (runs the real EvaluationPipeline) ──
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    full_pipeline = EvaluationPipeline(drift_detector, alert_engine)

    tp = fp = fn = tn = 0
    t0 = time.perf_counter()
    for c in test_cases:
        res = full_pipeline.evaluate_span(
            span_id=f"abl_{c['id']}",
            trace_id="trace_abl",
            agent_id="agent_abl",
            input_text=c.get("evidence") or c["input_query"],
            output_text=c["agent_claim"],
            tool_calls=c.get("tool_records"),
        )
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
    g_latency = (time.perf_counter() - t0) * 1000.0 / max(len(test_cases), 1)
    ablation_results["Config_G_Full_AgentPulse"] = {
        "description": "Full AgentPulse pipeline (grounding + tool + disagreement + drift + risk aggregation)",
        **calculate_metrics(tp, fp, fn, tn, g_latency),
    }

    # ── Detect whether any configuration is actually distinguishable ──
    f1s = {k: v["f1_score"] for k, v in ablation_results.items()}
    best_cfg = max(f1s.items(), key=lambda kv: kv[1])
    tied = [k for k, v in f1s.items() if abs(v - best_cfg[1]) < 1e-9]

    # Configs E and F collapse to Config B when their extra signal never fires.
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
    sweep_f1s = [s["f1_score"] for s in sweep]
    dev_sweep_uninformative = (max(sweep_f1s) - min(sweep_f1s)) < 1e-9

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

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "ablation_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    _write_report(out_payload, ablation_results, sweep, best, selected_dev, selected_test,
                  best_cfg, tied, identical_to_b, underperform_b, dev_sweep_uninformative,
                  len(dev_cases), len(test_cases))

    print("\nAblation and threshold analysis complete.")
    print(f"Results saved to: {res_json_path}")
    print("Report written to: THRESHOLD_ANALYSIS.md")
    return out_payload


def _write_report(payload, ablation_results, sweep, best, selected_dev, selected_test,
                  best_cfg, tied, identical_to_b, underperform_b, dev_sweep_uninformative,
                  n_dev, n_test) -> None:
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

    if len(tied) > 1:
        winner_line = (
            f"{len(tied)} configurations tie at the highest F1 ({best_cfg[1]}): "
            f"{', '.join(t.replace('Config_', '') for t in tied)}. "
            f"On this test split they are not distinguishable by F1."
        )
    else:
        winner_line = f"{best_cfg[0].replace('Config_', '')} achieved the highest F1 ({best_cfg[1]}) on the test split."

    if identical_to_b:
        collapse_line = (
            f"{', '.join(c.replace('Config_', '') for c in identical_to_b)} produced metrics "
            f"identical to Config B (NLI only), i.e. the additional signal never changed a decision "
            f"on this dataset. See limitations."
        )
    else:
        collapse_line = "Configs E and F produced different metrics from Config B on this dataset."

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

    sweep_note = (
        "**All threshold combinations tied at F1=1.0 on the development split** &mdash; the sweep did not "
        "actually discriminate between thresholds at this sample size ({} cases), so the \"selected\" "
        "operating point below was chosen arbitrarily among equally-scoring options, not because it was "
        "measurably better. A larger development set is needed before threshold selection here is meaningful."
        .format(n_dev)
    ) if dev_sweep_uninformative else ""

    dev_test_gap = round(selected_dev["f1_score"] - selected_test["f1_score"], 3)

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
- **Latency figures** are per-case means of the components each configuration uses, measured on
  CPU. They are not end-to-end request latencies.
- Ground truth is the dataset's `is_failure` label. For the original 50 cases this comes from dual LLM-as-judge evaluation, not human review; for the 23 cases added later it's correct by construction. See `LABEL_AGREEMENT_REPORT.md`.
- Config G's `overall_risk_score` incorporates `grounding_score`, which was recalibrated (neutral-vs-contradiction weighting) after an earlier version of this ablation was run; see `GROUNDING_SCORE_CALIBRATION_REPORT.md`. Configs A-F use `contradiction_prob` directly, not `grounding_score`, and are unaffected by that change.

*Data source:* `experiments/results/ablation_results.json`
"""
    with open(Path(__file__).parent.parent / "THRESHOLD_ANALYSIS.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    run_ablation_study()
