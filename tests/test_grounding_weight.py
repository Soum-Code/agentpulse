"""The neutral weight in the grounding score, and what it does to the risk label.

grounding_score = contradiction_prob + NEUTRAL_RISK_WEIGHT * neutral_prob. The weight was 0.5 until
model_version v1.2. It had been chosen while entailment and neutral were swapped; re-measured on the
corrected labels (GROUNDING_RECALIBRATION_2026-10.md) 0.5 put neutral-dominant, supported cases in
the medium band at the 0.4 cut-off, so it is 0.3 and the cut-offs (0.7 high, 0.4 medium) stay.

These tests drive compute_nli_grounding with a fake model, so no model download is needed.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services import grounding
from app.services.alerting import AlertEngine
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline, EvaluationResult

# The id2label of cross-encoder/nli-deberta-v3-small (read from its config.json).
DEFAULT_MODEL_ORDER = {"contradiction": 0, "entailment": 1, "neutral": 2}


class _FakeNLI:
    """Stands in for the loaded model: a `.config` and a call that returns fixed logits."""

    def __init__(self, logits: list[float]) -> None:
        self.config = SimpleNamespace(label2id=DEFAULT_MODEL_ORDER)
        self._logits = logits

    def __call__(self, **inputs):
        return SimpleNamespace(logits=torch.tensor([self._logits]))


def _score(monkeypatch, *, contradiction: float, entailment: float, neutral: float):
    """Run the real scoring code on a model that outputs exactly these three probabilities."""
    logits = [0.0, 0.0, 0.0]
    for name, prob in (("contradiction", contradiction), ("entailment", entailment), ("neutral", neutral)):
        logits[DEFAULT_MODEL_ORDER[name]] = math.log(prob)  # softmax of log p gives back p
    model = _FakeNLI(logits)
    monkeypatch.setattr(grounding, "_nli_model", model)
    monkeypatch.setattr(grounding, "_nli_tokenizer", lambda *a, **k: {"input_ids": [1, 2, 3]})
    monkeypatch.setattr(grounding, "_nli_label_index", grounding._read_nli_label_index(model))
    result = grounding.compute_nli_grounding("premise", "claim")
    assert result is not None
    return result


def _label(score: float) -> str:
    pipeline = EvaluationPipeline(DriftDetector(window_size=10), AlertEngine(cooldown_seconds=0))
    risk = pipeline._aggregate_risk(EvaluationResult(grounding=SimpleNamespace(grounding_score=score)))
    return pipeline._classify_risk(risk)


def test_the_neutral_weight_is_0_3():
    """Pinned on purpose: changing it is a decision with a report behind it, and a new model_version."""
    assert grounding.NEUTRAL_RISK_WEIGHT == 0.3
    assert EvaluationResult().model_version == "v1.2"


def test_the_score_is_contradiction_plus_the_weight_times_neutral(monkeypatch):
    result = _score(monkeypatch, contradiction=0.2, entailment=0.3, neutral=0.5)

    assert (result.contradiction_prob, result.entailment_prob, result.neutral_prob) == pytest.approx(
        (0.2, 0.3, 0.5), abs=1e-3)
    assert result.grounding_score == pytest.approx(0.2 + 0.3 * 0.5, abs=1e-3)  # 0.35, not 0.45


def test_a_neutral_dominant_result_scores_about_0_3_and_is_low_risk(monkeypatch):
    """The case the weight was changed for: the evidence neither supports nor contradicts the claim."""
    result = _score(monkeypatch, contradiction=0.02, entailment=0.03, neutral=0.95)

    assert result.label == "neutral"
    assert result.grounding_score == pytest.approx(0.3, abs=0.02)
    assert result.grounding_score <= 0.4
    assert _label(result.grounding_score) == "low_risk"  # at the old 0.5 this was 0.495 / medium_risk


def test_a_contradiction_still_scores_about_1_and_is_high_risk(monkeypatch):
    result = _score(monkeypatch, contradiction=0.96, entailment=0.01, neutral=0.03)

    assert result.label == "contradiction"
    assert result.grounding_score == pytest.approx(1.0, abs=0.05)
    assert _label(result.grounding_score) == "high_risk"


def test_an_entailed_result_still_scores_about_0(monkeypatch):
    result = _score(monkeypatch, contradiction=0.01, entailment=0.97, neutral=0.02)

    assert result.grounding_score == pytest.approx(0.0, abs=0.03)
    assert _label(result.grounding_score) == "low_risk"
