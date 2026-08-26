"""Tests for inter-agent disagreement evaluation and baseline policy management."""

import pytest
import numpy as np
from app.services import disagreement as disagreement_module
from app.services.disagreement import (
    RELEVANCE_FLOOR,
    evaluate_inter_agent_disagreement,
    evaluate_trace_disagreements,
)
from app.services.drift import DriftDetector
from app.services.grounding import GroundingResult


class TestDisagreementAndBaseline:
    def test_disagreement_same_agent_skipped(self):
        res = evaluate_inter_agent_disagreement("agent_a", "output a", "agent_a", "output a")
        assert res is None

    def test_disagreement_empty_text_skipped(self):
        res = evaluate_inter_agent_disagreement("agent_a", "", "agent_b", "output b")
        assert res is None

    def test_baseline_freeze_and_unfreeze(self):
        detector = DriftDetector(window_size=10, min_samples_for_alert=5)
        
        # Feed sample 1
        embedding1 = np.ones(384, dtype=np.float32)
        res1 = detector.analyze("agent_x", embedding=embedding1)
        assert res1.is_bootstrapping is True
        
        # Freeze baseline
        assert detector.freeze_baseline("agent_x") is True
        
        info = detector.get_baseline_info("agent_x")
        assert info["is_frozen"] is True
        
        # Feed contrasting sample while frozen
        embedding2 = -np.ones(384, dtype=np.float32)
        res2 = detector.analyze("agent_x", embedding=embedding2)
        assert res2.is_frozen is True
        
        # Unfreeze
        detector.unfreeze_baseline("agent_x")
        assert detector.get_baseline_info("agent_x")["is_frozen"] is False

    def test_baseline_reset(self):
        detector = DriftDetector(window_size=10)
        embedding = np.ones(384, dtype=np.float32)
        detector.analyze("agent_y", embedding=embedding)

        detector.reset_baseline("agent_y")
        info = detector.get_baseline_info("agent_y")
        assert info["sample_count"] == 0
        assert info["has_centroid"] is False
        assert info["baseline_version"] == 2


# ─── Detection-path tests ─────────────────────────────────────────────
#
# The tests above only cover paths that return None. They pass whether or not
# the NLI model is loaded, because without models `compute_nli_grounding`
# returns None and the engine short-circuits -- so nothing above proves the
# engine ever detects a contradiction.
#
# These tests patch the two model calls instead of loading real weights. That
# is deliberate: model *behaviour* is measured empirically by
# experiments/disagreement_benchmark.py against a labelled dataset, whereas the
# gating, pairing and aggregation logic below is deterministic and belongs in a
# fast unit test. Loading real models here would add ~20s to a 2s suite and
# would test DeBERTa, not this module.

def _nli(contradiction_prob: float) -> GroundingResult:
    """Minimal GroundingResult carrying a chosen contradiction probability."""
    return GroundingResult(
        grounding_score=contradiction_prob,
        entailment_prob=1.0 - contradiction_prob,
        contradiction_prob=contradiction_prob,
        neutral_prob=0.0,
        label="contradiction" if contradiction_prob >= 0.5 else "entailment",
        evaluation_stage="stage2",
        latency_ms=0.0,
    )


@pytest.fixture
def stub_models(monkeypatch):
    """Patch NLI + similarity with per-call scripted values.

    Returns a setter taking (contradiction_prob, similarity); similarity=None
    simulates the embedding model being unavailable.
    """
    state = {"contra": 0.0, "sim": 1.0}

    def fake_nli(source_text, claim_text):
        return _nli(state["contra"])

    def fake_sim(source_text, claim_text):
        return state["sim"]

    monkeypatch.setattr(disagreement_module, "compute_nli_grounding", fake_nli)
    monkeypatch.setattr(disagreement_module, "compute_semantic_similarity", fake_sim)

    def configure(contra, sim=1.0):
        state["contra"] = contra
        state["sim"] = sim

    return configure


class TestDisagreementDetection:
    def test_contradiction_on_topic_is_flagged(self, stub_models):
        stub_models(contra=0.95, sim=0.80)
        res = evaluate_inter_agent_disagreement("a", "x", "b", "y")
        assert res is not None
        assert res.is_disagreement is True
        assert res.gated_low_relevance is False
        assert res.disagreement_score == pytest.approx(0.95)

    def test_agreement_on_topic_is_not_flagged(self, stub_models):
        stub_models(contra=0.02, sim=0.90)
        res = evaluate_inter_agent_disagreement("a", "x", "b", "y")
        assert res.is_disagreement is False
        assert res.gated_low_relevance is False

    def test_high_contradiction_off_topic_is_gated(self, stub_models):
        """The measured FPR-0.300 failure: unrelated outputs scoring as contradictions."""
        stub_models(contra=0.99, sim=0.20)
        res = evaluate_inter_agent_disagreement("planner", "x", "retriever", "y")
        assert res.gated_low_relevance is True
        assert res.is_disagreement is False
        # The raw score is still reported -- gating suppresses the flag, not the evidence.
        assert res.disagreement_score == pytest.approx(0.99)

    def test_gate_can_be_disabled(self, stub_models):
        stub_models(contra=0.99, sim=0.20)
        res = evaluate_inter_agent_disagreement(
            "a", "x", "b", "y", relevance_floor=0.0
        )
        assert res.gated_low_relevance is False
        assert res.is_disagreement is True

    def test_gate_fails_open_when_similarity_unavailable(self, stub_models):
        """Missing embedding model must not silently suppress every signal."""
        stub_models(contra=0.99, sim=None)
        res = evaluate_inter_agent_disagreement("a", "x", "b", "y")
        assert res.gated_low_relevance is False
        assert res.is_disagreement is True
        assert res.semantic_similarity is None

    def test_similarity_just_below_floor_is_gated(self, stub_models):
        stub_models(contra=0.99, sim=RELEVANCE_FLOOR - 0.01)
        assert evaluate_inter_agent_disagreement("a", "x", "b", "y").gated_low_relevance

    def test_similarity_at_floor_is_not_gated(self, stub_models):
        stub_models(contra=0.99, sim=RELEVANCE_FLOOR)
        assert not evaluate_inter_agent_disagreement("a", "x", "b", "y").gated_low_relevance


class TestTraceDisagreements:
    def test_requires_at_least_two_usable_outputs(self, stub_models):
        stub_models(contra=0.99, sim=0.9)
        assert evaluate_trace_disagreements([("a", "only one")]) is None
        assert evaluate_trace_disagreements([("a", "x"), ("b", "")]) is None

    def test_non_adjacent_pair_is_compared(self, stub_models):
        """Regression for the architectural miss found in the A1 baseline run.

        Adjacent-only comparison never evaluates (first, last) in a 3-agent
        trace; benchmark cases ma_06/ma_07 went undetected for exactly this
        reason despite the conflicting pair scoring 1.000 when compared.
        """
        stub_models(contra=0.99, sim=0.9)
        res = evaluate_trace_disagreements(
            [("triager", "low severity"), ("investigator", "traced fault"), ("escalator", "high severity")]
        )
        assert res is not None
        # 3 agents -> 3 pairs, including the non-adjacent (triager, escalator).
        assert res.pairs_evaluated == 3
        compared = {(p.source_agent_id, p.target_agent_id) for p in res.flagged_pairs}
        assert ("triager", "escalator") in compared

    def test_all_pairs_gated_yields_no_disagreement(self, stub_models):
        stub_models(contra=0.99, sim=0.10)
        res = evaluate_trace_disagreements([("a", "x"), ("b", "y"), ("c", "z")])
        assert res.is_disagreement is False
        assert res.pairs_gated_low_relevance == 3
        assert res.flagged_pairs == []
        assert res.max_disagreement_score == 0.0

    def test_max_pairs_degrades_to_adjacent_only(self, stub_models):
        """Cost guard: O(N^2) growth must be bounded, not unbounded."""
        stub_models(contra=0.99, sim=0.9)
        outputs = [(f"agent_{i}", f"output {i}") for i in range(6)]
        # 6 agents -> 15 all-pairs, capped to adjacent-only (5 comparisons).
        res = evaluate_trace_disagreements(outputs, max_pairs=4)
        assert res.pairs_evaluated == 5
        assert "adjacent pairs only" in res.explanation

    def test_max_score_reported_across_pairs(self, stub_models):
        stub_models(contra=0.75, sim=0.9)
        res = evaluate_trace_disagreements([("a", "x"), ("b", "y")])
        assert res.max_disagreement_score == pytest.approx(0.75)
        assert res.is_disagreement is True
