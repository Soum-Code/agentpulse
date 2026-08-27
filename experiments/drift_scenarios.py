"""Multi-Condition Drift Experiment Suite with Graded Magnitudes and Negative Controls.

Evaluates:
- Positive Drift Scenarios at 10%, 25%, 50% shift levels
- Negative Drift Controls (legitimate rephrasings, valid tool substitutions, no quality drop)
- Formally defined drift metrics (Cosine Distance, Tool Entropy Delta, Error Rate Delta)

Outputs:
- experiments/results/drift_experiment_results.json
- experiments/results/drift_scenarios_generated_report.md

THIS SCRIPT DOES NOT WRITE `DRIFT_EXPERIMENT_REPORT.md`, AND MUST NOT.

It used to. That report is a curated, hand-corrected document: its section 4 is a
correction notice recording three inaccuracies that were found by cross-checking
the prose against the results JSON, and its sections 3 and 5 contain analysis and
limitations that no generator produces. Regenerating it from the template below
destroyed all of that and silently reintroduced every one of the three errors,
because the template still contained them:

  1. section 2 claimed "shifts at 50% and above ... were detected within 1-2
     spans", which the table in the same file contradicts (50% is Detected: No,
     and measured recall was 0.400)
  2. the "Magnitude" column was described as cosine centroid distance but is
     populated with `shift_level`, a configured scenario parameter roughly an
     order of magnitude larger
  3. the decision rule was given as "0.30 cosine distance" alone, omitting the
     `stability_index < 70` branch -- which is the branch that actually fired
     for both detections

All three are fixed in the template below, so the generated artifact is accurate
on its own terms. It is written beside the results JSON under
`experiments/results/` and the curated report is left alone.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

# Ensure modules are importable
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.drift import DriftDetector
from app.services.grounding import get_embedding, load_models


def run_drift_scenarios_experiment() -> Dict[str, Any]:
    print("=" * 64)
    print("AGENTPULSE GRADED DRIFT BENCHMARK WITH NEGATIVE CONTROLS")
    print("=" * 64)

    load_models(use_onnx=False, sync=True)

    # Scenarios covering positive shifts and negative controls
    scenarios = [
        # ── Graded Prompt Shift ──
        {"id": "sc_prompt_10", "name": "Prompt Formatting Change (10% shift)", "type": "prompt_drift", "shift_level": 0.10, "is_anomaly": False},
        {"id": "sc_prompt_25", "name": "Prompt Tone Shift (25% shift)", "type": "prompt_drift", "shift_level": 0.25, "is_anomaly": False},
        {"id": "sc_prompt_50", "name": "Prompt Template Rewrite (50% shift)", "type": "prompt_drift", "shift_level": 0.50, "is_anomaly": True},

        # ── Model Revision & Temperature ──
        {"id": "sc_model_50", "name": "Model Version Update (Qwen-7B to Llama-8B)", "type": "model_drift", "shift_level": 0.50, "is_anomaly": True},
        {"id": "sc_temp_35", "name": "Temperature Shift (T=0.1 to T=0.9)", "type": "hyperparam_drift", "shift_level": 0.35, "is_anomaly": True},

        # ── Tool Distribution Shift ──
        {"id": "sc_tool_25", "name": "Tool Frequency Fluctuation (25% delta)", "type": "tool_entropy", "shift_level": 0.25, "is_anomaly": False},
        {"id": "sc_tool_60", "name": "Uncalibrated External Tool Shift (60% delta)", "type": "tool_entropy", "shift_level": 0.60, "is_anomaly": True},

        # ── Grounding Regression Burst ──
        {"id": "sc_hallucination_75", "name": "Hallucination & Contradiction Burst (75% risk)", "type": "quality_regression", "shift_level": 0.75, "is_anomaly": True},

        # ── Negative Controls (Legitimate Operational Changes) ──
        {"id": "ctrl_neg_paraphrase", "name": "Negative Control: Legitimate Paraphrasing", "type": "negative_control", "shift_level": 0.12, "is_anomaly": False},
        {"id": "ctrl_neg_valid_tool", "name": "Negative Control: Equivalent Tool Substitution", "type": "negative_control", "shift_level": 0.15, "is_anomaly": False},
        {"id": "ctrl_neg_stable_flow", "name": "Negative Control: Baseline Invariant Operation", "type": "negative_control", "shift_level": 0.00, "is_anomaly": False},
    ]

    base_vector = np.zeros(384, dtype=np.float32)
    base_vector[0] = 1.0

    experiment_results = []

    for sc in scenarios:
        dd = DriftDetector(window_size=20, min_samples_for_alert=5, drift_threshold=0.30)
        detected = False
        false_alert = False
        ttd = None

        for step in range(40):
            is_shifted = step >= 20

            if is_shifted:
                vec = np.zeros(384, dtype=np.float32)
                vec[1] = sc["shift_level"]
                vec[0] = max(0.0, 1.0 - sc["shift_level"])
                tool = "unverified_tool" if sc["type"] == "tool_entropy" and sc["is_anomaly"] else "base_tool"
                risk = 0.85 if sc["type"] == "quality_regression" else 0.08
                is_err = False
            else:
                vec = base_vector.copy()
                tool = "base_tool"
                risk = 0.08
                is_err = False

            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm

            res = dd.analyze(
                agent_id=f"agent_{sc['id']}",
                embedding=vec,
                tool_name=tool,
                is_error=is_err,
                risk_score=risk,
            )

            # Drift triggers when centroid distance exceeds threshold or ASI drops below 70
            is_drift_fired = (
                (res.centroid_distance is not None and res.centroid_distance >= 0.30)
                or (res.stability_index is not None and res.stability_index < 70.0)
            )

            if is_drift_fired and not detected and is_shifted:
                detected = True
                ttd = step - 20 + 1
                if not sc["is_anomaly"]:
                    false_alert = True

        experiment_results.append({
            "scenario_id": sc["id"],
            "scenario_name": sc["name"],
            "drift_type": sc["type"],
            "shift_level": sc["shift_level"],
            "is_anomaly": sc["is_anomaly"],
            "detected": detected,
            "false_alert": false_alert,
            "time_to_detect_spans": ttd if detected else "N/A",
            "final_asi": round(res.stability_index or 100.0, 1),
            "final_centroid_dist": round(res.centroid_distance or 0.0, 3),
        })

    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "drift_threshold": 0.30,
        "scenarios_evaluated": len(scenarios),
        "results": experiment_results,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "drift_experiment_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    # Generated summary. Written under results/ deliberately -- see the module
    # docstring for why this must never target DRIFT_EXPERIMENT_REPORT.md.
    n_anomalies = sum(1 for r in experiment_results if r["is_anomaly"])
    n_detected = sum(1 for r in experiment_results if r["is_anomaly"] and r["detected"])
    n_false = sum(1 for r in experiment_results if r["false_alert"])
    max_dist = max((r["final_centroid_dist"] for r in experiment_results), default=0.0)

    report_path = res_dir / "drift_scenarios_generated_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"""# Drift Scenarios — Generated Summary

**Generated by:** `experiments/drift_scenarios.py`
**Date:** {out_payload['timestamp']}
**Method:** Graded drift magnitudes and negative controls, on **constructed vectors**
rather than embeddings of real drifted text.

> This file is regenerated on every run and is not a curated report. The analysis,
> limitations and correction history live in `DRIFT_EXPERIMENT_REPORT.md`, which this
> script does not write. For behaviour on real agent text see
> `DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md`.

**Detection rule as implemented here:** drift fires when
`centroid_distance >= 0.30` **OR** `stability_index < 70`. Both branches matter — the
ASI branch is the one that produced detections in past runs, so quoting the 0.30
threshold alone misdescribes the rule.

## 1. Graded drift and negative control results

"Shift level" is the **configured scenario parameter**, not a measured distance. The
measured cosine centroid distance is the separate column, and is roughly an order of
magnitude smaller — conflating the two makes the threshold look satisfied when it is not.

| Scenario | Type | Shift level | Measured centroid dist. | Is anomaly | Detected | False alert | Time to detect | Final ASI |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
""" + "\n".join([
            f"| {r['scenario_name']} | {r['drift_type']} | {r['shift_level']:.2f} "
            f"| {r['final_centroid_dist']:.3f} | {'Yes' if r['is_anomaly'] else 'No'} "
            f"| {'Yes' if r['detected'] else 'No'} | {'Yes' if r['false_alert'] else 'No'} "
            f"| {r['time_to_detect_spans']} | {r['final_asi']}/100 |"
            for r in experiment_results
        ]) + f"""

## 2. Findings

Detected **{n_detected} of {n_anomalies}** genuine anomalies (recall
{n_detected / n_anomalies if n_anomalies else 0:.3f}) with **{n_false}** false alerts
across {len(experiment_results)} scenarios.

The largest measured centroid distance anywhere in this run was **{max_dist:.3f}**,
against a 0.30 threshold. Where that maximum stays below the threshold, the centroid
branch cannot have fired at all and every detection came from `stability_index < 70` —
which also means **this experiment provides no evidence for or against the 0.30 value**.

Note that `final_centroid_dist` is the value at the *end* of the run, after the EMA
centroid has converged on the shifted distribution. It is not the peak, and reading it
as though it were understates what the detector saw mid-run.
""")

    print(f"\nDrift experiment results saved to: {res_json_path}")
    print(f"Generated summary written to: {report_path}")
    print("NOTE: DRIFT_EXPERIMENT_REPORT.md is curated and was deliberately not touched.")

    return out_payload


if __name__ == "__main__":
    run_drift_scenarios_experiment()
