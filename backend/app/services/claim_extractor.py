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

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


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


class ClaimExtractor:
    """Multi-stage rule-based and regex claim extraction engine."""

    # Citation patterns: e.g., "Zhang et al. (2024)", "Smith (2023)", "[Vaswani 2017]"
    CITATION_PATTERN = re.compile(
        r"(\b[A-Z][a-z]+\s+et\s+al\.?\s*(?:\((?:19|20)\d{2}\)|,\s*(?:19|20)\d{2})|\b[A-Z][a-z]+\s+\((?:19|20)\d{2}\)|\[[A-Z][a-zA-Z]+.*?(?:19|20)\d{2}\])",
        re.IGNORECASE,
    )

    # Tool invocation patterns: e.g., "queried vector_search_tool", "called arxiv_api", "used sql_tool"
    TOOL_PATTERN = re.compile(
        r"(?:queried|called|invoked|used|executed|ran)\s+(?:the\s+)?([a-zA-Z0-9_-]+(?:tool|api|search|query|retriever|analyzer|db|index))",
        re.IGNORECASE,
    )

    # Numeric & count patterns: e.g., "14 papers", "99.9%", "42.5 ms", "3 records"
    NUMERIC_PATTERN = re.compile(
        r"(\b\d+(?:\.\d+)?\s*(?:%|percent|ms|seconds|papers|studies|records|documents|rows|tokens|users|trials)\b)",
        re.IGNORECASE,
    )

    # Comparison patterns: e.g., "increased by 20%", "decreased by", "higher than", "faster than"
    COMPARISON_PATTERN = re.compile(
        r"(\b(?:increased|decreased|improved|degraded|higher|lower|faster|slower|reduced|exceeded)\s+(?:by|than|from|to)?\s*[^.,;]+)",
        re.IGNORECASE,
    )

    # Temporal patterns: e.g., "from 2019 to 2021", "in the last 24 hours", "during Q3 2024"
    TEMPORAL_PATTERN = re.compile(
        r"(\b(?:from|between|during|since|in)\s+(?:19|20)\d{2}(?:\s*(?:to|-|and)\s*(?:19|20)\d{2})?|\blast\s+\d+\s+(?:hours|days|weeks|months|years)\b)",
        re.IGNORECASE,
    )

    def extract_claims(self, text: str, source_span: Optional[str] = None) -> List[ExtractedClaim]:
        """Extract all structured claims from text."""
        if not text or not text.strip():
            return []

        claims: List[ExtractedClaim] = []
        seen_texts = set()
        # Avoid splitting on common abbreviations like et al., e.g., i.e.
        safe_text = re.sub(r"\bet al\.", "et al<DOT>", text.strip(), flags=re.IGNORECASE)
        safe_text = re.sub(r"\be\.g\.", "e<DOT>g<DOT>", safe_text, flags=re.IGNORECASE)
        safe_text = re.sub(r"\bi\.e\.", "i<DOT>e<DOT>", safe_text, flags=re.IGNORECASE)

        raw_sentences = re.split(r"(?<=[.!?])\s+", safe_text)
        sentences = [s.replace("<DOT>", ".").strip() for s in raw_sentences if s.strip()]

        for sentence in sentences:
            s_clean = sentence.strip()
            if not s_clean or len(s_clean) < 8:
                continue

            # 1. Check Citation claims
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
claim_extractor = ClaimExtractor()
