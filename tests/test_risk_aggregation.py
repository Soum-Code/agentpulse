"""What goes into overall_risk_score, and what must stay out of it.

Two checks used to leak a number that means "nothing was measured" into the average:

* a tool-claim result with `total_claims == 0` has `tool_claim_score` 0.0 ("no claim to check"),
  which the average read as "checked and clean" at weight 0.25;
* the disagreement score, measured at chance (SESSION_HANDOFF.md 24.9.4) and withdrawn as an
  alert, still weighed 0.20; and when every earlier agent was gated as off-topic the evaluator
  stored disagreement 0.0 ("aligned") although no pair was ever compared.

The pipeline is driven with its sub-evaluators replaced, so no model is needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services import evaluator
from app.services.alerting import AlertEngine
from app.services.disagreement import DisagreementResult, TraceDisagreementResult
from app.services.drift import DriftDetector
from app.services.evaluator import EvaluationPipeline, EvaluationResult
from app.services.grounding import GroundingResult
from app.services.tool_claim import ToolClaimResult


def _pipeline() -> EvaluationPipeline:
    return EvaluationPipeline(DriftDetector(window_size=10), AlertEngine(cooldown_seconds=0))


def _grounding(score: float) -> GroundingResult:
    return GroundingResult(
        grounding_score=score,
        entailment_prob=0.0,
        contradiction_prob=0.0,
        neutral_prob=0.0,
        label="neutral",
        evaluation_stage="stage2",
        latency_ms=0.0,
    )


def _disagreement(score: float) -> DisagreementResult:
    return DisagreementResult(
        disagreement_score=score,
        source_agent_id="planner",
        target_agent_id="writer",
        is_disagreement=True,
        explanation="",
    )


def test_a_tool_check_with_no_claims_leaves_the_risk_alone():
    """Grounding 0.8 alone is 0.8; a tool call that made no checkable claim must not dilute it."""
    result = EvaluationResult(
        grounding=_grounding(0.8),
        tool_claim=ToolClaimResult(total_claims=0, tool_claim_score=0.0),
    )

    score = _pipeline()._aggregate_risk(result)

    assert score == 0.8
    assert _pipeline()._classify_risk(score) == "high_risk"


def test_a_tool_check_that_found_claims_still_counts():
    """The fix must not drop the tool term altogether: one clean claim still pulls risk down."""
    result = EvaluationResult(
        grounding=_grounding(0.8),
        tool_claim=ToolClaimResult(total_claims=1, tool_claim_score=0.0),
    )

    assert _pipeline()._aggregate_risk(result) == round(0.8 * 0.40 / 0.65, 4)


def test_a_planner_contradiction_does_not_move_the_risk():
    """The disagreement score stays stored and shown, but it is not averaged in."""
    result = EvaluationResult(
        grounding=_grounding(0.2),
        disagreement=_disagreement(0.9999),
    )

    score = _pipeline()._aggregate_risk(result)

    assert score == 0.2
    assert _pipeline()._classify_risk(score) == "low_risk"


@pytest.mark.parametrize(
    ("gated", "expected_stored"),
    [
        (2, None),  # every pair was off-topic: nothing was compared
        (1, 0.0),  # one pair was really compared and found clean
    ],
)
def test_all_pairs_gated_stores_no_disagreement_score(monkeypatch, gated, expected_stored):
    monkeypatch.setattr(evaluator, "evaluate_grounding", lambda i, o: _grounding(0.8))
    monkeypatch.setattr(evaluator, "get_embedding", lambda text: None)
    monkeypatch.setattr(
        evaluator,
        "evaluate_against_prior_agents",
        lambda **kwargs: TraceDisagreementResult(
            max_disagreement_score=0.0,
            is_disagreement=False,
            pairs_evaluated=2,
            pairs_gated_low_relevance=gated,
        ),
    )

    result = _pipeline().evaluate_span(
        span_id="s1",
        trace_id="t1",
        agent_id="writer",
        input_text="evidence",
        output_text="answer",
        prior_agent_outputs=[("planner", "plan"), ("researcher", "notes")],
    )

    if expected_stored is None:
        assert result.disagreement is None
    else:
        assert result.disagreement.disagreement_score == expected_stored
    assert result.overall_risk_score == 0.8
    assert result.risk_label == "high_risk"
