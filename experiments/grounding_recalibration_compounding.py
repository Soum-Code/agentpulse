"""Re-run experiments/compounding_error.py on the corrected NLI labels WITHOUT touching its result file.

compounding_error.py scores five hand-written pipeline nodes against one true sentence and
reports each node's risk. Its published numbers (experiments/results/compounding_error_results.json,
quoted in PROJECT_REPORT.md section 6) come from the swapped-label path. This wrapper:

  1. loads the models itself (cache dir from AGENTPULSE_MODEL_CACHE_DIR; compounding_error.py
     would otherwise read ./models relative to the working directory),
  2. runs the real run_compounding_error_experiment() with the module's __file__ pointed at a
     scratch directory, so its hard-coded results/ path is the scratch directory and the
     committed compounding_error_results.json is never opened,
  3. rescores the same ten texts itself to get all three class probabilities per node, and
     shows the swapped view (contradiction + 0.5 * TRUE entailment) next to the committed file
     to prove the swap model reproduces it,
  4. writes experiments/results/grounding_recalibration_2026-10-22_compounding.json.

The ten texts below are copied verbatim from compounding_error.py; step 3's agreement with the
committed file (max abs diff) is the check that the copy is faithful.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "sdk" / "src"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "experiments"))

RES = ROOT / "experiments" / "results"
OUT = RES / "grounding_recalibration_2026-10-22_compounding.json"

BASE = "The database query executed in 45ms and returned 3 verified customer profile records."
FAULT = "Zhang et al. (2024) proven that 300,000 customers experienced instant quantum telemetry synchronization."
VERIFIER = "Verifier detected ungrounded claim from Retriever; falling back to verified premise: 3 customer records in 45ms."
RESTORED = "Analysis confirms 3 customer records retrieved in 45ms without telemetry anomalies."
NODES = ["Node_A (Planner)", "Node_B (Retriever - Fault Injected)", "Node_C (Verifier)", "Node_D (Analyst)", "Node_E (Writer)"]
CLAIMS = {
    "condition_a_unmitigated_control": [BASE, FAULT] + [f"Synthesizing confirmed findings: {FAULT}"] * 3,
    "condition_b_active_intervention": [BASE, FAULT, VERIFIER, RESTORED, RESTORED],
}


def label(score: float) -> str:
    return "high_risk" if score > 0.7 else "medium_risk" if score > 0.4 else "low_risk"


def main() -> None:
    from app.services import grounding
    import compounding_error as ce

    grounding.load_models(cache_dir=os.environ.get("AGENTPULSE_MODEL_CACHE_DIR", "./models"), use_onnx=False, sync=True)
    if not all(grounding.models_loaded().values()):
        raise SystemExit("models not loaded")

    # Run the real experiment against a scratch results/ directory.
    ce.load_models = lambda **kw: None  # already loaded above
    scratch = Path(tempfile.mkdtemp(prefix="compounding_scratch_"))
    ce.__file__ = str(scratch / "compounding_error.py")
    real = ce.run_compounding_error_experiment()
    assert (scratch / "results" / "compounding_error_results.json").exists()

    with open(RES / "compounding_error_results.json", "r", encoding="utf-8") as f:
        published = json.load(f)

    out: dict = {"script": "experiments/grounding_recalibration_compounding.py", "base_premise": BASE, "conditions": {}}
    worst = 0.0
    for cond, claims in CLAIMS.items():
        rows = []
        for node, claim, pub_row, real_row in zip(NODES, claims, published[cond], real[cond]):
            nli = grounding.compute_nli_grounding(BASE, claim)
            c, n, e = nli.contradiction_prob, nli.neutral_prob, nli.entailment_prob
            swapped = round(c + 0.5 * e, 3)
            corrected = round(c + 0.5 * n, 3)
            worst = max(worst, abs(swapped - pub_row["risk_score"]))
            assert abs(corrected - real_row["risk_score"]) < 0.002, (node, corrected, real_row["risk_score"])
            rows.append({
                "node": node, "c_n_e": [c, n, e],
                "published_risk": pub_row["risk_score"], "published_label": pub_row["label"],
                "swapped_view_risk": swapped, "swapped_view_label": label(swapped),
                "corrected_risk": real_row["risk_score"], "corrected_label": real_row["label"],
            })
        out["conditions"][cond] = rows
    out["max_abs_diff_swapped_view_vs_published_risk"] = round(worst, 4)
    out["summaries_corrected"] = {
        "condition_a": real["condition_a_downstream_propagation_summary"],
        "condition_b": real["condition_b_downstream_propagation_summary"],
    }
    out["summaries_published"] = {
        "condition_a": published["condition_a_downstream_propagation_summary"],
        "condition_b": published["condition_b_downstream_propagation_summary"],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {OUT.relative_to(ROOT)}; swapped-view vs published max abs diff {worst}")
    for cond, rows in out["conditions"].items():
        print(cond)
        for r in rows:
            print(f"  {r['node'][:26]:<26} published {r['published_risk']:.3f} {r['published_label']:<11} -> corrected {r['corrected_risk']:.3f} {r['corrected_label']}")


if __name__ == "__main__":
    main()
