"""Alert-rule behaviour, and one rule that is deliberately absent.

The withdrawn AGENT_DISAGREEMENT rule is the reason this file exists. It was
added for a good reason -- without it a cross-agent contradiction cannot reach
an operator -- and withdrawn for a better one: the score it fired on carries no
information (SESSION_HANDOFF.md 24.9.4-24.9.5). Both facts make it exactly the
kind of rule someone re-adds in six months from the comment alone, so the
absence is asserted rather than left to a code comment.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.alerting import AlertEngine


@pytest.fixture
def engine() -> AlertEngine:
    # Cooldown off so each assertion is independent of the ones before it.
    return AlertEngine(cooldown_seconds=0)


def test_disagreement_alone_raises_no_alert(engine: AlertEngine) -> None:
    """A near-certain disagreement, by itself, must not alert.

    0.9999 is not hypothetical: it is what a real trace produced while the
    verifier was correct and the signal was reacting to a planner's questions.
    """
    alerts = engine.evaluate(
        trace_id="t1", span_id="s1", agent_id="verifier",
        disagreement_score=0.9999,
    )
    assert [a.alert_type for a in alerts] == []


def test_no_rule_references_disagreement_score(engine: AlertEngine) -> None:
    """Guards the withdrawal against a rule being re-added under any name.

    Asserting on the emitted alert type would miss a rule that fires on
    disagreement_score with a different alert_type; this checks the field.
    """
    referencing = [r.alert_type for r in engine._rules if r.condition_field == "disagreement_score"]
    assert referencing == [], (
        f"{referencing} fires on disagreement_score. That signal measures at chance "
        "once the planner comparison is removed -- see SESSION_HANDOFF.md 24.9.5 "
        "before restoring it."
    )


def test_grounding_alert_still_fires(engine: AlertEngine) -> None:
    """The withdrawal must not have disturbed the rules around it."""
    alerts = engine.evaluate(
        trace_id="t2", span_id="s2", agent_id="analyst",
        risk_score=0.95, grounding_score=0.95,
    )
    assert alerts, "expected a high-risk alert for risk_score 0.95"
    assert all(a.severity in {"HIGH", "MEDIUM"} for a in alerts)


def test_disagreement_does_not_suppress_a_real_alert(engine: AlertEngine) -> None:
    """A span carrying both a real risk and a disagreement still alerts.

    Withdrawing a rule should remove one alert, not filter the span.
    """
    alerts = engine.evaluate(
        trace_id="t3", span_id="s3", agent_id="analyst",
        risk_score=0.95, grounding_score=0.95, disagreement_score=0.99,
    )
    assert alerts
    assert "AGENT_DISAGREEMENT" not in {a.alert_type for a in alerts}
