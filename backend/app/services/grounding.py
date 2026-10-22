"""NLI-based grounding evaluator using DeBERTa-v3-small.

Both stages run on every span. MiniLM produces a semantic similarity and
DeBERTa produces the entailment/neutral/contradiction distribution; when the
NLI model is available its result is what `evaluate_grounding` returns, and the
similarity rides along on the result for context. MiniLM is not a gate.

This is worth stating plainly because an earlier version of this docstring
described Stage 2 as running "only when Stage 1 is ambiguous", and the two
threshold constants below still read like gates. They are not, and never were
in this code: `evaluate_grounding` has no branch that skips the NLI call. The
ablation's latency column cannot show this either way, because
`experiments/ablation.py` reports a configuration's latency as the sum of the
per-case timings of the signals it uses, so the cascade row is MiniLM plus
DeBERTa by construction. The 2026-09-18 run in
`experiments/results/ablation_results.json` (PyTorch path, one run) has MiniLM
alone at 19.1 ms, DeBERTa alone at 132.09 ms and the shipped configuration at
151.19 ms. The 2026-08-23 run of the same script recorded 27.83, 188.07 and
215.9 ms; the cause of that difference was not identified.

So the design is: run both, prefer NLI, fall back to similarity only when the
NLI model failed to load. Stage 1 therefore costs ~19 ms on every evaluation
instead of saving anything. That is a real trade and it is made knowingly: the
similarity is used by the drift signal and is useful context on the result, and
gating on it would change the scores every calibration figure in this project
was measured against.

Design decisions:
- ONNX Runtime for CPU inference optimization
- Models loaded once at startup, reused for all evaluations
- Thread-safe: models are read-only after loading
- Fail-open: evaluation failure returns None, never blocks
"""

# ---- What this file is for ---------------------------------------------------
# Grounding asks: "is the agent's answer supported by the evidence it was given?" This
# file loads two small models and uses them on one (evidence, answer) pair:
#   - an NLI model (natural language inference): it says if the answer follows from the
#     evidence (entailment), contradicts it, or neither (neutral);
#   - an embedding model (MiniLM): it turns a text into a list of numbers for its meaning,
#     so two texts with similar meaning get numbers that are close.
# The file also has helpers that report which models loaded and which engine runs them.
#
# How it fits in: services/evaluator.py calls evaluate_grounding and get_embedding.
# services/disagreement.py reuses compute_nli_grounding and compute_semantic_similarity.
# app/worker.py calls load_models, models_loaded and backend_info. routers/__init__.py and
# services/platform_health.py read models_loaded and backend_info for health reports.
# ------------------------------------------------------------------------------

from __future__ import annotations

import logging
# time.perf_counter is a precise stopwatch, used to measure latency in milliseconds.
import time
from dataclasses import dataclass
from typing import Any, Optional

# numpy does the array maths here: softmax (probabilities) and the dot product (similarity).
import numpy as np

logger = logging.getLogger("agentpulse.evaluator.grounding")

# Lazy imports to avoid loading models at import time
# These three module-level holders stay None until load_models fills them. Each function
# that uses a model checks for None first. A model that is missing or failed to load only
# means that score is skipped (the function returns None); it does not crash the caller.
_nli_model = None
_nli_tokenizer = None
_embedding_model = None

# In short: which of the model's three output scores is contradiction, neutral and
# entailment, e.g. {"contradiction": 0, "entailment": 1, "neutral": 2}.
# The order is NOT the same for every NLI model, so it is read from the loaded model's own
# config (see _read_nli_label_index) and not assumed. The default model,
# cross-encoder/nli-deberta-v3-small, uses contradiction=0, entailment=1, neutral=2. An
# earlier version of compute_nli_grounding assumed contradiction=0, neutral=1,
# entailment=2, which swapped entailment_prob and neutral_prob on every stored row.
# Stays None until load_models has set it.
_nli_label_index: Optional[dict[str, int]] = None

# In short: three variables that remember which engine (ONNX or PyTorch) really runs the
# NLI model, which one was asked for, and why a fallback happened (if it did).
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

    # Field guide:
    #   grounding_score  : the risk number. Low = supported, high = not supported.
    #   *_prob           : how likely each NLI class is. From the NLI model they add up
    #                      to 1. In the similarity-only fallback they are rough numbers
    #                      worked out from the similarity (see evaluate_grounding).
    #   label            : the NLI class with the highest probability (in the fallback:
    #                      "entailment" or "neutral", chosen from the similarity).
    #   evaluation_stage : "stage2" = an NLI result. "stage1" = the similarity-only
    #                      fallback.
    #   latency_ms       : milliseconds spent. For "stage2" it covers only the NLI step
    #                      (not the MiniLM similarity). For "stage1" it is the time since
    #                      evaluate_grounding started.
    #   semantic_similarity : MiniLM closeness of the two texts, 0 to 1, or None.
    grounding_score: float  # 0.0 = grounded, 1.0 = ungrounded
    entailment_prob: float
    contradiction_prob: float
    neutral_prob: float
    label: str  # "entailment", "contradiction", "neutral"
    evaluation_stage: str  # "stage1", "stage2"
    latency_ms: float
    semantic_similarity: Optional[float] = None

    # In short: input_tokens = the length of evidence + claim in tokens (a token is a small
    # piece of a word), counted before any cutting. input_truncated = True when that is
    # over the 512 limit, so the text was cut. The similarity-only fallback does not set
    # them, so they keep their defaults (None, False) there.
    # DeBERTa reads at most 512 tokens of premise and hypothesis combined. Past
    # that the rest of the premise is dropped, and the score is computed from
    # evidence the model never saw -- a long RAG context can have its supporting
    # passage cut off and the claim then reads as unsupported.
    #
    # Nothing about that was observable: the call returns a normal-looking score
    # either way. These two fields make it observable. They do not change the
    # score, which is deliberate -- windowing the premise would alter every
    # figure in THRESHOLD_ANALYSIS.md and GROUNDING_SCORE_CALIBRATION_REPORT.md,
    # so it belongs in an experiment with its own measurements.
    input_tokens: Optional[int] = None
    input_truncated: bool = False


# Stage 1: Semantic Similarity

# In short: STAGE1_SAFE_THRESHOLD (0.85) matters only in the fallback, where a similarity
# at or above it is "safe" (label "entailment") and a lower one is not (label "neutral").
# Neither it nor STAGE1_RISK_THRESHOLD gates the NLI model: that is always tried.
# Neither constant gates anything. They were written for a cascade that skips
# the NLI call, which this module does not implement.
#
# STAGE1_SAFE_THRESHOLD is read in exactly one place: the fallback branch of
# `evaluate_grounding`, which runs only when the NLI model failed to load. There
# it decides whether a similarity-only result is labelled "entailment" or
# "neutral".
STAGE1_SAFE_THRESHOLD = 0.85

# In short: this constant is not used by any code. It is kept only because
# disagreement.py says its RELEVANCE_FLOOR (0.40) reuses this value.
# STAGE1_RISK_THRESHOLD is read nowhere in this codebase. It is kept because
# `disagreement.py` documents its RELEVANCE_FLOOR as reusing this value, so the
# constant is the recorded origin of that 0.40 rather than dead weight. Delete
# it and that provenance comment points at nothing.
STAGE1_RISK_THRESHOLD = 0.40

# In short: a neutral answer counts as 0.3 of a contradiction in the risk score. By the
# formula below: a fully "contradiction" result scores 1.0, a fully "neutral" one 0.3 and
# a fully "entailment" one 0.0. A purely neutral result therefore stays under the 0.4
# "medium" cut-off and is labelled low_risk.
# grounding_score = contradiction_prob + NEUTRAL_RISK_WEIGHT * neutral_prob.
#
# History: the weight was 0.5, chosen in GROUNDING_SCORE_CALIBRATION_REPORT.md while
# compute_nli_grounding had entailment and neutral swapped (see _nli_label_index). The
# "neutral" that report measured was really the model's entailment class, so its reasoning
# and figures do not describe the real neutral class. GROUNDING_RECALIBRATION_2026-10.md
# re-measured the weight on the corrected labels and it is 0.3 since that report:
#   - the weight does not change the ranking (AUROC 0.996 on the held-out pool for every
#     weight from 0.0 to 0.8), only where the medium line falls;
#   - at the 0.4 cut-off, 0.5 flags supported held-out cases (false-positive rate 0.412 on
#     the test split) where 0.3 flags almost none (0.059; exact McNemar p = 0.0078 on the
#     held-out pool). 0.3 is the largest weight that keeps both production cut-offs at
#     dev F1 1.0 and a purely neutral output under 0.4;
#   - the cut-offs are unchanged: 0.7 (high) and 0.4 (medium), see _classify_risk in
#     services/evaluator.py. High-risk alerts do not depend on the weight in this range.
#
# What this does NOT show: no labelled "plausible but unsupported" data exists (the
# repository has one such case, val_17), so the weight's value for DETECTING a neutral-only
# fabrication was not measured, only its cost in false mediums. At 0.3 such an output scores
# 0.3 and reads as low_risk. Any non-zero weight is a design choice, not a fit.
NEUTRAL_RISK_WEIGHT = 0.3

# In short: the longest input, in tokens, that the NLI model can read. Anything longer is
# cut off. A token is a small piece of a word.
# DeBERTa-v3-small's position embeddings stop here. Premise and hypothesis share
# the budget, so a long premise is what gets cut. This is a property of the
# model, not a configuration choice, which is why it is a constant rather than a
# setting -- raising it would not give the model a longer memory.
MAX_NLI_TOKENS = 512


# Used by evaluate_grounding below, and by disagreement.py to check whether two agent
# outputs are about the same topic.
def compute_semantic_similarity(
    source_text: str,
    claim_text: str,
) -> Optional[float]:
    """Compute cosine similarity between source and claim using MiniLM.
    
    Returns similarity score ∈ [0, 1] or None on failure.
    """
    global _embedding_model

    # The embedding model is not loaded (yet), so no similarity can be computed.
    if _embedding_model is None:
        return None

    try:
        # Step 1: turn both texts into embeddings (lists of numbers for their meaning).
        # normalize_embeddings=True scales each embedding to length 1, so the dot product
        # in step 2 equals the cosine similarity (1 = same meaning direction).
        embeddings = _embedding_model.encode(
            [source_text, claim_text],
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        # Step 2: multiply the two embeddings number by number and add up the results.
        similarity = float(np.dot(embeddings[0], embeddings[1]))
        # Step 3: keep the value inside 0..1 (a negative similarity becomes 0).
        return max(0.0, min(1.0, similarity))
    # Any failure is logged and turned into None, so scoring never crashes the caller.
    except Exception as exc:
        logger.warning("Semantic similarity failed: %s", exc)
        return None


# Stage 2: NLI Grounding

# Used by evaluate_grounding below, and by disagreement.py to test whether two agent
# outputs contradict each other.
def compute_nli_grounding(
    source_text: str,
    claim_text: str,
) -> Optional[GroundingResult]:
    """Run NLI inference: source=premise, claim=hypothesis.
    
    Returns probability distribution over {entailment, contradiction, neutral}.
    """
    global _nli_model, _nli_tokenizer

    # Both the model and its tokenizer (turns text into token numbers) must be loaded.
    if _nli_model is None or _nli_tokenizer is None:
        return None

    try:
        # Start the stopwatch. latency_ms below covers tokenizing and the model run.
        start = time.perf_counter()

        # In short: pass 1 only counts the tokens. Pass 2 builds the real model input,
        # cut at MAX_NLI_TOKENS.
        # Tokenize once without truncation purely to learn the true length,
        # then again with it. The second pass costs well under a millisecond
        # against ~132 ms of PyTorch inference (ablation_results.json, 2026-09-18),
        # which is a cheap price for knowing whether the model actually saw the
        # evidence it was asked about.
        # verbose=False: this pass is *meant* to exceed the limit, and the
        # tokenizer's own warning ("will result in indexing errors") is both
        # noisy and wrong here -- the inference pass below truncates properly.
        full = _nli_tokenizer(source_text, claim_text, truncation=False, verbose=False)
        # input_ids = the token numbers. Their count is the length of evidence + claim
        # together. If it is over the limit, the real input below will lose some text.
        input_tokens = len(full["input_ids"])
        input_truncated = input_tokens > MAX_NLI_TOKENS

        # Pass 2: the real input. The pair is (premise, hypothesis): the evidence first,
        # then the claim. return_tensors="pt" gives PyTorch tensors. truncation=True with
        # max_length cuts anything over 512 tokens. padding=True only pads when several
        # inputs are batched; with one pair nothing is added.
        inputs = _nli_tokenizer(
            source_text,
            claim_text,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_NLI_TOKENS,
            padding=True,
        )

        # Inference
        # Run the model. Its output "logits" are three raw scores, one per NLI class.
        # [0] picks our single pair out of the batch of one.
        outputs = _nli_model(**inputs)
        logits = outputs.logits.detach().numpy()[0]

        # Softmax
        # Softmax turns the raw scores into probabilities that add up to 1. Subtracting the
        # biggest score first avoids huge numbers and does not change the result.
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()

        # Pick each class's probability by the position the model's own config gives it
        # (_nli_label_index, set at load time). Not a fixed order: the default model has
        # contradiction=0, entailment=1, neutral=2.
        contradiction_prob = float(probs[_nli_label_index["contradiction"]])
        neutral_prob = float(probs[_nli_label_index["neutral"]])
        entailment_prob = float(probs[_nli_label_index["entailment"]])

        # Grounding score: higher = more risky (ungrounded). See
        # NEUTRAL_RISK_WEIGHT above for why this isn't simply 1 - entailment_prob.
        grounding_score = contradiction_prob + NEUTRAL_RISK_WEIGHT * neutral_prob

        # Label
        # The label is the class with the highest probability. argmax gives its position,
        # and the list below uses the same order as the model's output (the class names
        # sorted by their position).
        label_idx = int(np.argmax(probs))
        labels = sorted(_nli_label_index, key=_nli_label_index.get)
        label = labels[label_idx]

        # Seconds since the stopwatch started, converted to milliseconds.
        latency_ms = (time.perf_counter() - start) * 1000

        # The scores are rounded to 4 decimals. "stage2" marks this as an NLI result.
        return GroundingResult(
            grounding_score=round(grounding_score, 4),
            entailment_prob=round(entailment_prob, 4),
            contradiction_prob=round(contradiction_prob, 4),
            neutral_prob=round(neutral_prob, 4),
            label=label,
            evaluation_stage="stage2",
            latency_ms=round(latency_ms, 2),
            input_tokens=input_tokens,
            input_truncated=input_truncated,
        )

    # Any failure is logged (with a traceback) and becomes None, so evaluate_grounding can
    # fall back to the similarity-only result.
    except Exception as exc:
        logger.error("NLI grounding failed: %s", exc, exc_info=True)
        return None


# Two-Stage Cascade

# The main entry point of this file. services/evaluator.py calls it for each span that has
# both an input text (the evidence) and an output text (the claim).
def evaluate_grounding(
    source_text: str,
    claim_text: str,
) -> Optional[GroundingResult]:
    """Score how well `claim_text` is supported by `source_text`.

    Runs MiniLM similarity and then the DeBERTa NLI classifier, unconditionally
    and in that order. There is no threshold between them: the similarity does
    not decide whether the NLI call happens.

    When NLI returns a result it is the answer, carrying the similarity along
    as `semantic_similarity`. The similarity-only result below is a degraded
    path, reached only when the NLI model is not loaded -- it keeps the
    evaluator producing scores instead of `None`, at lower quality.

    Returns None when either text is empty or when neither model is available.
    """
    # Nothing to compare if either text is missing or empty.
    if not source_text or not claim_text:
        return None

    # Stopwatch for the fallback result below (the NLI result times itself).
    start = time.perf_counter()

    # Stage 1: Semantic similarity
    # Always runs. The value can be None, for example when the embedding model is not loaded.
    similarity = compute_semantic_similarity(source_text, claim_text)

    # Stage 2: NLI Cross-Encoder
    # Always runs too. This is the normal path: when NLI works, attach the similarity to
    # its result and return it.
    result = compute_nli_grounding(source_text, claim_text)
    if result:
        result.semantic_similarity = similarity
        return result

    # Fallback to Stage 1 if NLI model is not yet loaded
    # Reached only when the NLI call gave no result. Build a rough result from the
    # similarity alone. Rules used below:
    #   grounding_score = 1 - similarity (similar texts mean low risk);
    #   "safe" means similarity >= STAGE1_SAFE_THRESHOLD (0.85);
    #   if safe: entailment_prob = similarity and contradiction_prob = 0;
    #   if not safe: entailment_prob = half the similarity, contradiction_prob =
    #     0.8 x (1 - similarity);
    #   neutral_prob = 1 - similarity in both cases.
    # These are not real NLI probabilities. The label is "entailment" if safe, else
    # "neutral", and the stage is "stage1".
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

    # Neither model gave a result, so there is no score.
    return None


# Model Loading

# Used once by load_models. Both loaders (ONNX Runtime and PyTorch) give the model a
# `.config` read from the same config.json, so one lookup covers both. The names are
# lower-cased so "Entailment" and "entailment" mean the same. A model whose labels are not
# exactly these three (for example "LABEL_0") would be read wrongly, so it is refused here
# instead of being scored with a guessed order.
def _read_nli_label_index(model: Any) -> dict[str, int]:
    """Return {"contradiction": i, "entailment": j, "neutral": k} from model.config.label2id."""
    index = {name.lower(): idx for name, idx in model.config.label2id.items()}
    if set(index) != {"contradiction", "entailment", "neutral"}:
        raise ValueError(
            f"NLI model labels are {sorted(index)}; expected contradiction, entailment "
            "and neutral. Refusing to guess the output order."
        )
    return index


# Called at startup. app/worker.py calls it with sync=True and waits. app/main.py calls it
# only when the setting api_load_models is on.
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

    # Remember which engine the configuration asked for, so backend_info() can later
    # compare it with the engine that really loaded. ONNX Runtime is an engine made for
    # fast model runs on CPU. PyTorch is the standard framework, used as the fallback.
    global _nli_backend_requested
    _nli_backend_requested = "onnx" if use_onnx else "pytorch"

    # The inner function does the real loading. It runs at once (sync=True) or in a
    # background thread (see the end of load_models). It fills the module-level holders.
    def _do_load():
        global _nli_model, _nli_tokenizer, _embedding_model
        global _nli_backend, _nli_backend_fallback_reason, _nli_label_index

        logger.info("Loading evaluation models...")

        # Note: the thread pool named below is the older design. Today the worker runs one
        # evaluation at a time (a one-thread pool in app/worker.py); ingest.py no longer
        # evaluates. The cap of 1 thread per model call is still applied.
        # In short: limit each model call to 1 CPU thread so threads do not fight.
        # Cap intra-op threading to 1 per inference call. Evaluation concurrency
        # comes from the ThreadPoolExecutor in ingest.py running multiple spans
        # in parallel; if each of those threads also let torch/onnxruntime spawn
        # one internal thread per CPU core, worker_count x core_count competing
        # threads thrash the scheduler and starve the event loop (observed:
        # ~15s p50 request latency under load with this uncapped).
        try:
            import torch
            torch.set_num_threads(1)
        # Ignored on purpose: this only tunes speed (for example torch may be missing), so
        # a failure here must not stop the models from loading.
        except Exception:
            pass

        # Load NLI model
        # Three outcomes: (1) ONNX loads (best case); (2) ONNX fails, so PyTorch is loaded
        # instead and the reason is saved; (3) use_onnx is False, so PyTorch is loaded as
        # configured. If every load fails, the outer `except` below logs the error.
        try:
            if use_onnx:
                try:
                    from optimum.onnxruntime import ORTModelForSequenceClassification
                    from onnxruntime import SessionOptions
                    # SessionOptions are ONNX Runtime settings. intra_op = threads inside
                    # one operation, inter_op = threads across operations. Both set to 1.
                    session_options = SessionOptions()
                    session_options.intra_op_num_threads = 1
                    session_options.inter_op_num_threads = 1
                    # cache_dir is the folder where the downloaded model files are kept.
                    _nli_model = ORTModelForSequenceClassification.from_pretrained(
                        nli_model_name,
                        cache_dir=cache_dir,
                        session_options=session_options,
                    )
                    # ONNX worked: record that, and clear any old fallback reason.
                    _nli_backend = "onnx"
                    _nli_backend_fallback_reason = None
                    logger.info("Loaded NLI model (ONNX): %s", nli_model_name)
                # ONNX failed for any reason (library missing, model not loadable, ...).
                # Do not give up: use the slower PyTorch version of the same model.
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
                    # transformers is the Hugging Face library that loads the PyTorch model.
                    from transformers import AutoModelForSequenceClassification
                    _nli_model = AutoModelForSequenceClassification.from_pretrained(
                        nli_model_name,
                        cache_dir=cache_dir,
                    )
                    _nli_backend = "pytorch"
                    logger.info("Loaded NLI model (PyTorch fallback): %s", nli_model_name)
            # use_onnx is False: PyTorch was chosen on purpose, so this is not "degraded".
            else:
                from transformers import AutoModelForSequenceClassification
                _nli_model = AutoModelForSequenceClassification.from_pretrained(
                    nli_model_name,
                    cache_dir=cache_dir,
                )
                _nli_backend = "pytorch"
                _nli_backend_fallback_reason = None
                logger.info("Loaded NLI model (PyTorch, as configured): %s", nli_model_name)

            # Read which output score is which class, from whichever engine loaded above.
            # This comes before the tokenizer on purpose: if the labels are not the three
            # expected ones this raises, the tokenizer stays None, and compute_nli_grounding
            # then returns None instead of scoring with a wrong order. It also means a set
            # tokenizer always has a label index, even while a background load is running.
            _nli_label_index = _read_nli_label_index(_nli_model)

            # The tokenizer turns text into the token numbers the NLI model expects. It is
            # loaded after the model, whichever engine the model ended up on.
            from transformers import AutoTokenizer
            _nli_tokenizer = AutoTokenizer.from_pretrained(
                nli_model_name,
                cache_dir=cache_dir,
            )
        # The error is logged, not raised. Whichever of the NLI model or tokenizer did not
        # load stays None, so models_loaded() shows False for it and compute_nli_grounding
        # returns None.
        except Exception as exc:
            logger.error("Failed to load NLI model: %s", exc)

        # Load embedding model
        # SentenceTransformer is the library class that wraps embedding models such as
        # MiniLM. cache_folder is where the files are kept.
        try:
            from sentence_transformers import SentenceTransformer
            _embedding_model = SentenceTransformer(
                embedding_model_name,
                cache_folder=cache_dir,
            )
            logger.info("Loaded embedding model: %s", embedding_model_name)
        # Same here: log it and carry on. The similarity and embedding functions then
        # return None.
        except Exception as exc:
            logger.error("Failed to load embedding model: %s", exc)

    # sync=True: wait here until loading is done. Otherwise load in a background thread
    # so the caller can carry on at once. daemon=True means the thread does not keep the
    # program alive when the program wants to exit.
    if sync:
        _do_load()
    else:
        thread = threading.Thread(target=_do_load, daemon=True)
        thread.start()


# Used by services/evaluator.py: the embedding of an agent's output feeds the drift check.
def get_embedding(text: str) -> Optional[np.ndarray]:
    """Generate a 384-dim embedding for text using MiniLM."""
    global _embedding_model

    # No embedding model loaded, so there is no embedding to give.
    if _embedding_model is None:
        return None

    try:
        # One text in, one array of numbers out. normalize_embeddings=True scales the array
        # so its length is 1.
        embedding = _embedding_model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return embedding
    # Fail-open: log a warning and return None instead of raising.
    except Exception as exc:
        logger.warning("Embedding generation failed: %s", exc)
        return None


# The worker uses this to refuse to start unless every model is loaded. The health
# reports (routers/__init__.py, services/platform_health.py) read it too.
def models_loaded() -> dict[str, bool]:
    """Check which models are loaded.

    Deliberately still bool-only. Callers do `all(models_loaded().values())` to
    gate readiness (app/worker.py, scripts/measure_durability.py); mixing a
    string in here would make that check silently wrong. Backend identity lives
    in `backend_info()` instead.
    """
    # For each part: True if it is loaded (not None), False if it is not loaded yet or
    # its load failed.
    return {
        "nli_model": _nli_model is not None,
        "nli_tokenizer": _nli_tokenizer is not None,
        "embedding_model": _embedding_model is not None,
    }


# Read by app/worker.py (startup log and heartbeat) and by the health reports in
# routers/__init__.py and services/platform_health.py.
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
    # degraded is True only when all three hold: ONNX was asked for, some NLI backend did
    # load, and that backend is not ONNX. If nothing has loaded yet it stays False.
    degraded = (
        _nli_backend_requested == "onnx"
        and _nli_backend is not None
        and _nli_backend != "onnx"
    )
    # First four keys: nli_backend = the engine running now ("onnx", "pytorch" or None);
    # nli_backend_requested = the engine the configuration asked for;
    # degraded = see above; fallback_reason = text of the ONNX error, or None.
    return {
        "nli_backend": _nli_backend,
        "nli_backend_requested": _nli_backend_requested,
        "degraded": degraded,
        "fallback_reason": _nli_backend_fallback_reason,
        # The embedding model has no ONNX path in this codebase; SentenceTransformer
        # is loaded directly. Stated so the absence is not read as a failure.
        "embedding_backend": "pytorch" if _embedding_model is not None else None,
    }
