"""Tool-claim validation: checks if agent's claims match actual tool traces.

Detects mismatches between what an agent says it did (in its output text)
and what actually happened (recorded tool calls in the trace).

Mismatch types:
- FABRICATED_TOOL: Agent claims tool use that never occurred
- WRONG_COUNT: Agent claims different result count than actual
- RESULT_DISTORTION: Agent misrepresents what tool returned
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("agentpulse.evaluator.tool_claim")


@dataclass
class ToolClaim:
    """A claim about tool usage extracted from agent output."""

    tool_name: str
    claim_text: str
    claimed_count: Optional[int] = None


@dataclass
class ToolCallRecord:
    """An actual tool call from the trace."""

    tool_name: str
    tool_args: Optional[str] = None
    result_summary: Optional[str] = None
    result_count: Optional[int] = None
    status: str = "success"


@dataclass
class ToolClaimMatch:
    """Result of matching a claim to a tool call."""

    claim: ToolClaim
    matched_tool: Optional[ToolCallRecord] = None
    match_type: str = "no_match"  # "exact", "partial", "no_match"
    mismatch_type: Optional[str] = None  # "FABRICATED_TOOL", "WRONG_COUNT", etc.
    details: str = ""


@dataclass
class ToolClaimResult:
    """Aggregate tool-claim validation result."""

    matches: list[ToolClaimMatch] = field(default_factory=list)
    total_claims: int = 0
    mismatches: int = 0
    tool_claim_score: float = 0.0  # 0.0 = all match, 1.0 = all mismatch
    details: str = ""


# Stopwords that should never be standalone tool names
STOPWORDS = {"the", "a", "an", "this", "that", "our", "my", "some", "any"}

# Common tool name patterns for claim extraction
TOOL_PATTERNS = [
    r"(?:I |i |we |We )?(?:used|called|ran|executed|invoked|queried|searched)\s+(?:the\s+|a\s+|an\s+)?(\w+(?:_\w+)?)\s+(?:tool|function|api|search|database)",
    r"(?:the\s+)?(\w+(?:_\w+)?)\s+(?:tool|function|api)\s+(?:returned|found|gave|produced|yielded)",
]

COUNT_PATTERNS = [
    r"(?:found|retrieved|got|returned|identified|discovered)\s+(\d+)\s+(?:results?|papers?|documents?|records?|items?|studies|articles?|matches?)",
    r"(\d+)\s+(?:results?|papers?|documents?|records?|items?|studies|articles?)\s+(?:were|was)\s+(?:found|retrieved|returned)",
]


def extract_claims(text: str) -> list[ToolClaim]:
    """Extract tool-usage claims from agent output text.
    
    Uses pattern matching — intentionally simple for transparency.
    Acknowledged limitation: misses paraphrased claims.
    """
    if not text:
        return []

    claims = []
    text_lower = text.lower()

    # Extract tool name claims
    for pattern in TOOL_PATTERNS:
        for match in re.finditer(pattern, text_lower):
            tool_name = match.group(1).strip()
            if tool_name and tool_name not in STOPWORDS and len(tool_name) > 2:
                claim = ToolClaim(
                    tool_name=tool_name,
                    claim_text=match.group(0),
                )
                claims.append(claim)

    # Extract count claims
    for pattern in COUNT_PATTERNS:
        for match in re.finditer(pattern, text_lower):
            count = int(match.group(1))
            # Associate with closest tool claim or create new one
            if claims:
                claims[-1].claimed_count = count
            else:
                claims.append(ToolClaim(
                    tool_name="unknown",
                    claim_text=match.group(0),
                    claimed_count=count,
                ))

    return claims


def validate_claims(
    claims: list[ToolClaim],
    tool_calls: list[ToolCallRecord],
) -> ToolClaimResult:
    """Validate extracted claims against actual tool call records.
    
    Returns a score ∈ [0, 1] where 0 = all claims valid, 1 = all invalid.
    """
    if not claims:
        return ToolClaimResult(
            total_claims=0,
            mismatches=0,
            tool_claim_score=0.0,
            details="No tool claims to validate",
        )

    tool_map = {tc.tool_name.lower(): tc for tc in tool_calls}
    matches = []

    for claim in claims:
        claim_name = claim.tool_name.lower()

        # Handle anonymous count claim (e.g. "returned 3 items")
        if claim_name == "unknown":
            if not tool_calls:
                matches.append(ToolClaimMatch(
                    claim=claim,
                    match_type="no_match",
                    mismatch_type="FABRICATED_TOOL",
                    details="Agent claimed results from tool execution but no tool calls recorded",
                ))
            else:
                # Associate with the primary tool call
                primary_tool = tool_calls[0]
                mismatch_type = None
                details = "Count matches recorded tool output"
                if claim.claimed_count is not None and primary_tool.result_count is not None:
                    if claim.claimed_count != primary_tool.result_count:
                        mismatch_type = "WRONG_COUNT"
                        details = (
                            f"Agent claimed {claim.claimed_count} results, "
                            f"tool returned {primary_tool.result_count}"
                        )
                matches.append(ToolClaimMatch(
                    claim=claim,
                    matched_tool=primary_tool,
                    match_type="exact" if not mismatch_type else "partial",
                    mismatch_type=mismatch_type,
                    details=details,
                ))
            continue

        # Try exact match
        if claim_name in tool_map:
            tool = tool_map[claim_name]
            match = ToolClaimMatch(
                claim=claim,
                matched_tool=tool,
                match_type="exact",
            )

            # Check count mismatch
            if claim.claimed_count is not None and tool.result_count is not None:
                if claim.claimed_count != tool.result_count:
                    match.mismatch_type = "WRONG_COUNT"
                    match.details = (
                        f"Agent claimed {claim.claimed_count} results, "
                        f"tool returned {tool.result_count}"
                    )

            matches.append(match)
            continue

        # Try partial match (substring)
        partial = None
        for tool_name, tool in tool_map.items():
            if claim_name in tool_name or tool_name in claim_name:
                partial = ToolClaimMatch(
                    claim=claim,
                    matched_tool=tool,
                    match_type="partial",
                )
                break

        if partial:
            matches.append(partial)
        else:
            # No match — potential fabrication
            matches.append(ToolClaimMatch(
                claim=claim,
                match_type="no_match",
                mismatch_type="FABRICATED_TOOL",
                details=f"Agent claims use of '{claim.tool_name}' but no matching tool call found",
            ))

    mismatches = sum(1 for m in matches if m.mismatch_type is not None)
    score = mismatches / len(claims) if claims else 0.0

    return ToolClaimResult(
        matches=matches,
        total_claims=len(claims),
        mismatches=mismatches,
        tool_claim_score=round(score, 4),
        details=f"{mismatches}/{len(claims)} claims have mismatches",
    )


def evaluate_tool_claims(
    output_text: str,
    tool_calls: list[ToolCallRecord],
) -> ToolClaimResult:
    """Full pipeline: extract claims from text, validate against tool trace."""
    claims = extract_claims(output_text)
    return validate_claims(claims, tool_calls)
