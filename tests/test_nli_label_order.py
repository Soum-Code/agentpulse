"""The NLI output order must come from the model's config, not from a guess.

`compute_nli_grounding` used to assume contradiction=0, neutral=1, entailment=2. The default
model, cross-encoder/nli-deberta-v3-small, ships contradiction=0, entailment=1, neutral=2 in
its config.json, so every stored row had entailment_prob and neutral_prob swapped and the
`label` was wrong for two of the three classes. Contradiction sat at index 0 in both orders,
which is why disagreement scores never showed it.

These tests use a fake model with a fake config, so they need no model download. The unusual
order below matches neither the old guess nor the default model, so a hard-coded order fails.

The stored `model_version` is bumped to "v1.1" to tell the rows written after the fix from those
written before it (still "v1.0"). `python -m app.rescore_cli` scores the old rows again.
"""

from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.models import Evaluation
from app.services import evaluation_runner, grounding
from app.services.evaluator import EvaluationResult

# Mixed-case keys on purpose: the order is read with the names lower-cased.
UNUSUAL_ORDER = {"ENTAILMENT": 0, "Neutral": 1, "contradiction": 2}
# The id2label of cross-encoder/nli-deberta-v3-small (read from its config.json).
DEFAULT_MODEL_ORDER = {"contradiction": 0, "entailment": 1, "neutral": 2}


class _FakeNLI:
    """Stands in for the loaded model: a `.config` and a call that returns fixed logits."""

    def __init__(self, label2id: dict[str, int], logits: list[float]) -> None:
        self.config = SimpleNamespace(label2id=label2id)
        self._logits = logits

    def __call__(self, **inputs):
        return SimpleNamespace(logits=torch.tensor([self._logits]))


def _fake_tokenizer(*args, **kwargs):
    return {"input_ids": [1, 2, 3]}


@pytest.mark.parametrize("label2id", [UNUSUAL_ORDER, DEFAULT_MODEL_ORDER])
@pytest.mark.parametrize("winner", ["contradiction", "neutral", "entailment"])
def test_probabilities_land_on_the_names_the_config_gives(monkeypatch, label2id, winner):
    position = {name.lower(): idx for name, idx in label2id.items()}[winner]
    logits = [0.0, 0.0, 0.0]
    logits[position] = 10.0
    model = _FakeNLI(label2id, logits)
    monkeypatch.setattr(grounding, "_nli_model", model)
    monkeypatch.setattr(grounding, "_nli_tokenizer", _fake_tokenizer)
    monkeypatch.setattr(grounding, "_nli_label_index", grounding._read_nli_label_index(model))

    result = grounding.compute_nli_grounding("premise", "claim")

    assert result is not None
    assert result.label == winner
    probs = {
        "contradiction": result.contradiction_prob,
        "neutral": result.neutral_prob,
        "entailment": result.entailment_prob,
    }
    assert probs[winner] > 0.99
    # The score is contradiction + NEUTRAL_RISK_WEIGHT * neutral, so a model that is sure of
    # one class gives 1.0, the weight, or 0.0. The weight is read, not repeated, so re-fitting
    # it does not break this test.
    expected = {"contradiction": 1.0, "neutral": grounding.NEUTRAL_RISK_WEIGHT, "entailment": 0.0}
    assert result.grounding_score == pytest.approx(expected[winner], abs=0.01)


def test_a_model_with_unrecognised_labels_is_refused():
    model = _FakeNLI({"LABEL_0": 0, "LABEL_1": 1, "LABEL_2": 2}, [0.0, 0.0, 0.0])
    with pytest.raises(ValueError, match="Refusing to guess"):
        grounding._read_nli_label_index(model)


def test_a_persisted_evaluation_row_carries_the_new_model_version(monkeypatch):
    """persist_results copies the evaluator's model_version into the row.

    A fake session stands in for the database: with no overall_risk_score the function only
    adds the row and commits, so nothing else of the database is touched.
    """
    added = []

    class _FakeSession:
        def add(self, row):
            added.append(row)

        async def commit(self):
            pass

    @asynccontextmanager
    async def _fake_get_session():
        yield _FakeSession()

    async def _not_yet_evaluated(span_id):
        return False

    monkeypatch.setattr(evaluation_runner, "get_session", _fake_get_session)
    monkeypatch.setattr(evaluation_runner, "evaluation_exists", _not_yet_evaluated)
    payload = {"span_id": "span-1", "trace_id": "trace-1", "agent_id": "agent-1"}

    written = asyncio.run(evaluation_runner.persist_results(payload, EvaluationResult()))

    assert written is True
    (row,) = [r for r in added if isinstance(r, Evaluation)]
    assert row.model_version == "v1.1"
