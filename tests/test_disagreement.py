"""Tests for inter-agent disagreement evaluation and baseline policy management."""

import pytest
import numpy as np
from app.services.disagreement import evaluate_inter_agent_disagreement
from app.services.drift import DriftDetector


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
