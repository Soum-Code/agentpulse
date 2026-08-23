"""Inter-Agent Disagreement and Contradiction Detection Service.

Analyzes semantic alignment and logical contradiction between different agent
outputs within the same execution trace.

Principles:
- Compares compatible assertions between adjacent or dependent agent outputs.
- Flags "DISAGREEMENT" or "CONTRADICTION" risk signals.
- Does NOT claim objective ground truth or declare which agent is right.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from app.services.grounding import compute_nli_grounding

logger = logging.getLogger("agentpulse.evaluator.disagreement")


@dataclass
class DisagreementResult:
    """Result of cross-agent disagreement analysis."""

    disagreement_score: float  # 0.0 = aligned, 1.0 = strong contradiction
    source_agent_id: str
    target_agent_id: str
    is_disagreement: bool
    explanation: str
    contradiction_prob: float = 0.0


def evaluate_inter_agent_disagreement(
    source_agent_id: str,
    source_output: str,
    target_agent_id: str,
    target_output: str,
    threshold: float = 0.6,
) -> Optional[DisagreementResult]:
    """Compare outputs of two interacting agents to detect logical contradictions.
    
    Args:
        source_agent_id: Upstream agent ID (e.g., 'researcher')
        source_output: Upstream agent's output text
        target_agent_id: Downstream/evaluating agent ID (e.g., 'verifier')
        target_output: Downstream agent's output text
        threshold: Contradiction probability threshold for flagging
        
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
    is_disagreement = contra_prob >= threshold

    explanation = (
        f"Contradiction probability {contra_prob:.3f} detected between @{source_agent_id} "
        f"and @{target_agent_id}."
        if is_disagreement
        else f"Agents @{source_agent_id} and @{target_agent_id} exhibit semantic alignment."
    )

    return DisagreementResult(
        disagreement_score=round(contra_prob, 4),
        source_agent_id=source_agent_id,
        target_agent_id=target_agent_id,
        is_disagreement=is_disagreement,
        explanation=explanation,
        contradiction_prob=round(contra_prob, 4),
    )
