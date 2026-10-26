"""LocalVectorIndex must embed the documents and the question the same way.

The index keeps its document vectors after the first search. If that first search ran before the
embedding model was loaded, the documents were stored as letter-count stand-ins. Once the model
was loaded, the question was embedded by the model and compared with those stand-ins, and the
scores were meaningless (a negative cosine for the best document, for example).

The model is replaced by a small fake here, so these tests need no download and give the same
answer in any order with any other test.
"""

import logging
import sys
import types
import zlib

import numpy as np
import pytest

import app.services.grounding as grounding
from demo.workflows.retrieval import EMBEDDING_MODEL, LocalVectorIndex, ensure_embedding_model

QUERY = "transformer attention"

CORPUS = [
    {
        "doc_id": "doc_transformer",
        "title": "Transformers",
        "domain": "ml",
        "content": "The transformer uses self attention to relate every token to every other token.",
        "metadata": {},
    },
    {
        "doc_id": "doc_sqlite",
        "title": "SQLite",
        "domain": "db",
        "content": "SQLite in WAL mode lets readers continue while a writer appends to the log.",
        "metadata": {},
    },
    {
        "doc_id": "doc_http",
        "title": "HTTP 429",
        "domain": "support",
        "content": "A 429 response means the client sent too many requests and should back off.",
        "metadata": {},
    },
]


def fake_model(text: str) -> np.ndarray:
    """A bag-of-words embedding: one slot per word (by a stable hash), length 1."""
    vec = np.zeros(384, dtype=np.float32)
    for word in text.lower().replace(".", "").split():
        vec[zlib.crc32(word.encode()) % 384] += 1.0
    return vec / np.linalg.norm(vec)


def test_model_loaded_after_the_index_was_built(monkeypatch):
    index = LocalVectorIndex(CORPUS)

    # First search: no model yet, so the documents are stored as stand-ins.
    monkeypatch.setattr(grounding, "get_embedding", lambda text: None)
    index.search(QUERY, top_k=1)
    assert index._index_is_real is False

    # The model finishes loading. The next search must not compare a real question vector with
    # stand-in document vectors: the index is rebuilt with real vectors first.
    monkeypatch.setattr(grounding, "get_embedding", fake_model)
    hits = index.search(QUERY, top_k=2)
    assert index._index_is_real is True
    assert hits[0].document_id == "doc_transformer"
    assert hits[0].similarity_score > 0.0
    assert hits[0].similarity_score > hits[1].similarity_score


def test_model_lost_after_the_index_was_built(monkeypatch):
    index = LocalVectorIndex(CORPUS)

    monkeypatch.setattr(grounding, "get_embedding", fake_model)
    index.search(QUERY, top_k=1)
    assert index._index_is_real is True

    # The model goes away (for example encoding starts failing). The question now falls back
    # to the stand-in, so the documents have to be rebuilt as stand-ins too.
    monkeypatch.setattr(grounding, "get_embedding", lambda text: None)
    hits = index.search(QUERY, top_k=3)
    assert index._index_is_real is False
    assert len(hits) == 3
    # Stand-in vectors only have positive slots, so a stand-in compared with a stand-in is never
    # negative. A negative score would mean the two sides were different kinds.
    assert all(hit.similarity_score >= 0.0 for hit in hits)


def test_one_document_the_model_cannot_embed_makes_the_whole_index_stand_in(monkeypatch):
    index = LocalVectorIndex(CORPUS)
    bad_text = CORPUS[1]["content"]
    monkeypatch.setattr(
        grounding, "get_embedding", lambda text: None if text == bad_text else fake_model(text)
    )

    index.build_index()

    assert index._index_is_real is False
    assert index._doc_embeddings.shape == (3, 384)


def test_model_embeds_the_question_but_not_the_documents(monkeypatch):
    index = LocalVectorIndex(CORPUS)
    monkeypatch.setattr(
        grounding, "get_embedding", lambda text: fake_model(text) if text == QUERY else None
    )

    hits = index.search(QUERY, top_k=3)

    # The documents could not be embedded by the model, so both sides use the stand-in.
    assert index._index_is_real is False
    assert len(hits) == 3
    assert all(hit.similarity_score >= 0.0 for hit in hits)


def test_a_stable_model_leaves_the_index_alone(monkeypatch):
    index = LocalVectorIndex(CORPUS)
    calls = []

    def counting_model(text: str) -> np.ndarray:
        calls.append(text)
        return fake_model(text)

    monkeypatch.setattr(grounding, "get_embedding", counting_model)

    index.search(QUERY, top_k=1)
    after_first = len(calls)
    index.search(QUERY, top_k=1)

    # First search: 3 documents + 1 question. Second search: only the question, no rebuild.
    assert after_first == 4
    assert len(calls) == after_first + 1


def test_a_stand_in_index_is_not_marked_built_and_is_rebuilt_once_the_model_loads(
    monkeypatch, caplog
):
    index = LocalVectorIndex(CORPUS)

    monkeypatch.setattr(grounding, "get_embedding", lambda text: None)
    with caplog.at_level(logging.WARNING, logger="agentpulse.retrieval"):
        index.build_index()
    assert index._is_indexed is False
    assert "stand-in" in caplog.text

    monkeypatch.setattr(grounding, "get_embedding", fake_model)
    index.search(QUERY, top_k=1)
    assert index._is_indexed is True
    assert index._index_is_real is True


def test_the_embedding_model_is_loaded_only_when_it_is_not_loaded_yet(monkeypatch):
    loads = []
    monkeypatch.setattr(grounding, "load_models", lambda **kwargs: loads.append(kwargs))
    monkeypatch.delenv("AGENTPULSE_MODEL_CACHE_DIR", raising=False)

    monkeypatch.setattr(grounding, "models_loaded", lambda: {"embedding_model": True})
    ensure_embedding_model()
    assert loads == []

    # A second load in one process would leave torch tensors on the meta device, hence the guard.
    monkeypatch.setattr(grounding, "models_loaded", lambda: {"embedding_model": False})
    ensure_embedding_model()
    assert loads == [{"use_onnx": False, "sync": True, "cache_dir": "./models"}]


def test_the_model_cache_is_the_backends_setting(monkeypatch):
    loads = []
    monkeypatch.setattr(grounding, "load_models", lambda **kwargs: loads.append(kwargs))
    monkeypatch.setattr(grounding, "models_loaded", lambda: {"embedding_model": False})
    monkeypatch.setenv("AGENTPULSE_MODEL_CACHE_DIR", "/cache/models")
    ensure_embedding_model()
    assert loads[0]["cache_dir"] == "/cache/models"


# The chat container's memory limit fits MiniLM and not the NLI model, so embedding_only must
# never go through load_models (which loads both).
def test_embedding_only_loads_minilm_and_not_the_nli_model(monkeypatch):
    made = []

    def fake_sentence_transformer(name, cache_folder):
        made.append((name, cache_folder))
        return "minilm"

    monkeypatch.setitem(
        sys.modules,
        "sentence_transformers",
        types.SimpleNamespace(SentenceTransformer=fake_sentence_transformer),
    )
    monkeypatch.setattr(grounding, "load_models", lambda **kwargs: pytest.fail("NLI model loaded"))
    monkeypatch.setattr(grounding, "models_loaded", lambda: {"embedding_model": False})
    monkeypatch.setattr(grounding, "_embedding_model", None)
    monkeypatch.setenv("AGENTPULSE_MODEL_CACHE_DIR", "/cache/models")

    ensure_embedding_model(embedding_only=True)

    assert made == [(EMBEDDING_MODEL, "/cache/models")]
    assert grounding._embedding_model == "minilm"
