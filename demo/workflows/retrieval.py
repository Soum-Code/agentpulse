"""Local Vector Retrieval Engine for AgentPulse Real-Model Workflows.

Uses sentence-transformers / MiniLM embeddings to index a curated local corpus
and perform genuine top-k semantic search over structured document chunks.
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger("agentpulse.retrieval")


@dataclass
class RetrievedDocument:
    """A retrieved document chunk with provenance metadata."""

    document_id: str
    chunk_id: str
    title: str
    content: str
    similarity_score: float
    rank: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    retrieval_timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Curated, realistic local knowledge corpus across research, support, and data domains
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


class LocalVectorIndex:
    """In-memory semantic vector index for document retrieval."""

    def __init__(self, corpus: Optional[List[Dict[str, Any]]] = None):
        self.corpus = corpus or DEFAULT_CORPUS
        self._doc_embeddings: Optional[np.ndarray] = None
        self._is_indexed = False

    def build_index(self) -> None:
        """Compute embeddings for all corpus chunks."""
        from app.services.grounding import get_embedding

        embeddings = []
        for doc in self.corpus:
            emb = get_embedding(doc["content"])
            if emb is None:
                # Deterministic fallback vector if models not yet in memory
                emb = np.zeros(384, dtype=np.float32)
                for char in doc["content"][:64]:
                    emb[ord(char) % 384] += 1.0
                norm = np.linalg.norm(emb)
                if norm > 0:
                    emb = emb / norm
            embeddings.append(emb)

        self._doc_embeddings = np.array(embeddings, dtype=np.float32)
        self._is_indexed = True
        logger.info("Indexed %d documents in LocalVectorIndex.", len(self.corpus))

    def search(
        self,
        query: str,
        top_k: int = 3,
        domain_filter: Optional[str] = None,
    ) -> List[RetrievedDocument]:
        """Perform semantic cosine search over indexed documents."""
        if not self._is_indexed or self._doc_embeddings is None:
            self.build_index()

        from app.services.grounding import get_embedding

        query_emb = get_embedding(query)
        if query_emb is None:
            query_emb = np.zeros(384, dtype=np.float32)
            for char in query[:64]:
                query_emb[ord(char) % 384] += 1.0
            norm = np.linalg.norm(query_emb)
            if norm > 0:
                query_emb = query_emb / norm

        # Cosine similarities
        dot_products = np.dot(self._doc_embeddings, query_emb)
        norms = np.linalg.norm(self._doc_embeddings, axis=1) * np.linalg.norm(query_emb)
        norms = np.maximum(norms, 1e-9)
        similarities = dot_products / norms

        scored_docs = []
        for idx, sim in enumerate(similarities):
            doc = self.corpus[idx]
            if domain_filter and doc.get("domain") != domain_filter:
                continue
            scored_docs.append((float(sim), doc, idx))

        scored_docs.sort(key=lambda x: x[0], reverse=True)

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
local_retriever = LocalVectorIndex()
