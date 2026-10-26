"""Local Vector Retrieval Engine for AgentPulse Real-Model Workflows.

Uses sentence-transformers / MiniLM embeddings to index a curated local corpus
and perform genuine top-k semantic search over structured document chunks.
"""

# What this file is for: a tiny document search used by the demo workflows. A few
# hand-written documents live in memory. Each one is turned into an embedding (a list of
# numbers that stands for its meaning). A question is turned into an embedding too, and the
# documents whose embeddings are closest to it are returned (that is "top-k" search).
#
# How it fits in: research_assistant.py and tech_support.py call local_retriever.search().
# demo/chat_server.py, demo/multi_model_pipeline.py and several experiments use it too. The
# embeddings come from get_embedding() in the backend package (backend/app/services/
# grounding.py). It gives nothing back until its MiniLM model has been loaded in this
# process; until then a crude letter-count stand-in vector is used (see build_index()).

from __future__ import annotations

import logging
import os
# Note: `time` is imported but not used in this file.
import time
# dataclass = a class that mostly just holds fields; asdict turns one into a plain dict.
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# numpy = maths on arrays. Here: the embedding vectors and the similarity scores.
import numpy as np

logger = logging.getLogger("agentpulse.retrieval")


# One search hit. LocalVectorIndex.search() returns a list of these, best match first.
@dataclass
class RetrievedDocument:
    """A retrieved document chunk with provenance metadata."""

    # Id of the source document, and of the chunk. Each document is one chunk, so
    # chunk_id is just the document id plus "_chunk_0".
    document_id: str
    chunk_id: str
    title: str
    content: str
    # Cosine similarity between the question and this document (see search() below).
    # Higher means closer in meaning. search() rounds it to 4 decimals.
    similarity_score: float
    # Position in the results: 1 is the best match.
    rank: int
    # Extra facts copied from the corpus entry (author, year, ...). Not used for ranking.
    metadata: Dict[str, Any] = field(default_factory=dict)
    # UTC time (ISO text) set automatically when this object is created.
    retrieval_timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    # Plain-dict copy of the hit. The workflow nodes store hits in the LangGraph state
    # this way.
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Curated, realistic local knowledge corpus across research, support, and data domains
# In short: a hand-written list kept in this file. Each entry has a doc_id, a title, a
# "domain" (research, support or data_analysis; search() can filter on it), the content
# text that gets embedded and returned, and free-form metadata.
DEFAULT_CORPUS = [
    # Academic / Research Corpus
    {
        "doc_id": "doc_arxiv_01",
        "title": "Attention Is All You Need",
        "domain": "research",
        "content": "The Transformer architecture relies entirely on self-attention mechanisms to compute representations of its input and output without using sequence-aligned RNNs or convolution. Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.",
        "metadata": {"authors": "Vaswani et al.", "year": 2017, "citations": 95000},
    },
    {
        "doc_id": "doc_arxiv_02",
        "title": "DeBERTa: Decoding-enhanced BERT with Disentangled Attention",
        "domain": "research",
        "content": "DeBERTa improves the BERT and RoBERTa models using two novel techniques: a disentangled attention mechanism and an enhanced mask decoder. Unlike BERT where each word is represented using a vector that sums its content and position embeddings, each word in DeBERTa is represented using two vectors that encode its content and relative position.",
        "metadata": {"authors": "He et al.", "year": 2021, "citations": 3200},
    },
    {
        "doc_id": "doc_sqlite_01",
        "title": "SQLite Write-Ahead Logging (WAL) Architecture",
        "domain": "research",
        "content": "In WAL mode, changes are written into a separate write-ahead log file rather than the main database file. This allows readers to continue reading from the database while another process writes into the log. SQLite in WAL mode provides significantly higher concurrency than rollback journal mode.",
        "metadata": {"source": "sqlite.org", "year": 2023},
    },
    # Tech Support / Knowledge Base Corpus
    {
        "doc_id": "doc_kb_401",
        "title": "KB-401: Resolving Invalid API Key and Token Expiration Errors",
        "domain": "support",
        "content": "HTTP 401 Unauthorized errors occur when the X-API-Key header is missing, malformed, or references an expired token. Solution: Re-generate the API key in the Developer Settings panel, verify that the environment variable AGENTPULSE_API_KEY is populated, and ensure the client sends the header with each request.",
        "metadata": {"category": "auth", "severity": "medium", "resolved_cases": 1420},
    },
    {
        "doc_id": "doc_kb_429",
        "title": "KB-429: Rate Limiter Token-Bucket Backoff Strategy",
        "domain": "support",
        "content": "When request frequency exceeds 1,000 requests/minute, the token-bucket rate limiter returns HTTP 429 Too Many Requests. Applications should implement exponential backoff with jitter and utilize the in-memory SDK queue for non-blocking local buffering.",
        "metadata": {"category": "rate_limit", "severity": "low", "resolved_cases": 890},
    },
    # Data Analysis & Telemetry Corpus
    {
        "doc_id": "doc_data_kpi",
        "title": "Telemetry Performance Baseline KPI Definitions",
        "domain": "data_analysis",
        "content": "Standard operational thresholds: In-memory enqueue latency must remain below 0.05ms P95; background evaluator cascade latency target is 150ms P95; Agent Stability Index (ASI) below 70 triggers a WARNING alert, while ASI below 50 triggers a CRITICAL drift incident.",
        "metadata": {"source": "AgentPulse Engineering SRE Runbook", "version": "v1.2"},
    },
]


# Holds the documents and their embeddings, and answers search() calls. The embeddings are
# not made when the object is created; they are made once, on the first search (or when
# build_index() is called by hand).
# A crude stand-in for an embedding, used when the embedding model is not loaded in this process.
# It has 384 slots (the same length as a MiniLM embedding): add 1 to slot (character code mod
# 384) for each of the first 64 characters, then scale the vector to length 1. It is a
# letter-count fingerprint, so it does not capture meaning, and it must never be compared with a
# real model embedding: the two live in different spaces and the scores would mean nothing.
def _stand_in_vector(text: str) -> np.ndarray:
    vec = np.zeros(384, dtype=np.float32)
    for char in text[:64]:
        vec[ord(char) % 384] += 1.0
    # Dividing by the length (norm) makes the vector length 1; skip if all zeros.
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec


# The model search() embeds with. The same default as backend/app/config.py, so the cache the
# worker downloads into is the cache this reads from.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


# Loads the embedding model into this process unless it is already there. The demo entry points
# (chat_server.py, multi_model_pipeline.py) call it once at start-up; without it search() quietly
# uses the stand-in vectors above and picks documents near-randomly. The guard is needed:
# load_models cannot run twice in one process (the second load leaves torch tensors on the
# `meta` device, see SESSION_HANDOFF.md 15.3).
#
# The model cache is AGENTPULSE_MODEL_CACHE_DIR, the backend's own setting, and ./models when it
# is not set, so a script run from the folder that holds the cache still finds it.
#
# embedding_only=True loads MiniLM and nothing else. load_models always loads the NLI model as
# well, which roughly doubles the memory this process needs and is never used by search(); the
# chat container has a memory limit that MiniLM fits in and the NLI model does not. grounding.py
# has no embedding-only loader, so this fills the same module variable its get_embedding reads.
# Raises if the model cannot be loaded, so the caller knows search() would be near-random.
def ensure_embedding_model(embedding_only: bool = False) -> None:
    from app.services import grounding

    if grounding.models_loaded()["embedding_model"]:
        return
    cache_dir = os.getenv("AGENTPULSE_MODEL_CACHE_DIR") or "./models"
    if not embedding_only:
        grounding.load_models(use_onnx=False, sync=True, cache_dir=cache_dir)
        return
    from sentence_transformers import SentenceTransformer

    grounding._embedding_model = SentenceTransformer(EMBEDDING_MODEL, cache_folder=cache_dir)
    logger.info("Loaded embedding model %s from %s (embedding only).", EMBEDDING_MODEL, cache_dir)


class LocalVectorIndex:
    """In-memory semantic vector index for document retrieval."""

    # corpus: a list of document dicts shaped like DEFAULT_CORPUS entries. If it is left out
    # (or is an empty list), DEFAULT_CORPUS is used.
    def __init__(self, corpus: Optional[List[Dict[str, Any]]] = None):
        self.corpus = corpus or DEFAULT_CORPUS
        # A matrix with one row per document; stays None until build_index() runs.
        self._doc_embeddings: Optional[np.ndarray] = None
        self._is_indexed = False
        # True when the rows of _doc_embeddings came from the embedding model; False when they
        # are the letter-count stand-ins. search() reads it to embed the question the same way.
        self._index_is_real = False

    # force_stand_in=True skips the model and uses the stand-in vectors for every document.
    def build_index(self, force_stand_in: bool = False) -> None:
        """Compute embeddings for all corpus chunks."""
        # Imported here, not at the top, so the backend code is only loaded when an index
        # is really built. `app` is the backend package (backend/app).
        from app.services.grounding import get_embedding

        # Step 1: ask the model for one embedding per document, in the same order as
        # self.corpus. get_embedding returns None when the model is not loaded in this process
        # (or when encoding fails). All or nothing: if even one document gets None, every
        # document gets the stand-in vector, because a mix of the two kinds cannot be compared
        # with a single question vector.
        embeddings = []
        if not force_stand_in:
            for doc in self.corpus:
                emb = get_embedding(doc["content"])
                if emb is None:
                    embeddings = []
                    break
                embeddings.append(emb)
        self._index_is_real = len(embeddings) == len(self.corpus)
        if not self._index_is_real:
            embeddings = [_stand_in_vector(doc["content"]) for doc in self.corpus]

        # Step 2: stack the vectors into one matrix. The index counts as ready only when every
        # vector came from the model; a stand-in index is rebuilt by the next search(), so it is
        # replaced as soon as the model is loaded instead of being kept for good.
        self._doc_embeddings = np.array(embeddings, dtype=np.float32)
        self._is_indexed = self._index_is_real
        if self._index_is_real:
            logger.info("Indexed %d documents in LocalVectorIndex (model vectors).", len(self.corpus))
        else:
            logger.warning(
                "Indexed %d documents in LocalVectorIndex with stand-in letter-count vectors "
                "(embedding model not loaded, or forced): retrieval is near-random. The index is "
                "rebuilt on the next search once the model is loaded.",
                len(self.corpus),
            )

    # In: the question text, how many hits to return (top_k), and an optional domain name.
    # Out: up to top_k RetrievedDocument objects, best first. With a domain_filter only
    # documents whose "domain" equals it are considered; without one, all are.
    def search(
        self,
        query: str,
        top_k: int = 3,
        domain_filter: Optional[str] = None,
    ) -> List[RetrievedDocument]:
        """Perform semantic cosine search over indexed documents."""
        # Step 1: build the document embeddings on first use (they are then kept and reused).
        if not self._is_indexed or self._doc_embeddings is None:
            self.build_index()

        from app.services.grounding import get_embedding

        # Step 2: embed the question the same way the documents were embedded. The model can be
        # loaded (or lost) after the index was built, for example when the first search runs
        # before the model has finished loading. Then the index and the question would be
        # different kinds of vector and every score would be meaningless, so the index is
        # rebuilt to match the question.
        query_emb = get_embedding(query)
        if (query_emb is not None) != self._index_is_real:
            logger.warning(
                "The embedding model state changed since the index was built; rebuilding it."
            )
            self.build_index(force_stand_in=query_emb is None)
            if query_emb is not None and not self._index_is_real:
                # The model embedded the question but could not embed the documents:
                # use the stand-in for both sides.
                query_emb = None
        if query_emb is None:
            query_emb = _stand_in_vector(query)

        # Cosine similarities
        # Step 3: score every document. Cosine similarity = dot product of two vectors
        # divided by the product of their lengths. It measures the angle between them:
        # 1 means the same direction (similar meaning), 0 unrelated, negative opposite.
        # Both vectors normally already have length 1, so this is mostly the dot product.
        # The product of the two lengths is floored at 1e-9, so a zero-length vector cannot
        # cause a divide-by-zero.
        dot_products = np.dot(self._doc_embeddings, query_emb)
        norms = np.linalg.norm(self._doc_embeddings, axis=1) * np.linalg.norm(query_emb)
        norms = np.maximum(norms, 1e-9)
        similarities = dot_products / norms

        # Step 4: pair each score with its document, skipping documents from other domains.
        scored_docs = []
        for idx, sim in enumerate(similarities):
            doc = self.corpus[idx]
            if domain_filter and doc.get("domain") != domain_filter:
                continue
            scored_docs.append((float(sim), doc, idx))

        # Step 5: highest score first, then keep the first top_k.
        scored_docs.sort(key=lambda x: x[0], reverse=True)

        # Step 6: wrap each kept document in a RetrievedDocument. rank starts at 1; the
        # score is rounded to 4 decimals; every document counts as one chunk (chunk_0).
        results = []
        for rank, (score, doc, orig_idx) in enumerate(scored_docs[:top_k]):
            results.append(
                RetrievedDocument(
                    document_id=doc["doc_id"],
                    chunk_id=f"{doc['doc_id']}_chunk_0",
                    title=doc["title"],
                    content=doc["content"],
                    similarity_score=round(score, 4),
                    rank=rank + 1,
                    metadata=doc.get("metadata", {}),
                )
            )

        return results


# Global singleton instance
# One shared index for the whole process: other files import this one ready-made object.
# Creating it is cheap; the embeddings are only made on the first search().
local_retriever = LocalVectorIndex()
