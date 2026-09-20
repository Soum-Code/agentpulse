"""A grounding score computed on truncated evidence must say so on the row.

`compute_nli_grounding` measures whether the premise exceeded DeBERTa's
512-token window, and that fact reached an operator only as a logger.warning
fired once per worker process. After the first occurrence, nothing recorded
that a score described just the part of the evidence the model read.

Section 25.2 found 0 of 100 comparisons truncated on the demo corpus, which is
a property of six documents at top_k=3 rather than of grounding. A production
retriever returning longer documents crosses the limit, and that is exactly
when nobody is reading worker logs.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.grounding import MAX_NLI_TOKENS, compute_nli_grounding, load_models


@pytest.fixture(scope="module", autouse=True)
def _models() -> None:
    import os

    load_models(
        use_onnx=False,
        sync=True,
        cache_dir=os.getenv("AGENTPULSE_MODEL_CACHE_DIR", "./models"),
    )


def test_short_premise_is_not_flagged() -> None:
    result = compute_nli_grounding(
        "The Transformer relies entirely on self-attention.",
        "The evidence describes self-attention.",
    )
    assert result is not None
    assert result.input_truncated is False
    assert 0 < result.input_tokens <= MAX_NLI_TOKENS


def test_long_premise_is_flagged_and_still_scores() -> None:
    """Truncation must be reported, not swallowed, and must not fail the span.

    Built to exceed the window rather than asserted to: the sentence repeats
    until the tokeniser says the pair is over MAX_NLI_TOKENS.
    """
    premise = "Retrieval augmented generation grounds output in documents. " * 200
    result = compute_nli_grounding(premise, "The evidence describes retrieval.")

    assert result is not None, "a truncated premise must still produce a score"
    assert result.input_tokens > MAX_NLI_TOKENS
    assert result.input_truncated is True
    assert 0.0 <= result.grounding_score <= 1.0


def test_evaluation_model_persists_truncation() -> None:
    """The column is the point. Measuring truncation and dropping it before the
    row is the state this change exists to end."""
    from app.models import Evaluation

    assert "grounding_input_truncated" in Evaluation.model_fields
    assert "grounding_input_tokens" in Evaluation.model_fields
