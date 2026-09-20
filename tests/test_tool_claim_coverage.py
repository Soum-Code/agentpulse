"""A tool_claim_score of 0.0 must be distinguishable from "nothing was checked".

Section 11 measured 8,353 prose spans from real agents and extracted zero
claims: agents write "First, I need to log into the file system application",
not "Retrieved 3 documents". Section 25.3 showed the demo only scores because
its own prompt dictates the validator's phrasing.

So in production almost every 0.0 means the validator found nothing to check,
while reading as "claims verified, all good". These tests pin the distinction
that makes the two tellable apart.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.tool_claim import ToolCallRecord, evaluate_tool_claims

RECORD = [
    ToolCallRecord(
        tool_name="local_retriever",
        result_summary="Found 3 documents",
        result_count=3,
        status="success",
    )
]


def test_verified_and_unchecked_share_a_score() -> None:
    """The ambiguity this column exists to resolve. If this ever fails, the
    score has become self-describing and tool_claims_found may be redundant."""
    verified = evaluate_tool_claims("Retrieved 3 documents.", RECORD)
    unchecked = evaluate_tool_claims("First, I need to log into the file system.", RECORD)

    assert verified.tool_claim_score == unchecked.tool_claim_score == 0.0
    assert verified.total_claims == 1
    assert unchecked.total_claims == 0


def test_prose_without_a_count_yields_no_claim() -> None:
    """Real agent prose, taken from the external corpus in Section 11."""
    for prose in [
        "First, I need to get the supervisor's profile and credentials to log in",
        "Now I have the credentials. Let me mark this task as completed",
        "I need to understand the task: Ashley wants to update RSVPs in a CSV file",
    ]:
        assert evaluate_tool_claims(prose, RECORD).total_claims == 0, prose


def test_word_numbers_are_not_extracted() -> None:
    """Documents a real limit rather than asserting it is correct.

    "I retrieved three documents" is how the models in Section 25.3 phrased it
    unprompted, and COUNT_PATTERNS is digit-only. Broadening the pattern was
    considered and rejected: the external corpus shows agents do not narrate
    counts at all, in words or digits, so this is not the binding constraint.
    """
    assert evaluate_tool_claims("I retrieved three documents.", RECORD).total_claims == 0
    assert evaluate_tool_claims("Retrieved 3 documents.", RECORD).total_claims == 1


def test_mismatch_still_detected() -> None:
    """The signal is correct when it fires; that is why it is kept."""
    result = evaluate_tool_claims("Retrieved 5 documents.", RECORD)
    assert result.total_claims == 1
    assert result.mismatches == 1
    assert result.tool_claim_score == 1.0


def test_evaluation_model_persists_the_count() -> None:
    """Guards the column itself. Computing total_claims and dropping it on the
    way to the database is the state this change exists to end."""
    from app.models import Evaluation

    assert "tool_claims_found" in Evaluation.model_fields
