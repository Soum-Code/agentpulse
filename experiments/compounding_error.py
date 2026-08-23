"""Compounding Error & Downstream Risk Propagation Experiment.

Evaluates how an ungrounded claim introduced at an intermediate DAG node (Agent B)
propagates downstream to subsequent agents (C, D, E) under two experimental conditions:

Condition A: Unmitigated Control (No Verification Intervention)
  - Agents C, D, E blindly consume the faulty output of Node B.
  - Evaluates natural risk compounding and hallucination propagation.

Condition B: Active Intervention (Verification Enabled)
  - Node C (Verifier) inspects source evidence, flags the contradiction, and halts ungrounded premise propagation.
  - Downstream Nodes D and E consume grounded facts.

Outputs:
- experiments/results/compounding_error_results.json
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

from app.services.evaluator import EvaluationPipeline
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
from app.services.grounding import load_models


def run_compounding_error_experiment() -> Dict[str, Any]:
    """Tests the AgentPulse evaluator's downstream-propagation detection, not
    LLM generation quality. Node outputs are fixed/constructed text
    (deliberately, so the fault-injection point and downstream behavior are
    controlled and reproducible) run through the real evaluation pipeline --
    there is no LLM adapter involved in this experiment."""
    print("=" * 64)
    print("AGENTPULSE DOWNSTREAM PROPAGATION EXPERIMENT (CONTROL VS. INTERVENTION)")
    print("DAG: Agent A -> B -> C -> D -> E")
    print("=" * 64)

    load_models(use_onnx=False, sync=True)

    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    pipeline = EvaluationPipeline(drift_detector, alert_engine)

    base_premise = "The database query executed in 45ms and returned 3 verified customer profile records."
    injected_unsupported_claim = "Zhang et al. (2024) proven that 300,000 customers experienced instant quantum telemetry synchronization."

    nodes = [
        "Node_A (Planner)",
        "Node_B (Retriever - Fault Injected)",
        "Node_C (Verifier)",
        "Node_D (Analyst)",
        "Node_E (Writer)",
    ]

    # ── Condition A: Unmitigated Control (Error Compounds Downstream) ──
    print("\n[Condition A: Unmitigated Control - No Verification Intervention]")
    condition_a_risks = []
    curr_context = base_premise

    for idx, node_name in enumerate(nodes):
        if idx == 0:
            claim = base_premise
        elif idx == 1:
            claim = injected_unsupported_claim
            curr_context = claim
        else:
            # Downstream nodes blindly repeat or build on faulty context
            claim = f"Synthesizing confirmed findings: {curr_context}"

        eval_res = pipeline.evaluate_span(
            span_id=f"ctrl_{idx}",
            trace_id="trace_ctrl",
            agent_id=node_name.split()[0],
            input_text=base_premise,
            output_text=claim,
        )
        risk = round(eval_res.overall_risk_score or 0.0, 3)
        contra_p = eval_res.grounding.contradiction_prob if eval_res.grounding else 0.0
        condition_a_risks.append({
            "node": node_name,
            "risk_score": risk,
            "label": eval_res.risk_label,
            "contradiction_prob": round(contra_p, 3),
        })
        print(f"  [{node_name}] Risk: {risk:.3f} | Contra Prob: {contra_p:.3f} | Label: {eval_res.risk_label}")

    # ── Condition B: Active Intervention (Verifier Catches Fault) ──
    print("\n[Condition B: Active Intervention - Verifier Catches Fault]")
    condition_b_risks = []

    for idx, node_name in enumerate(nodes):
        if idx == 0:
            claim = base_premise
        elif idx == 1:
            claim = injected_unsupported_claim
        elif idx == 2:
            # Verifier detects contradiction and restores verified baseline
            claim = "Verifier detected ungrounded claim from Retriever; falling back to verified premise: 3 customer records in 45ms."
        else:
            # Downstream nodes consume restored baseline
            claim = "Analysis confirms 3 customer records retrieved in 45ms without telemetry anomalies."

        eval_res = pipeline.evaluate_span(
            span_id=f"interv_{idx}",
            trace_id="trace_interv",
            agent_id=node_name.split()[0],
            input_text=base_premise,
            output_text=claim,
        )
        risk = round(eval_res.overall_risk_score or 0.0, 3)
        contra_p = eval_res.grounding.contradiction_prob if eval_res.grounding else 0.0
        condition_b_risks.append({
            "node": node_name,
            "risk_score": risk,
            "label": eval_res.risk_label,
            "contradiction_prob": round(contra_p, 3),
        })
        print(f"  [{node_name}] Risk: {risk:.3f} | Contra Prob: {contra_p:.3f} | Label: {eval_res.risk_label}")

    # Downstream risk propagation delta: does risk stay elevated (or grow) after
    # the injected fault under each condition? This is a propagation measurement,
    # not a causal-intervention proof (see module docstring / Part 33 wording).
    def _propagation_summary(risks: List[Dict[str, Any]]) -> Dict[str, Any]:
        fault_idx = 1  # Node_B
        post_fault = risks[fault_idx + 1:]
        return {
            "fault_node_risk": risks[fault_idx]["risk_score"],
            "mean_downstream_risk": round(sum(r["risk_score"] for r in post_fault) / len(post_fault), 3) if post_fault else None,
            "max_downstream_risk": max((r["risk_score"] for r in post_fault), default=None),
            "downstream_high_risk_node_count": sum(1 for r in post_fault if r["label"] == "high_risk"),
        }

    condition_a_summary = _propagation_summary(condition_a_risks)
    condition_b_summary = _propagation_summary(condition_b_risks)

    known_limitation_note = (
        "Node_A (baseline, no fault) reads as high_risk (~0.99) in both conditions above, "
        "despite near-zero contradiction_prob (~0.002). Root cause verified directly: DeBERTa "
        "NLI classifies a premise compared against itself as 'neutral' (~98.7%), not "
        "'entailment' (~1%) -- verbatim self-repetition is out-of-distribution for a model "
        "trained on genuine premise/hypothesis pairs. Since grounding_score = 1 - entailment_prob, "
        "a neutral classification is scored almost as risky as genuine uncertainty, even though "
        "'neutral' is not 'contradicted'. This is a limitation of the current grounding_score "
        "formula (over-penalizes neutral relative to contradiction), not specific to this "
        "experiment -- see EMPIRICAL_AUDIT.md / THRESHOLD_ANALYSIS.md Part 12-13 discussion. "
        "Treat Node_A's risk score as unreliable evidence of a clean baseline in this experiment; "
        "the propagation comparison (fault node onward) is unaffected since it's a relative "
        "before/after difference, not an absolute risk magnitude."
    )
    print(f"\n[Known limitation] {known_limitation_note}")

    out_payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "known_limitation_baseline_node_risk": known_limitation_note,
        "base_premise": base_premise,
        "injected_fault_node": "Node_B",
        "condition_a_unmitigated_control": condition_a_risks,
        "condition_a_downstream_propagation_summary": condition_a_summary,
        "condition_b_active_intervention": condition_b_risks,
        "condition_b_downstream_propagation_summary": condition_b_summary,
    }

    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "compounding_error_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    print(f"\nCompounding error results saved to: {res_json_path}")
    return out_payload


if __name__ == "__main__":
    run_compounding_error_experiment()
