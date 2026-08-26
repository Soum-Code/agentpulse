"""Inter-Agent Disagreement and Contradiction Detection Service.

Analyzes semantic alignment and logical contradiction between different agent
outputs within the same execution trace.

Principles:
- Compares compatible assertions between agent outputs in the same trace.
- Flags "DISAGREEMENT" or "CONTRADICTION" risk signals.
- Does NOT claim objective ground truth or declare which agent is right.

Two behaviours here were added in response to measured failures on
`datasets/v1.0_multiagent.json` (baseline run: precision 0.769, recall 0.833,
FPR 0.300 -- see DISAGREEMENT_BENCHMARK_REPORT.md). Both are documented at
their definitions below:

1. A relevance gate, because NLI reports high contradiction probability for
   agent outputs that are merely about *different topics*, not conflicting.
2. Trace-level N-way comparison, because comparing only adjacent agents means
   a contradiction between non-adjacent agents is never evaluated at all.
"""

from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, field
from typing import Optional, Sequence

from app.services.grounding import compute_nli_grounding, compute_semantic_similarity

logger = logging.getLogger("agentpulse.evaluator.disagreement")

# Minimum topical overlap before a contradiction probability is trusted.
#
# Measured problem: DeBERTa NLI returns contradiction_prob >= 0.97 for pairs of
# agent outputs that are simply about different subjects. On the constructed
# multi-agent benchmark, a planner saying "decompose into three sub-questions"
# against a retriever saying "retrieved four documents" scored 0.999, and a
# triager assigning a ticket against an investigator collecting logs scored
# 0.975. Neither is a contradiction. In a real trace this is the common case,
# not the exception -- consecutive agents in a pipeline usually do different
# jobs -- so an ungated contradiction score fires constantly.
#
# The value is deliberately NOT fitted to the benchmark. It reuses
# grounding.py's existing STAGE1_RISK_THRESHOLD (0.40), which was chosen
# independently for the cascade's low-similarity floor. Reported honestly:
# on the 22-case benchmark the lowest-similarity genuine contradiction sits at
# 0.433 and the highest-similarity false positive at 0.647, so this floor does
# not separate the two cleanly and the margin below it is only ~0.03. It
# removes 4 of 5 measured false positives; it does not remove all of them, and
# a larger independent dataset is needed before treating 0.40 as validated.
RELEVANCE_FLOOR = 0.40


@dataclass
class DisagreementResult:
    """Result of cross-agent disagreement analysis."""

    disagreement_score: float  # 0.0 = aligned, 1.0 = strong contradiction
    source_agent_id: str
    target_agent_id: str
    is_disagreement: bool
    explanation: str
    contradiction_prob: float = 0.0
    semantic_similarity: Optional[float] = None
    gated_low_relevance: bool = False


@dataclass
class TraceDisagreementResult:
    """Aggregate disagreement analysis across every agent pair in one trace."""

    max_disagreement_score: float
    is_disagreement: bool
    pairs_evaluated: int
    pairs_gated_low_relevance: int
    flagged_pairs: list[DisagreementResult] = field(default_factory=list)
    explanation: str = ""


def evaluate_inter_agent_disagreement(
    source_agent_id: str,
    source_output: str,
    target_agent_id: str,
    target_output: str,
    threshold: float = 0.6,
    relevance_floor: float = RELEVANCE_FLOOR,
) -> Optional[DisagreementResult]:
    """Compare outputs of two interacting agents to detect logical contradictions.

    Args:
        source_agent_id: Upstream agent ID (e.g., 'researcher')
        source_output: Upstream agent's output text
        target_agent_id: Downstream/evaluating agent ID (e.g., 'verifier')
        target_output: Downstream agent's output text
        threshold: Contradiction probability threshold for flagging
        relevance_floor: Minimum semantic similarity before a contradiction
            probability is trusted. Pass 0.0 to disable the gate (used by the
            benchmark to measure the gate's effect). See RELEVANCE_FLOOR.

    Returns:
        DisagreementResult or None if evaluation skipped
    """
    if not source_output or not target_output or source_agent_id == target_agent_id:
        return None

    # Use DeBERTa NLI: source=premise, target=hypothesis
    nli_res = compute_nli_grounding(source_output, target_output)
    if not nli_res:
        return None

    contra_prob = nli_res.contradiction_prob

    # Relevance gate. Fail-open on purpose: if the embedding model is
    # unavailable, compute_semantic_similarity returns None and we proceed
    # ungated rather than silently suppressing every disagreement signal --
    # consistent with grounding.py's fail-open policy, and the safer direction
    # for a monitoring system (over-report beats silently reporting nothing).
    similarity = compute_semantic_similarity(source_output, target_output)
    gated = (
        relevance_floor > 0.0
        and similarity is not None
        and similarity < relevance_floor
    )

    is_disagreement = contra_prob >= threshold and not gated

    if gated:
        explanation = (
            f"Contradiction probability {contra_prob:.3f} between @{source_agent_id} "
            f"and @{target_agent_id} was not flagged: semantic similarity "
            f"{similarity:.3f} is below the relevance floor {relevance_floor:.2f}, "
            "so these outputs are treated as addressing different subjects rather "
            "than conflicting."
        )
    elif is_disagreement:
        explanation = (
            f"Contradiction probability {contra_prob:.3f} detected between "
            f"@{source_agent_id} and @{target_agent_id}."
        )
    else:
        explanation = (
            f"Agents @{source_agent_id} and @{target_agent_id} exhibit semantic alignment."
        )

    return DisagreementResult(
        disagreement_score=round(contra_prob, 4),
        source_agent_id=source_agent_id,
        target_agent_id=target_agent_id,
        is_disagreement=is_disagreement,
        explanation=explanation,
        contradiction_prob=round(contra_prob, 4),
        semantic_similarity=round(similarity, 4) if similarity is not None else None,
        gated_low_relevance=gated,
    )


def evaluate_trace_disagreements(
    agent_outputs: Sequence[tuple[str, str]],
    threshold: float = 0.6,
    relevance_floor: float = RELEVANCE_FLOOR,
    max_pairs: int = 45,
) -> Optional[TraceDisagreementResult]:
    """Compare every agent pair in a trace, not just consecutive ones.

    Why this exists: comparing an agent only against its immediate upstream
    (what evaluator.py does per-span, and all it *can* do while evaluating one
    span at a time) means a contradiction between non-adjacent agents is never
    evaluated. Measured on the constructed multi-agent benchmark: two cases
    where the conflicting pair scored 1.000 when compared directly went
    undetected entirely, because the adjacent pairs around them scored <0.01.

    Cost is O(N^2) in agent count -- 5 agents is 10 comparisons, 10 agents is
    45 -- and each comparison runs one NLI plus one embedding forward pass
    (~105 ms combined on CPU). `max_pairs` caps that; traces exceeding it fall
    back to consecutive-pair comparison only, which is strictly what the
    per-span path already does.

    Args:
        agent_outputs: (agent_id, output_text) in trace order.
        threshold: Contradiction probability threshold for flagging.
        relevance_floor: See RELEVANCE_FLOOR.
        max_pairs: Comparison budget before degrading to adjacent-only.

    Returns:
        TraceDisagreementResult, or None if fewer than two usable outputs.
    """
    usable = [(aid, out) for aid, out in agent_outputs if out]
    if len(usable) < 2:
        return None

    n = len(usable)
    total_pairs = n * (n - 1) // 2

    if total_pairs <= max_pairs:
        pairs = list(itertools.combinations(range(n), 2))
        degraded = False
    else:
        pairs = [(i, i + 1) for i in range(n - 1)]
        degraded = True
        logger.info(
            "Trace has %d agents (%d pairs) exceeding max_pairs=%d; "
            "falling back to adjacent-only comparison.",
            n, total_pairs, max_pairs,
        )

    evaluated = 0
    gated_count = 0
    flagged: list[DisagreementResult] = []
    max_score = 0.0

    for i, j in pairs:
        src_id, src_out = usable[i]
        tgt_id, tgt_out = usable[j]
        res = evaluate_inter_agent_disagreement(
            source_agent_id=src_id,
            source_output=src_out,
            target_agent_id=tgt_id,
            target_output=tgt_out,
            threshold=threshold,
            relevance_floor=relevance_floor,
        )
        if res is None:
            continue

        evaluated += 1
        if res.gated_low_relevance:
            gated_count += 1
            continue

        max_score = max(max_score, res.disagreement_score)
        if res.is_disagreement:
            flagged.append(res)

    if flagged:
        worst = max(flagged, key=lambda r: r.disagreement_score)
        explanation = (
            f"{len(flagged)} contradicting agent pair(s) found across {evaluated} "
            f"comparison(s); strongest is @{worst.source_agent_id} vs "
            f"@{worst.target_agent_id} at {worst.disagreement_score:.3f}."
        )
    else:
        explanation = (
            f"No contradicting agent pairs across {evaluated} comparison(s)"
            + (f" ({gated_count} skipped as off-topic)." if gated_count else ".")
        )
    if degraded:
        explanation += " Comparison budget exceeded; adjacent pairs only."

    return TraceDisagreementResult(
        max_disagreement_score=round(max_score, 4),
        is_disagreement=bool(flagged),
        pairs_evaluated=evaluated,
        pairs_gated_low_relevance=gated_count,
        flagged_pairs=flagged,
        explanation=explanation,
    )
