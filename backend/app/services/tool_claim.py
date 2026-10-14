"""Tool-claim validation: checks if agent's claims match actual tool traces.

Detects mismatches between what an agent says it did (in its output text)
and what actually happened (recorded tool calls in the trace).

Mismatch types:
- FABRICATED_TOOL: Agent claims tool use that never occurred
- WRONG_COUNT: Agent claims different result count than actual
- RESULT_DISTORTION: Agent misrepresents what tool returned
"""

# WHAT THIS FILE IS FOR
# The "tool claim" check. An agent's answer may say things like "I used the search tool and
# found 3 documents". This file pulls such claims out of the answer text with simple
# regular expressions (patterns that match pieces of text), then compares each claim with
# the tool calls that were really recorded for the span. A claim that does not match is a
# "mismatch". The score is the share of claims that are mismatches: 0.0 means every claim
# matched (or there was nothing to check), 1.0 means every claim was wrong.
# It also flags wording like "completed successfully" when a recorded tool call was an error.
# Each such call counts as one more claim and one more mismatch.
#
# HOW IT FITS IN
# services/evaluator.py calls evaluate_tool_claims for a span that has output text and at
# least one tool call.
# services/evaluation_runner.py uses extract_result_count to read the real result count.
# This file uses only the Python standard library.

from __future__ import annotations

import logging
# re = regular expressions: patterns that find pieces of text.
import re
from dataclasses import dataclass, field
from typing import Optional

# A named logger for this file. Nothing below writes to it at the moment.
logger = logging.getLogger("agentpulse.evaluator.tool_claim")


# One claim found in the agent's text. tool_name is the tool the agent named. It is "unknown"
# when only a number was found and no tool was named. claim_text is the phrase that matched.
# claimed_count is the number the agent said (for example 3 in "found 3 documents"), or None.
@dataclass
class ToolClaim:
    """A claim about tool usage extracted from agent output."""

    tool_name: str
    claim_text: str
    claimed_count: Optional[int] = None


# One tool call that really happened, as recorded in the trace. result_count is the number
# of results the tool really returned (None if not known). status is "success" unless the
# call is recorded as an error; any other value is treated as an error call.
@dataclass
class ToolCallRecord:
    """An actual tool call from the trace."""

    tool_name: str
    tool_args: Optional[str] = None
    result_summary: Optional[str] = None
    result_count: Optional[int] = None
    status: str = "success"


# The outcome of checking ONE claim. matched_tool is the real tool call it was compared
# with (None if no call fitted). match_type says how the claim lined up with a tool call.
# mismatch_type stays None when nothing is wrong; otherwise it is one of the three names
# at the top of this file. validate_claims, _check_count_mismatch and
# _check_false_success_claims below are the places that set it.
@dataclass
class ToolClaimMatch:
    """Result of matching a claim to a tool call."""

    claim: ToolClaim
    matched_tool: Optional[ToolCallRecord] = None
    match_type: str = "no_match"  # "exact", "partial", "no_match"
    mismatch_type: Optional[str] = None  # "FABRICATED_TOOL", "WRONG_COUNT", etc.
    details: str = ""


# The final answer for one span: every match, the totals, and the score.
# tool_claim_score = mismatches / total_claims, rounded to 4 decimal places.
@dataclass
class ToolClaimResult:
    """Aggregate tool-claim validation result."""

    matches: list[ToolClaimMatch] = field(default_factory=list)
    total_claims: int = 0
    mismatches: int = 0
    tool_claim_score: float = 0.0  # 0.0 = all match, 1.0 = all mismatch
    details: str = ""


# Stopwords that should never be standalone tool names
# In short: the patterns below can grab a small word by accident. In "the tool returned 5
# results" the second pattern captures "the" as the tool name. Such words are dropped.
STOPWORDS = {"the", "a", "an", "this", "that", "our", "my", "some", "any"}

# Common tool name patterns for claim extraction
# Each pattern has one capturing group: the round brackets that do not start with "?:".
# That group (group 1) is the tool name.
TOOL_PATTERNS = [
    # Pattern 1: an optional "I" or "we", then a verb (used, called, ran, executed, invoked,
    # queried, searched), an optional "the/a/an", then the tool name (one word; underscores
    # are fine, like web_search), then one of: tool, function, api, search, database.
    # Example: "I used the web_search tool".
    r"(?:I |i |we |We )?(?:used|called|ran|executed|invoked|queried|searched)\s+(?:the\s+|a\s+|an\s+)?(\w+(?:_\w+)?)\s+(?:tool|function|api|search|database)",
    # Pattern 2: an optional "the", then the tool name, then one of: tool, function, api,
    # then a verb (returned, found, gave, produced, yielded).
    # Example: "the web_search tool returned".
    r"(?:the\s+)?(\w+(?:_\w+)?)\s+(?:tool|function|api)\s+(?:returned|found|gave|produced|yielded)",
]

# Patterns that find a number of results. The capturing group (\d+) holds the count.
COUNT_PATTERNS = [
    # Pattern 1: a verb (found, retrieved, got, returned, identified, discovered), then a
    # whole number, then a noun such as results, papers, documents, records, items,
    # studies, articles or matches. Example: "retrieved 3 documents".
    r"(?:found|retrieved|got|returned|identified|discovered)\s+(\d+)\s+(?:results?|papers?|documents?|records?|items?|studies|articles?|matches?)",
    # Pattern 2: the number first, then the noun (same list, but without "matches"),
    # then "were/was" and found, retrieved or returned. Example: "5 papers were found".
    r"(\d+)\s+(?:results?|papers?|documents?|records?|items?|studies|articles?)\s+(?:were|was)\s+(?:found|retrieved|returned)",
]

# Phrases claiming a positive/successful outcome, checked against actual tool
# status. Catches "RESULT_DISTORTION" (agent misrepresents what a tool did) in
# the specific case of claiming success where the trace recorded an error.
# Each pattern is checked on its own. Example matches: "without any error", "no errors",
# "completed successfully". (\b means a word edge, so "no error" is not found inside a
# longer word.)
SUCCESS_CLAIM_PATTERNS = [
    r"without (?:any )?error",
    r"\bno errors?\b",
    r"\bsuccessfully\b",
    r"completed successfully",
    r"ran (?:successfully|without issue)",
    r"executed (?:successfully|without (?:error|issue))",
]


def extract_result_count(text: str | None) -> Optional[int]:
    """Read the result count out of a tool's own result summary.

    Uses the same COUNT_PATTERNS as claim extraction, so the number a tool
    reports and the number an agent claims are read the same way. Without this
    the runner has no result_count to compare against and WRONG_COUNT can
    never fire.
    """
    if not text:
        return None
    # The patterns are written in lowercase, so lowercase the text first.
    lowered = text.lower()
    # Try each count pattern in order. The first one that matches wins, and group(1) is
    # the number (the (\d+) part). No match at all means "count unknown" (None).
    for pattern in COUNT_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            return int(match.group(1))
    return None


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
    # Step 1: find every phrase that names a tool. finditer gives all matches, not just the
    # first. group(1) is the tool name; group(0) is the whole matched phrase. A name is kept
    # only if it is not empty, not a stopword, and longer than 2 characters.
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
    # Step 2: find every phrase that gives a number of results. In the code, each number is
    # put on the LAST claim in the list, which is not always the nearest one in the text.
    # If there are several numbers, each overwrites the previous one, so the last number
    # the loop finds wins. If no tool claim exists yet, a claim named "unknown" is made.
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


def _check_count_mismatch(match: ToolClaimMatch) -> None:
    """Set WRONG_COUNT on a match in place if claimed and actual counts differ.

    Shared by the exact- and partial-match branches below — a prior version only
    ran this check on exact matches, so a claim like "queried the customer
    database and retrieved 14 records" against a tool_name of "customer_db"
    (a partial/substring match) silently skipped the count check and scored 0.
    """
    claim = match.claim
    tool = match.matched_tool
    # Nothing to compare unless there is a matched tool call, a number the agent claimed,
    # and a number the tool really returned. If any is missing, no mismatch is set.
    if tool is None or claim.claimed_count is None or tool.result_count is None:
        return
    if claim.claimed_count != tool.result_count:
        match.mismatch_type = "WRONG_COUNT"
        match.details = (
            f"Agent claimed {claim.claimed_count} results, "
            f"tool returned {tool.result_count}"
        )


def _check_false_success_claims(
    output_text: str,
    tool_calls: list[ToolCallRecord],
) -> list[ToolClaimMatch]:
    """Flag claims of success/no-error against tool calls that actually errored.

    Runs independently of extract_claims/validate_claims because the phrasing
    here ("the backup script executed without any error") doesn't fit the
    tool-name-then-keyword template TOOL_PATTERNS expects, so no ToolClaim
    would otherwise be extracted for it at all.
    """
    # Step 1: keep only the tool calls whose status is not "success". If there are none,
    # no success claim can be false, so stop here.
    errored = [tc for tc in tool_calls if tc.status != "success"]
    if not errored:
        return []

    # Step 2: does the output text use any success phrase? If not, there is nothing to flag.
    text_lower = output_text.lower() if output_text else ""
    claimed_success = any(re.search(p, text_lower) for p in SUCCESS_CLAIM_PATTERNS)
    if not claimed_success:
        return []

    # Step 3: make one RESULT_DISTORTION mismatch for each errored tool call. The code does
    # not check which tool the success phrase is about, so one phrase flags every errored
    # call. claim_text holds the whole output text, and details names the tool and status.
    return [
        ToolClaimMatch(
            claim=ToolClaim(tool_name=tc.tool_name, claim_text=output_text),
            matched_tool=tc,
            match_type="partial",
            mismatch_type="RESULT_DISTORTION",
            details=(
                f"Agent's output claims success, but '{tc.tool_name}' recorded "
                f"status={tc.status!r}"
                + (f" ({tc.result_summary})" if tc.result_summary else "")
            ),
        )
        for tc in errored
    ]


def validate_claims(
    claims: list[ToolClaim],
    tool_calls: list[ToolCallRecord],
) -> ToolClaimResult:
    """Validate extracted claims against actual tool call records.
    
    Returns a score ∈ [0, 1] where 0 = all claims valid, 1 = all invalid.
    """
    # Step 1: no claims means nothing to check. The score is 0.0, the same value as "all
    # claims matched". (models.py keeps tool_claims_found so the two cases can be told apart.)
    if not claims:
        return ToolClaimResult(
            total_claims=0,
            mismatches=0,
            tool_claim_score=0.0,
            details="No tool claims to validate",
        )

    # Step 2: look up real tool calls by lowercase name. If two calls share a name, the
    # later one replaces the earlier one in this dict.
    tool_map = {tc.tool_name.lower(): tc for tc in tool_calls}
    matches = []

    # Step 3: check each claim. Four outcomes are possible, tried in this order:
    # anonymous count claim, exact name match, partial name match, no match at all.
    for claim in claims:
        claim_name = claim.tool_name.lower()

        # Handle anonymous count claim (e.g. "returned 3 items")
        # No tool was named, so the number is compared with the FIRST recorded tool call.
        # With no tool calls at all, the claim is a FABRICATED_TOOL.
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
                # This default text is used even when a count is missing and nothing was
                # compared. WRONG_COUNT is set only when both numbers exist and differ.
                details = "Count matches recorded tool output"
                if claim.claimed_count is not None and primary_tool.result_count is not None:
                    if claim.claimed_count != primary_tool.result_count:
                        mismatch_type = "WRONG_COUNT"
                        details = (
                            f"Agent claimed {claim.claimed_count} results, "
                            f"tool returned {primary_tool.result_count}"
                        )
                # Here "exact" means no mismatch was found and "partial" means a wrong count.
                matches.append(ToolClaimMatch(
                    claim=claim,
                    matched_tool=primary_tool,
                    match_type="exact" if not mismatch_type else "partial",
                    mismatch_type=mismatch_type,
                    details=details,
                ))
            continue

        # Try exact match
        # The claimed name equals a recorded tool name. Then the counts are compared.
        if claim_name in tool_map:
            tool = tool_map[claim_name]
            match = ToolClaimMatch(
                claim=claim,
                matched_tool=tool,
                match_type="exact",
            )
            _check_count_mismatch(match)
            matches.append(match)
            continue

        # Try partial match (substring)
        # One name is inside the other (for example "customer" and "customer_db"). The first
        # tool name in the lookup dict that fits is used, and the counts are compared the same way.
        partial = None
        for tool_name, tool in tool_map.items():
            if claim_name in tool_name or tool_name in claim_name:
                partial = ToolClaimMatch(
                    claim=claim,
                    matched_tool=tool,
                    match_type="partial",
                )
                _check_count_mismatch(partial)
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

    # Step 4: the score is the share of claims that have a mismatch type, from 0.0 (none)
    # to 1.0 (all). The "if claims else 0.0" part cannot trigger here, because the empty
    # case already returned above.
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
    # Step 1: pull the claims out of the text. Step 2: check them against the tool calls.
    claims = extract_claims(output_text)
    result = validate_claims(claims, tool_calls)

    # Step 3: separately look for "success" wording on a call that errored. Each one found
    # is added to the result as one more claim, and it always counts as a mismatch. So the
    # totals go up, and the score is worked out again from the new totals.
    false_success = _check_false_success_claims(output_text, tool_calls)
    if false_success:
        result.matches = [*result.matches, *false_success]
        result.total_claims += len(false_success)
        result.mismatches += len(false_success)
        result.tool_claim_score = round(
            result.mismatches / result.total_claims, 4
        )
        result.details = f"{result.mismatches}/{result.total_claims} claims have mismatches"

    return result
