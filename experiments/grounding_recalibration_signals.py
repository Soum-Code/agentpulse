"""Stage 1 of the 2026-10 grounding recalibration: measure the NLI outputs once.

WHAT THIS IS FOR
Until PR #69 (2026-10-21) `compute_nli_grounding` read the DeBERTa output as
contradiction=0, neutral=1, entailment=2. The model's own config says
contradiction=0, entailment=1, neutral=2. So every score before that date had
entailment and neutral swapped. This script runs the fixed code (which reads the
order from the model config) on every labelled single-agent case and stores the
three class probabilities, so the analysis stage (grounding_recalibration_analysis.py)
can recompute everything -- the corrected numbers AND the swapped numbers the
project published -- from the same forward passes without loading a model.

The swapped view is exact, not an approximation: the old code took
probs[1] as "neutral" and probs[2] as "entailment", so old_neutral == true
entailment, old_entailment == true neutral, and contradiction (index 0) never
changed. Stage 2 checks this against the published per-case scores in
experiments/results/llm_judge_comparison.json and against the published
confusion counts in grounding_score_calibration.json and ablation_results.json.

It also runs the real EvaluationPipeline once per case (as ablation.py's
Config G does), so the full pipeline's overall_risk_score and tool-claim score
are stored too. Nothing here edits backend/ or any existing result file.

HOW TO RUN (from a directory that has the model cache; needs ~1 GB RAM):
    AGENTPULSE_MODEL_CACHE_DIR=<dir holding models--cross-encoder--nli-deberta-v3-small> \\
    python experiments/grounding_recalibration_signals.py
Output: experiments/results/grounding_recalibration_2026-10-22_signals.json
Determinism: PyTorch on CPU, eval mode, no sampling; torch/numpy seeds are set anyway.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "sdk" / "src"))
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

SEED = 20261022
# `--onnx` repeats the run on the ONNX Runtime backend the production worker uses, written to a
# second file, so the PyTorch/ONNX difference on these cases can be reported.
USE_ONNX = "--onnx" in sys.argv
OUT = ROOT / "experiments" / "results" / (
    "grounding_recalibration_2026-10-22_signals_onnx.json" if USE_ONNX else "grounding_recalibration_2026-10-22_signals.json"
)
SPLITS = ["dev", "val", "test"]


def load_cases(split: str) -> list[dict]:
    with open(ROOT / "datasets" / f"v1.0_{split}.json", "r", encoding="utf-8") as f:
        return json.load(f)["cases"]


def main() -> None:
    import torch

    torch.manual_seed(SEED)
    np.random.seed(SEED)

    from app.services import grounding
    from app.services.alerting import AlertEngine
    from app.services.drift import DriftDetector
    from app.services.evaluator import EvaluationPipeline

    cache_dir = os.environ.get("AGENTPULSE_MODEL_CACHE_DIR", "./models")
    # use_onnx=False (default): the same PyTorch path ablation.py and the calibration script used.
    grounding.load_models(cache_dir=cache_dir, use_onnx=USE_ONNX, sync=True)
    if USE_ONNX and grounding.backend_info().get("nli_backend") != "onnx":
        raise SystemExit(f"ONNX requested but backend is {grounding.backend_info()}")
    loaded = grounding.models_loaded()
    if not all(loaded.values()):
        raise SystemExit(f"models not loaded: {loaded}")
    label_index = dict(grounding._nli_label_index)  # noqa: SLF001
    print("NLI label index read from model config:", label_index)

    drift = DriftDetector(window_size=20, min_samples_for_alert=5)
    pipeline = EvaluationPipeline(drift, AlertEngine(cooldown_seconds=0))

    cases_out: list[dict] = []
    for split in SPLITS:
        for c in load_cases(split):
            premise = c.get("evidence") or c["input_query"]
            claim = c["agent_claim"]
            nli = grounding.compute_nli_grounding(premise, claim)
            if nli is None:
                raise SystemExit(f"NLI returned None for {c['id']}")
            res = pipeline.evaluate_span(
                span_id=f"recal_{c['id']}",
                trace_id=f"trace_recal_{split}",
                agent_id=f"agent_recal_{split}",
                input_text=premise,
                output_text=claim,
                tool_calls=c.get("tool_records"),
            )
            tc = res.tool_claim
            cases_out.append({
                "id": c["id"],
                "split": split,
                "domain": c.get("domain"),
                "is_failure": bool(c["is_failure"]),
                "failure_type": c.get("expected_failure_type"),
                # TRUE class probabilities, read through the model's own label order.
                "contradiction": nli.contradiction_prob,
                "neutral": nli.neutral_prob,
                "entailment": nli.entailment_prob,
                "nli_label": nli.label,
                "input_tokens": nli.input_tokens,
                "input_truncated": nli.input_truncated,
                # What the full pipeline produced on the corrected labels (w = 0.5 in code).
                "pipeline_grounding_score": res.grounding.grounding_score if res.grounding else None,
                "pipeline_overall_risk": res.overall_risk_score,
                "pipeline_risk_label": res.risk_label,
                "tool_claim_score": tc.tool_claim_score if tc else None,
                "tool_total_claims": tc.total_claims if tc else None,
            })

    # v1.0_multiagent.json: no evidence/claim, only agent outputs. Grounding a downstream agent
    # against an upstream agent's output is how pipeline spans are scored (the premise is the
    # span input), so every ordered pair (earlier output = premise, later output = hypothesis)
    # is scored. Disagreement scoring only ever used the contradiction probability.
    with open(ROOT / "datasets" / "v1.0_multiagent.json", "r", encoding="utf-8") as f:
        ma_cases = json.load(f)["cases"]
    ma_out: list[dict] = []
    for c in ma_cases:
        outs = c["agent_outputs"]
        for i in range(len(outs)):
            for j in range(i + 1, len(outs)):
                nli = grounding.compute_nli_grounding(outs[i]["output"], outs[j]["output"])
                if nli is None:
                    raise SystemExit(f"NLI returned None for {c['id']} pair {i},{j}")
                ma_out.append({
                    "case_id": c["id"], "category": c["category"], "is_failure": bool(c["is_failure"]),
                    "pair": [outs[i]["agent_id"], outs[j]["agent_id"]], "adjacent": j == i + 1,
                    "is_labelled_contradicting_pair": c["contradicting_pair"] == [outs[i]["agent_id"], outs[j]["agent_id"]],
                    "contradiction": nli.contradiction_prob, "neutral": nli.neutral_prob,
                    "entailment": nli.entailment_prob, "nli_label": nli.label,
                })

    payload = {
        "generated_utc": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
        "script": "experiments/grounding_recalibration_signals.py",
        "seed": SEED,
        "nli_model": "cross-encoder/nli-deberta-v3-small",
        "backend": "onnx" if USE_ONNX else "pytorch (use_onnx=False), CPU",
        "label_index_from_model_config": label_index,
        "neutral_risk_weight_in_code": grounding.NEUTRAL_RISK_WEIGHT,
        "n_cases": {s: sum(1 for x in cases_out if x["split"] == s) for s in SPLITS},
        "cases": cases_out,
        "multiagent_pairs": ma_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1)
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(cases_out)} cases, {len(ma_out)} multiagent pairs)")


if __name__ == "__main__":
    main()
