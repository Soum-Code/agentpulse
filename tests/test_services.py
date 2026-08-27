"""Tests for backend evaluation services."""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
import numpy as np

from app.services.drift import DriftDetector, DriftResult
from app.services.alerting import AlertEngine, PendingAlert
from app.services.tool_claim import (
    extract_claims,
    validate_claims,
    evaluate_tool_claims,
    ToolClaim,
    ToolCallRecord,
)


# ─── Drift Detector Tests ─────────────────────────────────────────────

class TestDriftDetector:
    def test_initial_analysis_bootstrapping(self):
        detector = DriftDetector(window_size=10)
        emb = np.random.randn(384).astype(np.float32)
        result = detector.analyze("agent1", embedding=emb)
        assert result.is_bootstrapping is True
        assert result.baseline_size == 0

    def test_stable_embeddings_low_drift(self):
        detector = DriftDetector(window_size=5)
        base_emb = np.random.randn(384).astype(np.float32)
        base_emb = base_emb / np.linalg.norm(base_emb)

        for _ in range(10):
            noise = np.random.randn(384).astype(np.float32) * 0.01
            emb = base_emb + noise
            emb = emb / np.linalg.norm(emb)
            result = detector.analyze("agent1", embedding=emb)

        assert result.centroid_distance is not None
        assert result.centroid_distance < 0.05  # Very low drift

    def test_asi_computation(self):
        detector = DriftDetector(window_size=5)
        emb = np.random.randn(384).astype(np.float32)
        emb = emb / np.linalg.norm(emb)

        result = detector.analyze(
            "agent1", embedding=emb, risk_score=0.2, is_error=False,
        )
        assert result.stability_index is not None
        assert 0 <= result.stability_index <= 100

    def test_high_drift_detection(self):
        detector = DriftDetector(window_size=5)

        # Build baseline with consistent embeddings
        base_emb = np.ones(384, dtype=np.float32)
        base_emb = base_emb / np.linalg.norm(base_emb)
        for _ in range(10):
            detector.analyze("agent1", embedding=base_emb)

        # Inject very different embedding
        drift_emb = -base_emb  # Opposite direction
        result = detector.analyze("agent1", embedding=drift_emb)

        assert result.centroid_distance is not None
        assert result.centroid_distance > 0.5  # Significant drift

    def test_baseline_info(self):
        detector = DriftDetector(window_size=10)
        emb = np.random.randn(384).astype(np.float32)
        detector.analyze("agent1", embedding=emb)

        info = detector.get_baseline_info("agent1")
        assert info["agent_id"] == "agent1"
        assert info["sample_count"] == 1
        assert info["has_centroid"] is True

    def test_error_drift_tracking(self):
        detector = DriftDetector(window_size=20)

        # No errors initially
        for _ in range(15):
            detector.analyze("agent1", is_error=False)

        # Start erroring
        for _ in range(5):
            result = detector.analyze("agent1", is_error=True)

        assert result.error_rate_delta is not None
        assert result.error_rate_delta >= 0


class TestWindowCentroidDistance:
    """The windowed-mean drift signal.

    `centroid_distance` compares one output against an EMA centroid, which on
    real agent traces flagged 91.7% of unchanged operation at the 0.30
    threshold -- a multi-step agent legitimately says something different at
    every step. Comparing window means instead measured 6.8% false alarms and
    AUC 0.9532 against real content change. See
    DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md sections 6 and 10.
    """

    BASELINE_N = 5
    WINDOW_N = 4

    @staticmethod
    def _unit(seed_value: float) -> np.ndarray:
        vec = np.full(384, seed_value, dtype=np.float32)
        return vec / np.linalg.norm(vec)

    def _detector(self) -> DriftDetector:
        """Both window sizes set explicitly — they are independent knobs."""
        return DriftDetector(
            min_samples_for_alert=self.BASELINE_N, mean_window=self.WINDOW_N
        )

    def _feed(self, detector, embedding, times):
        result = None
        for _ in range(times):
            result = detector.analyze("agent1", embedding=embedding)
        return result

    def test_none_while_baseline_fills(self):
        """No baseline yet means no comparison — not a zero-drift reading."""
        detector = self._detector()
        emb = self._unit(1.0)
        for _ in range(self.BASELINE_N):
            assert detector.analyze("agent1", embedding=emb).window_centroid_distance is None

    def test_none_until_current_window_is_full(self):
        """A mean over one sample is an individual output, not a window mean.

        Reporting partial windows measured a 26% false-alarm rate against 5%
        once withheld — see DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md §10.
        """
        detector = self._detector()
        emb = self._unit(1.0)
        self._feed(detector, emb, self.BASELINE_N)
        for _ in range(self.WINDOW_N - 1):
            assert detector.analyze("agent1", embedding=emb).window_centroid_distance is None
        assert detector.analyze("agent1", embedding=emb).window_centroid_distance is not None

    def test_stable_content_stays_near_zero(self):
        detector = self._detector()
        emb = self._unit(1.0)
        result = self._feed(detector, emb, self.BASELINE_N + self.WINDOW_N)
        assert result.window_centroid_distance is not None
        assert result.window_centroid_distance < 0.05

    def test_sustained_shift_is_detected(self):
        detector = self._detector()
        baseline, shifted = self._unit(1.0), -self._unit(1.0)
        self._feed(detector, baseline, self.BASELINE_N)
        result = self._feed(detector, shifted, self.WINDOW_N)
        assert result.window_centroid_distance > 0.5

    def test_baseline_outputs_never_enter_the_current_window(self):
        """The two pools must stay disjoint.

        When baseline embeddings leaked into the current window, the current
        mean was pulled back toward the baseline and real drift was suppressed
        — at the production window size only 37 of 500 real sessions ever
        accumulated a clean window.
        """
        detector = self._detector()
        baseline, shifted = self._unit(1.0), -self._unit(1.0)
        self._feed(detector, baseline, self.BASELINE_N)
        result = self._feed(detector, shifted, self.WINDOW_N)
        # A shared window would average baseline and shifted toward ~0.
        assert result.window_centroid_distance == pytest.approx(2.0, abs=0.01)

    def test_single_spike_is_absorbed_by_design(self):
        """Documents the trade-off rather than treating it as a defect.

        Pooling averages a lone outlier away, which is why this signal is added
        alongside `centroid_distance` rather than replacing it: the old field
        stays responsible for single-output spikes, and still catches this one.
        """
        detector = self._detector()
        baseline, spike = self._unit(1.0), -self._unit(1.0)
        self._feed(detector, baseline, self.BASELINE_N)
        self._feed(detector, baseline, self.WINDOW_N)

        result = detector.analyze("agent1", embedding=spike)
        assert result.window_centroid_distance < 0.9   # absorbed by the window mean
        assert result.centroid_distance > 0.5          # still caught by the spike signal

    def test_reset_clears_window_state(self):
        detector = self._detector()
        emb = self._unit(1.0)
        result = self._feed(detector, emb, self.BASELINE_N + self.WINDOW_N)
        assert result.window_centroid_distance is not None

        detector.reset_baseline("agent1")
        assert detector.analyze("agent1", embedding=emb).window_centroid_distance is None

    def test_frozen_baseline_still_measures_drift(self):
        """Freezing locks the baseline; the current window keeps moving."""
        detector = self._detector()
        baseline, shifted = self._unit(1.0), -self._unit(1.0)
        self._feed(detector, baseline, self.BASELINE_N)
        detector.freeze_baseline("agent1")

        result = self._feed(detector, shifted, self.WINDOW_N)
        assert result.window_centroid_distance > 0.5


# ─── Alert Engine Tests ───────────────────────────────────────────────

class TestAlertEngine:
    def test_high_risk_triggers_alert(self):
        engine = AlertEngine(hallucination_threshold=0.7)
        alerts = engine.evaluate(
            trace_id="trace1",
            agent_id="agent1",
            risk_score=0.85,
        )
        assert len(alerts) >= 1
        assert any(a.alert_type == "HIGH_HALLUCINATION_RISK" for a in alerts)

    def test_low_risk_no_alert(self):
        engine = AlertEngine(hallucination_threshold=0.7)
        alerts = engine.evaluate(
            trace_id="trace1",
            agent_id="agent1",
            risk_score=0.2,
        )
        hallucination_alerts = [a for a in alerts if a.alert_type == "HIGH_HALLUCINATION_RISK"]
        assert len(hallucination_alerts) == 0

    def test_cooldown_deduplication(self):
        engine = AlertEngine(
            hallucination_threshold=0.7,
            cooldown_seconds=300,
        )
        # First alert fires
        alerts1 = engine.evaluate(trace_id="t1", agent_id="a1", risk_score=0.9)
        assert len(alerts1) >= 1

        # Second identical alert within cooldown — should NOT fire
        alerts2 = engine.evaluate(trace_id="t2", agent_id="a1", risk_score=0.9)
        hallucination_alerts = [a for a in alerts2 if a.alert_type == "HIGH_HALLUCINATION_RISK"]
        assert len(hallucination_alerts) == 0

    def test_drift_alert(self):
        """DRIFT_DETECTED fires on the windowed-mean field.

        It used to fire on `centroid_distance`, which flagged 91.7% of
        unchanged operation on real traces at this same threshold. See
        DRIFT_REAL_TEXT_DIAGNOSIS_REPORT.md §11.
        """
        engine = AlertEngine(drift_threshold=0.3)
        alerts = engine.evaluate(
            trace_id="t1",
            agent_id="a1",
            window_centroid_distance=0.5,
        )
        drift_alerts = [a for a in alerts if a.alert_type == "DRIFT_DETECTED"]
        assert len(drift_alerts) >= 1

    def test_drift_alert_silent_when_windows_not_full(self):
        """No measurement means no alert, even with a large single-output spike.

        `window_centroid_distance` is None until both windows fill. The
        detector staying silent on short traces is deliberate, not a gap.
        """
        engine = AlertEngine(drift_threshold=0.3)
        alerts = engine.evaluate(
            trace_id="t1",
            agent_id="a1",
            centroid_distance=1.9,
            window_centroid_distance=None,
        )
        assert [a for a in alerts if a.alert_type == "DRIFT_DETECTED"] == []

    def test_asi_drop_alert(self):
        engine = AlertEngine(asi_low_threshold=50.0)
        alerts = engine.evaluate(
            trace_id="t1",
            agent_id="a1",
            stability_index=30.0,
        )
        asi_alerts = [a for a in alerts if a.alert_type == "ASI_DROP"]
        assert len(asi_alerts) >= 1

    def test_alert_storm_suppression(self):
        engine = AlertEngine(
            hallucination_threshold=0.1,
            max_per_hour=3,
            cooldown_seconds=0,  # Disable cooldown
        )
        total = 0
        for i in range(10):
            alerts = engine.evaluate(
                trace_id=f"t{i}",
                agent_id=f"a{i}",  # Different agents to avoid dedup
                risk_score=0.9,
            )
            total += len(alerts)

        # Should be capped
        assert total <= 5  # Allow some slack for multiple rules


# ─── Tool Claim Tests ─────────────────────────────────────────────────

class TestToolClaim:
    def test_extract_tool_claims(self):
        text = "I used the search tool to find papers and retrieved 5 results."
        claims = extract_claims(text)
        assert len(claims) >= 1

    def test_extract_count_claims(self):
        text = "Found 10 results from the database search."
        claims = extract_claims(text)
        count_claims = [c for c in claims if c.claimed_count is not None]
        assert len(count_claims) >= 1
        assert any(c.claimed_count == 10 for c in count_claims)

    def test_validate_matching_claims(self):
        claims = [ToolClaim(tool_name="search", claim_text="used search")]
        tools = [ToolCallRecord(tool_name="search")]
        result = validate_claims(claims, tools)
        assert result.tool_claim_score == 0.0
        assert result.mismatches == 0

    def test_validate_fabricated_tool(self):
        claims = [ToolClaim(tool_name="nonexistent_api", claim_text="used api")]
        tools = [ToolCallRecord(tool_name="search")]
        result = validate_claims(claims, tools)
        assert result.mismatches >= 1
        assert result.tool_claim_score > 0

    def test_validate_count_mismatch(self):
        claims = [ToolClaim(tool_name="search", claim_text="found results", claimed_count=10)]
        tools = [ToolCallRecord(tool_name="search", result_count=3)]
        result = validate_claims(claims, tools)
        wrong_count = [m for m in result.matches if m.mismatch_type == "WRONG_COUNT"]
        assert len(wrong_count) >= 1

    def test_empty_claims(self):
        result = validate_claims([], [])
        assert result.tool_claim_score == 0.0
        assert result.total_claims == 0

    def test_full_pipeline(self):
        text = "I searched the database and found 5 papers on transformers."
        tools = [ToolCallRecord(tool_name="database", result_count=5)]
        result = evaluate_tool_claims(text, tools)
        assert isinstance(result.tool_claim_score, float)
        assert result.tool_claim_score == 0.0

    def test_exact_numeric_match(self):
        text = "Query returned 3 items successfully."
        tools = [ToolCallRecord(tool_name="query", result_count=3)]
        result = evaluate_tool_claims(text, tools)
        assert result.tool_claim_score == 0.0
        assert result.mismatches == 0

    def test_wrong_tool_invoked(self):
        text = "Executed the calculator tool to compute variance."
        tools = [ToolCallRecord(tool_name="database_lookup")]
        result = evaluate_tool_claims(text, tools)
        assert result.mismatches >= 1
        assert result.tool_claim_score > 0.0

    def test_ambiguous_natural_language_claim(self):
        text = "We reviewed several relevant documents."
        tools = [ToolCallRecord(tool_name="search", result_count=4)]
        result = evaluate_tool_claims(text, tools)
        # Without explicit number/tool name, score remains low
        assert result.tool_claim_score <= 0.5

    def test_paraphrased_claim_with_count(self):
        text = "Altogether, 7 publications were identified."
        tools = [ToolCallRecord(tool_name="search", result_count=7)]
        result = evaluate_tool_claims(text, tools)
        assert result.tool_claim_score == 0.0
