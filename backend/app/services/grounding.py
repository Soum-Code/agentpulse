"""NLI-based grounding evaluator using DeBERTa-v3-small.

Two-stage cascade:
  Stage 1: MiniLM semantic similarity (cheap, fast ~20ms)
  Stage 2: DeBERTa NLI (accurate, slower ~80ms) — only when Stage 1 is ambiguous

Design decisions:
- ONNX Runtime for CPU inference optimization
- Models loaded once at startup, reused for all evaluations
- Thread-safe: models are read-only after loading
- Fail-open: evaluation failure returns None, never blocks
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np

logger = logging.getLogger("agentpulse.evaluator.grounding")

# Lazy imports to avoid loading models at import time
_nli_model = None
_nli_tokenizer = None
_embedding_model = None

# Which inference backend the NLI model is ACTUALLY running on, as opposed to
# which one was asked for.
#
# This exists because `models_loaded()` reports `nli_model: True` whether the
# ONNX Runtime path loaded or the PyTorch fallback did. The system therefore
# ran a slower backend than configured with no observable signal beyond one
# log line at startup -- for a platform whose purpose is observability, not
# observing its own degraded execution mode is a defect in itself, separate
# from the performance cost.
#
# Values: "onnx" | "pytorch" | None (not loaded).
_nli_backend: Optional[str] = None
_nli_backend_requested: Optional[str] = None
_nli_backend_fallback_reason: Optional[str] = None


@dataclass
class GroundingResult:
    """Result of a grounding evaluation."""

    grounding_score: float  # 0.0 = grounded, 1.0 = ungrounded
    entailment_prob: float
    contradiction_prob: float
    neutral_prob: float
    label: str  # "entailment", "contradiction", "neutral"
    evaluation_stage: str  # "stage1", "stage2"
    latency_ms: float
    semantic_similarity: Optional[float] = None


# Stage 1: Semantic Similarity

STAGE1_SAFE_THRESHOLD = 0.85  # Above this: likely grounded, skip Stage 2
STAGE1_RISK_THRESHOLD = 0.40  # Below this: likely problematic, go to Stage 2

# grounding_score = contradiction_prob + NEUTRAL_RISK_WEIGHT * neutral_prob.
# DeBERTa NLI classifies verbatim/near-verbatim premise-hypothesis pairs as
# "neutral" far more often than "entailment" (out-of-distribution for a model
# trained on genuine NLI pairs), so scoring neutral the same as contradiction
# (the old grounding_score = 1 - entailment_prob, i.e. weight 1.0) makes
# well-supported claims read as near-maximum risk. 0.5 is a principled default
# (neutral counts as half as risky as contradiction) rather than a value fitted
# to data -- the dev split was too small/clear-cut to discriminate between
# candidate weights. See GROUNDING_SCORE_CALIBRATION_REPORT.md for the full
# sweep, the self-comparison demonstration, and the held-out test-split
# improvement this produced (F1 0.703 -> 0.963, FPR 0.647 -> 0.059).
NEUTRAL_RISK_WEIGHT = 0.5


def compute_semantic_similarity(
    source_text: str,
    claim_text: str,
) -> Optional[float]:
    """Compute cosine similarity between source and claim using MiniLM.
    
    Returns similarity score ∈ [0, 1] or None on failure.
    """
    global _embedding_model

    if _embedding_model is None:
        return None

    try:
        embeddings = _embedding_model.encode(
            [source_text, claim_text],
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        similarity = float(np.dot(embeddings[0], embeddings[1]))
        return max(0.0, min(1.0, similarity))
    except Exception as exc:
        logger.warning("Semantic similarity failed: %s", exc)
        return None


# Stage 2: NLI Grounding

def compute_nli_grounding(
    source_text: str,
    claim_text: str,
) -> Optional[GroundingResult]:
    """Run NLI inference: source=premise, claim=hypothesis.
    
    Returns probability distribution over {entailment, contradiction, neutral}.
    """
    global _nli_model, _nli_tokenizer

    if _nli_model is None or _nli_tokenizer is None:
        return None

    try:
        start = time.perf_counter()

        # Tokenize
        inputs = _nli_tokenizer(
            source_text,
            claim_text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )

        # Inference
        outputs = _nli_model(**inputs)
        logits = outputs.logits.detach().numpy()[0]

        # Softmax
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()

        # DeBERTa NLI label order: contradiction=0, neutral=1, entailment=2
        contradiction_prob = float(probs[0])
        neutral_prob = float(probs[1])
        entailment_prob = float(probs[2])

        # Grounding score: higher = more risky (ungrounded). See
        # NEUTRAL_RISK_WEIGHT above for why this isn't simply 1 - entailment_prob.
        grounding_score = contradiction_prob + NEUTRAL_RISK_WEIGHT * neutral_prob

        # Label
        label_idx = int(np.argmax(probs))
        labels = ["contradiction", "neutral", "entailment"]
        label = labels[label_idx]

        latency_ms = (time.perf_counter() - start) * 1000

        return GroundingResult(
            grounding_score=round(grounding_score, 4),
            entailment_prob=round(entailment_prob, 4),
            contradiction_prob=round(contradiction_prob, 4),
            neutral_prob=round(neutral_prob, 4),
            label=label,
            evaluation_stage="stage2",
            latency_ms=round(latency_ms, 2),
        )

    except Exception as exc:
        logger.error("NLI grounding failed: %s", exc, exc_info=True)
        return None


# Two-Stage Cascade

def evaluate_grounding(
    source_text: str,
    claim_text: str,
) -> Optional[GroundingResult]:
    """Two-stage cascade grounding evaluation.
    
    Stage 1: Semantic similarity (MiniLM, ~15ms)
      - Computes embedding cosine similarity.
      
    Stage 2: NLI grounding (DeBERTa-v3 cross-encoder, ~80ms)
      - Classifies premise-hypothesis entailment, contradiction, and neutral probabilities.
    """
    if not source_text or not claim_text:
        return None

    start = time.perf_counter()

    # Stage 1: Semantic similarity
    similarity = compute_semantic_similarity(source_text, claim_text)

    # Stage 2: NLI Cross-Encoder
    result = compute_nli_grounding(source_text, claim_text)
    if result:
        result.semantic_similarity = similarity
        return result

    # Fallback to Stage 1 if NLI model is not yet loaded
    if similarity is not None:
        latency_ms = (time.perf_counter() - start) * 1000
        is_safe = similarity >= STAGE1_SAFE_THRESHOLD
        return GroundingResult(
            grounding_score=round(1.0 - similarity, 4),
            entailment_prob=similarity if is_safe else round(similarity * 0.5, 4),
            contradiction_prob=0.0 if is_safe else round((1.0 - similarity) * 0.8, 4),
            neutral_prob=round(1.0 - similarity, 4),
            label="entailment" if is_safe else "neutral",
            evaluation_stage="stage1",
            latency_ms=round(latency_ms, 2),
            semantic_similarity=similarity,
        )

    return None


# Model Loading

def load_models(
    nli_model_name: str = "cross-encoder/nli-deberta-v3-small",
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    cache_dir: str = "./models",
    use_onnx: bool = True,
    sync: bool = False,
) -> None:
    """Load evaluation models into memory.
    
    Can be run in a background thread at startup (sync=False) or synchronously (sync=True).
    """
    import threading

    global _nli_backend_requested
    _nli_backend_requested = "onnx" if use_onnx else "pytorch"

    def _do_load():
        global _nli_model, _nli_tokenizer, _embedding_model
        global _nli_backend, _nli_backend_fallback_reason

        logger.info("Loading evaluation models...")

        # Cap intra-op threading to 1 per inference call. Evaluation concurrency
        # comes from the ThreadPoolExecutor in ingest.py running multiple spans
        # in parallel; if each of those threads also let torch/onnxruntime spawn
        # one internal thread per CPU core, worker_count x core_count competing
        # threads thrash the scheduler and starve the event loop (observed:
        # ~15s p50 request latency under load with this uncapped).
        try:
            import torch
            torch.set_num_threads(1)
        except Exception:
            pass

        # Load NLI model
        try:
            if use_onnx:
                try:
                    from optimum.onnxruntime import ORTModelForSequenceClassification
                    from onnxruntime import SessionOptions
                    session_options = SessionOptions()
                    session_options.intra_op_num_threads = 1
                    session_options.inter_op_num_threads = 1
                    _nli_model = ORTModelForSequenceClassification.from_pretrained(
                        nli_model_name,
                        cache_dir=cache_dir,
                        session_options=session_options,
                    )
                    _nli_backend = "onnx"
                    _nli_backend_fallback_reason = None
                    logger.info("Loaded NLI model (ONNX): %s", nli_model_name)
                except Exception as e:
                    # Recorded, not just logged. A log line scrolls away; this is
                    # queryable via backend_info() and surfaced on /v1/health so
                    # the degraded mode is observable rather than folklore.
                    _nli_backend_fallback_reason = f"{type(e).__name__}: {e}"
                    logger.warning(
                        "ONNX Runtime unavailable (%s); falling back to PyTorch. "
                        "The NLI backend is DEGRADED relative to configuration "
                        "(use_onnx=True).", e,
                    )
                    from transformers import AutoModelForSequenceClassification
                    _nli_model = AutoModelForSequenceClassification.from_pretrained(
                        nli_model_name,
                        cache_dir=cache_dir,
                    )
                    _nli_backend = "pytorch"
                    logger.info("Loaded NLI model (PyTorch fallback): %s", nli_model_name)
            else:
                from transformers import AutoModelForSequenceClassification
                _nli_model = AutoModelForSequenceClassification.from_pretrained(
                    nli_model_name,
                    cache_dir=cache_dir,
                )
                _nli_backend = "pytorch"
                _nli_backend_fallback_reason = None
                logger.info("Loaded NLI model (PyTorch, as configured): %s", nli_model_name)

            from transformers import AutoTokenizer
            _nli_tokenizer = AutoTokenizer.from_pretrained(
                nli_model_name,
                cache_dir=cache_dir,
            )
        except Exception as exc:
            logger.error("Failed to load NLI model: %s", exc)

        # Load embedding model
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer(
                embedding_model_name,
                cache_folder=cache_dir,
            )
            logger.info("Loaded embedding model: %s", embedding_model_name)
        except Exception as exc:
            logger.error("Failed to load embedding model: %s", exc)

    if sync:
        _do_load()
    else:
        thread = threading.Thread(target=_do_load, daemon=True)
        thread.start()


def get_embedding(text: str) -> Optional[np.ndarray]:
    """Generate a 384-dim embedding for text using MiniLM."""
    global _embedding_model

    if _embedding_model is None:
        return None

    try:
        embedding = _embedding_model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return embedding
    except Exception as exc:
        logger.warning("Embedding generation failed: %s", exc)
        return None


def models_loaded() -> dict[str, bool]:
    """Check which models are loaded.

    Deliberately still bool-only. Callers do `all(models_loaded().values())` to
    gate readiness (app/worker.py, scripts/measure_durability.py); mixing a
    string in here would make that check silently wrong. Backend identity lives
    in `backend_info()` instead.
    """
    return {
        "nli_model": _nli_model is not None,
        "nli_tokenizer": _nli_tokenizer is not None,
        "embedding_model": _embedding_model is not None,
    }


def backend_info() -> dict[str, Any]:
    """Which inference backend is ACTUALLY active, versus what was configured.

    `models_loaded()` answers "did a model load?" and returns True whether ONNX
    Runtime or the PyTorch fallback was used. That is not enough: the system can
    run a materially slower backend than configured while reporting itself
    healthy. This reports the difference explicitly, so a degraded execution mode
    is visible to monitoring instead of being buried in one startup log line.

    `degraded` is the field that matters: True means ONNX was requested and did
    not load. It is deliberately not an error -- the fallback is correct
    behaviour and inference results are unchanged -- but it must be *visible*.
    """
    degraded = (
        _nli_backend_requested == "onnx"
        and _nli_backend is not None
        and _nli_backend != "onnx"
    )
    return {
        "nli_backend": _nli_backend,
        "nli_backend_requested": _nli_backend_requested,
        "degraded": degraded,
        "fallback_reason": _nli_backend_fallback_reason,
        # The embedding model has no ONNX path in this codebase; SentenceTransformer
        # is loaded directly. Stated so the absence is not read as a failure.
        "embedding_backend": "pytorch" if _embedding_model is not None else None,
    }
