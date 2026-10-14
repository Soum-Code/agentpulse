"""Upgraded Multi-Type Claim Extractor for AgentPulse.

Extracts structured claims from LLM output across 6 distinct categories:
1. NUMERIC: Quantities, percentages, counts, metrics.
2. FACTUAL: Entity-relation propositions.
3. TOOL_RELATED: Named tool invocations and execution details.
4. CITATION_RELATED: Author, year, paper, or document citations.
5. COMPARISON: Comparative/directional assertions ('increased by', 'faster than').
6. TEMPORAL: Time periods, dates, and durations.

Assigns confidence scores and provides structured evidence for NLI and tool-trace verification.
"""

# WHAT THIS FILE IS FOR
# It reads a piece of text and cuts out the "claims" in it: sentences that state something
# that could be checked. Each claim gets a type (number, citation, tool use, comparison,
# time or plain fact) and a fixed confidence number. It works with regexes only (patterns
# that match text); there is no AI model in here. Each sentence becomes at most one claim:
# the checks run in the order written in extract_claims, and the first match wins.
#
# HOW IT FITS IN
# The live pipeline does not use this file. Only tests/test_claim_extractor.py imports it.
# The tool-claim check in the pipeline uses services/tool_claim.py and its own extract_claims.

from __future__ import annotations

# re = regular expressions (patterns for matching text).
import re
# asdict turns a dataclass into a plain dict.
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


# One claim found in the text. claim_text is the whole sentence. extraction_confidence is a
# fixed number for each type (set in extract_claims), not computed from the text.
# source_span is a label the caller passes in; it is stored unchanged. extracted_entities
# holds the pieces the pattern matched (for example "14 papers"). metadata is never filled
# in this file.
@dataclass
class ExtractedClaim:
    """A single structured claim extracted from agent output text."""

    claim_text: str
    claim_type: str  # NUMERIC, FACTUAL, TOOL_RELATED, CITATION_RELATED, COMPARISON, TEMPORAL
    extraction_confidence: float
    source_span: Optional[str] = None
    extracted_entities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Holds the compiled regex patterns and one method, extract_claims. It keeps no data
# between calls, so the single shared object at the bottom of the file is safe to reuse.
class ClaimExtractor:
    """Multi-stage rule-based and regex claim extraction engine."""

    # Citation patterns: e.g., "Zhang et al. (2024)", "Smith (2023)", "[Vaswani 2017]"
    # In words, there are three alternatives: (1) a Name, then "et al." and a year, either
    # in round brackets or after a comma; (2) a Name followed by a year in round brackets;
    # (3) text in square brackets that starts with a Name and ends with a year. A year is
    # 19xx or 20xx. Because of re.IGNORECASE, "Name" also matches a lowercase word, so
    # "the (2021)" counts.
    CITATION_PATTERN = re.compile(
        r"(\b[A-Z][a-z]+\s+et\s+al\.?\s*(?:\((?:19|20)\d{2}\)|,\s*(?:19|20)\d{2})|\b[A-Z][a-z]+\s+\((?:19|20)\d{2}\)|\[[A-Z][a-zA-Z]+.*?(?:19|20)\d{2}\])",
        re.IGNORECASE,
    )

    # Tool invocation patterns: e.g., "queried vector_search_tool", "called arxiv_api", "used sql_tool"
    # In words: one of the verbs queried, called, invoked, used, executed or ran; an optional
    # "the"; then a name (letters, digits, "_" or "-"), cut back to its last ending of tool,
    # api, search, query, retriever, analyzer, db or index. Letters after that ending are
    # dropped, so "called researching it" gives "research". Only the name is kept, not the verb.
    TOOL_PATTERN = re.compile(
        r"(?:queried|called|invoked|used|executed|ran)\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:tool|api|search|query|retriever|analyzer|db|index))",
        re.IGNORECASE,
    )

    # Numeric & count patterns: e.g., "14 papers", "99.9%", "42.5 ms", "3 records"
    # In words: a whole number or decimal, optional spaces, then a unit: %, percent, ms,
    # seconds, papers, studies, records, documents, rows, tokens, users or trials.
    # Quirk, checked by running it: after "%" the final \b needs a letter or digit to follow
    # directly. So "99.9%" followed by a space or a full stop does NOT match, but
    # "99.9 percent" does.
    NUMERIC_PATTERN = re.compile(
        r"(\b\d+(?:\.\d+)?\s*(?:%|percent|ms|seconds|papers|studies|records|documents|rows|tokens|users|trials)\b)",
        re.IGNORECASE,
    )

    # Comparison patterns: e.g., "increased by 20%", "decreased by", "higher than", "faster than"
    # In words: one of increased, decreased, improved, degraded, higher, lower, faster,
    # slower, reduced or exceeded; an optional by/than/from/to; then everything up to the
    # next full stop, comma or semicolon. So the match is the whole phrase, not only the verb.
    COMPARISON_PATTERN = re.compile(
        r"(\b(?:increased|decreased|improved|degraded|higher|lower|faster|slower|reduced|exceeded)\s+(?:by|than|from|to)?\s*[^.,;]+)",
        re.IGNORECASE,
    )

    # Temporal patterns: e.g., "from 2019 to 2021", "in the last 24 hours", "during Q3 2024"
    # In words: either (a) from, between, during, since or in, then a year (19xx or 20xx),
    # then optionally "to", "-" or "and" and a second year; or (b) "last", a number, and
    # hours, days, weeks, months or years. A year must come right after the word, so the
    # example "during Q3 2024" above does NOT match (checked by running it).
    TEMPORAL_PATTERN = re.compile(
        r"(\b(?:from|between|during|since|in)\s+(?:19|20)\d{2}(?:\s*(?:to|-|and)\s*(?:19|20)\d{2})?|\blast\s+\d+\s+(?:hours|days|weeks|months|years)\b)",
        re.IGNORECASE,
    )

    # In: the text, and an optional label (source_span) that is copied onto every claim.
    # Out: a list of ExtractedClaim in text order, at most one per sentence. A sentence that
    # matches no pattern and is 20 characters or shorter gives nothing.
    def extract_claims(self, text: str, source_span: Optional[str] = None) -> List[ExtractedClaim]:
        """Extract all structured claims from text."""
        # Step 1: empty or blank text has no claims.
        if not text or not text.strip():
            return []

        # seen_texts remembers the sentences already turned into claims, so none repeats.
        claims: List[ExtractedClaim] = []
        seen_texts = set()
        # Step 2: protect abbreviations. Each dot in "et al.", "e.g." and "i.e." is swapped
        # for the marker <DOT> for now, so the sentence splitter does not cut there.
        # Avoid splitting on common abbreviations like et al., e.g., i.e.
        safe_text = re.sub(r"\bet al\.", "et al<DOT>", text.strip(), flags=re.IGNORECASE)
        safe_text = re.sub(r"\be\.g\.", "e<DOT>g<DOT>", safe_text, flags=re.IGNORECASE)
        safe_text = re.sub(r"\bi\.e\.", "i<DOT>e<DOT>", safe_text, flags=re.IGNORECASE)

        # Step 3: cut into sentences at any white space that comes right after ".", "!" or
        # "?" ("(?<=...)" looks at the previous character without using it up). Then put the
        # dots back and drop empty pieces.
        raw_sentences = re.split(r"(?<=[.!?])\s+", safe_text)
        sentences = [s.replace("<DOT>", ".").strip() for s in raw_sentences if s.strip()]

        # Step 4: look at each sentence. Sentences shorter than 8 characters are skipped.
        # The checks run in this order: citation, tool, comparison, temporal, numeric,
        # factual. The first check that matches makes the claim, and `continue` moves on to
        # the next sentence, so one sentence gets one type only.
        for sentence in sentences:
            s_clean = sentence.strip()
            if not s_clean or len(s_clean) < 8:
                continue

            # 1. Check Citation claims
            # (findall returns every piece of the sentence that the pattern matched. The
            # confidence number in each block below is fixed for its type.)
            cit_matches = self.CITATION_PATTERN.findall(s_clean)
            if cit_matches:
                if s_clean not in seen_texts:
                    claims.append(
                        ExtractedClaim(
                            claim_text=s_clean,
                            claim_type="CITATION_RELATED",
                            extraction_confidence=0.92,
                            source_span=source_span,
                            extracted_entities=cit_matches,
                        )
                    )
                    seen_texts.add(s_clean)
                continue

            # 2. Check Tool invocation claims
            tool_matches = self.TOOL_PATTERN.findall(s_clean)
            if tool_matches:
                if s_clean not in seen_texts:
                    claims.append(
                        ExtractedClaim(
                            claim_text=s_clean,
                            claim_type="TOOL_RELATED",
                            extraction_confidence=0.95,
                            source_span=source_span,
                            extracted_entities=tool_matches,
                        )
                    )
                    seen_texts.add(s_clean)
                continue

            # 3. Check Comparison claims
            comp_matches = self.COMPARISON_PATTERN.findall(s_clean)
            if comp_matches:
                if s_clean not in seen_texts:
                    claims.append(
                        ExtractedClaim(
                            claim_text=s_clean,
                            claim_type="COMPARISON",
                            extraction_confidence=0.88,
                            source_span=source_span,
                            extracted_entities=comp_matches,
                        )
                    )
                    seen_texts.add(s_clean)
                continue

            # 4. Check Temporal claims
            temp_matches = self.TEMPORAL_PATTERN.findall(s_clean)
            if temp_matches:
                if s_clean not in seen_texts:
                    claims.append(
                        ExtractedClaim(
                            claim_text=s_clean,
                            claim_type="TEMPORAL",
                            extraction_confidence=0.85,
                            source_span=source_span,
                            extracted_entities=temp_matches,
                        )
                    )
                    seen_texts.add(s_clean)
                continue

            # 5. Check Numeric claims
            num_matches = self.NUMERIC_PATTERN.findall(s_clean)
            if num_matches:
                if s_clean not in seen_texts:
                    claims.append(
                        ExtractedClaim(
                            claim_text=s_clean,
                            claim_type="NUMERIC",
                            extraction_confidence=0.90,
                            source_span=source_span,
                            extracted_entities=num_matches,
                        )
                    )
                    seen_texts.add(s_clean)
                continue

            # 6. Default Factual Claim
            # Nothing above matched, so keep the sentence as a plain fact if it is longer
            # than 20 characters. No matched pieces are stored for this type.
            if s_clean not in seen_texts and len(s_clean) > 20:
                claims.append(
                    ExtractedClaim(
                        claim_text=s_clean,
                        claim_type="FACTUAL",
                        extraction_confidence=0.80,
                        source_span=source_span,
                    )
                )
                seen_texts.add(s_clean)

        return claims


# Global singleton instance
# (Callers import this ready-made object instead of making their own ClaimExtractor.)
claim_extractor = ClaimExtractor()
