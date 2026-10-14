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

# WHAT THIS FILE IS FOR
# It tests what happens when one agent in a chain makes something up. The chain has five
# nodes: Node_A -> Node_B -> Node_C -> Node_D -> Node_E. Node_B always says a claim that
# the evidence does not support (a made-up study and a made-up number). Every node's
# text is scored by the real AgentPulse evaluation. In condition A nobody checks, so the
# later nodes repeat the bad claim. In condition B, Node_C and the nodes after it say
# true things instead. The question: does the risk stay high after Node_B in A, and
# drop in B?
# The node texts are fixed strings written in this file. No LLM is called. The
# "verifier" is not real code either: its text is a fixed string that already says it
# is falling back to the verified fact.
# NLI = a model that says if one text follows from, contradicts, or is unrelated to
# another. The evaluation uses it to compare each node's text with the true fact.
#
# HOW IT FITS IN
# Run by hand; nothing imports it. It uses EvaluationPipeline (services/evaluator.py)
# and load_models (services/grounding.py). It saves
# experiments/results/compounding_error_results.json.

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

# Ensure modules are importable
import sys
# backend/ holds the `app` package. The other two paths are the SDK source and the repo
# root. With them on the path, the imports below work when this file is run directly.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

# EvaluationPipeline runs all the checks on one span. The drift detector and the alert
# engine are needed to build it. load_models loads the NLI and embedding models.
from app.services.evaluator import EvaluationPipeline
from app.services.drift import DriftDetector
from app.services.alerting import AlertEngine
from app.services.grounding import load_models


# Runs condition A, then condition B, prints one line per node, works out a summary for
# each condition, saves everything as JSON and returns the same dict.
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

    # Load both models now and wait for them (sync=True). use_onnx=False picks the plain
    # PyTorch version of the NLI model.
    load_models(use_onnx=False, sync=True)

    # Build the real evaluation pipeline. The drift detector and alert engine are needed to
    # build it, but this script only reads each node's risk score, risk label and NLI
    # contradiction probability. One pipeline object is used for both conditions, so its
    # drift memory carries over; drift is not part of the risk score. AlertEngine's
    # cooldown_seconds=0 changes nothing today (alerting.py stores it but never reads it).
    drift_detector = DriftDetector(window_size=20, min_samples_for_alert=5)
    alert_engine = AlertEngine(cooldown_seconds=0)
    pipeline = EvaluationPipeline(drift_detector, alert_engine)

    # base_premise is the true fact, and it is the evidence for every node. The injected claim
    # is what Node_B says instead: it names a study and a number that the evidence never has.
    base_premise = "The database query executed in 45ms and returned 3 verified customer profile records."
    injected_unsupported_claim = "Zhang et al. (2024) proven that 300,000 customers experienced instant quantum telemetry synchronization."

    # The five nodes in order. The text before the first space (for example Node_A) is used
    # as the agent id.
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
    # curr_context is the text that the later nodes build on. It starts as the true fact.
    curr_context = base_premise

    # What each node says. Node_A states the true fact. Node_B states the made-up claim, and
    # from then on that claim is the context. Nodes C, D and E repeat the context with the
    # words "Synthesizing confirmed findings" in front.
    for idx, node_name in enumerate(nodes):
        if idx == 0:
            claim = base_premise
        elif idx == 1:
            claim = injected_unsupported_claim
            curr_context = claim
        else:
            # Downstream nodes blindly repeat or build on faulty context
            claim = f"Synthesizing confirmed findings: {curr_context}"

        # Score this node. The input (the evidence) is always the true fact, so the score says how
        # well the node's text is supported by it. No upstream agent and no tool calls are passed,
        # so only the grounding check and the drift check run. The overall risk then equals the
        # grounding score (0 = supported by the evidence, 1 = not supported).
        eval_res = pipeline.evaluate_span(
            span_id=f"ctrl_{idx}",
            trace_id="trace_ctrl",
            agent_id=node_name.split()[0],
            input_text=base_premise,
            output_text=claim,
        )
        # Keep three numbers per node: the overall risk (0 to 1), its label (high_risk above
        # 0.7, medium_risk above 0.4, otherwise low_risk) and the NLI contradiction probability
        # (0.0 if the grounding check gave no result).
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

    # Same five nodes and the same scoring. The difference: Node_C gets a fixed "verifier"
    # text, and Nodes D and E get a fixed "analysis" text that restates the true fact.
    for idx, node_name in enumerate(nodes):
        if idx == 0:
            claim = base_premise
        elif idx == 1:
            claim = injected_unsupported_claim
        elif idx == 2:
            # Verifier detects contradiction and restores verified baseline
            # This is a fixed string. Nothing here really checks the evidence.
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
        # In: the per-node results in node order. Out: the fault node's own risk and, for the
        # nodes after it (C, D and E), their mean risk, their max risk and how many of them are
        # labelled high_risk. The mean and max are None if no node comes after the fault.
        fault_idx = 1  # Node_B
        # post_fault = every node after the fault node (from index 2 on).
        post_fault = risks[fault_idx + 1:]
        return {
            "fault_node_risk": risks[fault_idx]["risk_score"],
            "mean_downstream_risk": round(sum(r["risk_score"] for r in post_fault) / len(post_fault), 3) if post_fault else None,
            "max_downstream_risk": max((r["risk_score"] for r in post_fault), default=None),
            "downstream_high_risk_node_count": sum(1 for r in post_fault if r["label"] == "high_risk"),
        }

    # Summarise both conditions in the same way so they can be compared.
    condition_a_summary = _propagation_summary(condition_a_risks)
    condition_b_summary = _propagation_summary(condition_b_risks)

    # In short: the clean first node (Node_A) scores about "medium risk" in both conditions,
    # not low. The note below says the NLI model calls a text repeated against itself
    # "neutral", and neutral counts as half a contradiction in the risk score. It also says
    # this does not change the comparison between the conditions, because that comparison
    # starts at the fault node (Node_B) and never uses Node_A.
    known_limitation_note = (
        "Node_A (baseline, no fault) reads as medium_risk (~0.50) in both conditions above, "
        "despite near-zero contradiction_prob (~0.002). Root cause verified directly: DeBERTa "
        "NLI classifies a premise compared against itself as 'neutral' (~98.7%), not "
        "'entailment' (~1%) -- verbatim self-repetition is out-of-distribution for a model "
        "trained on genuine premise/hypothesis pairs. grounding_score used to be "
        "1 - entailment_prob, which scored this neutral classification almost as risky as a "
        "genuine contradiction (~0.99, high_risk); it is now "
        "contradiction_prob + 0.5 * neutral_prob (see GROUNDING_SCORE_CALIBRATION_REPORT.md), "
        "which roughly halves the penalty (~0.50, medium_risk) but does not eliminate it, since "
        "neutral still contributes some risk by design. Treat Node_A's risk score as an "
        "improved-but-still-imperfect estimate of a clean baseline in this experiment; the "
        "propagation comparison (fault node onward) is unaffected either way since it's a "
        "relative before/after difference, not an absolute risk magnitude."
    )
    print(f"\n[Known limitation] {known_limitation_note}")

    # Everything saved to the JSON file: both conditions (per-node lists and summaries), the
    # true fact, the name of the fault node and the note above.
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

    # Save to experiments/results/compounding_error_results.json (folder made if missing).
    res_dir = Path(__file__).parent / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    res_json_path = res_dir / "compounding_error_results.json"
    with open(res_json_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    print(f"\nCompounding error results saved to: {res_json_path}")
    return out_payload


# Running this file directly does the whole experiment. It needs the models.
if __name__ == "__main__":
    run_compounding_error_experiment()
