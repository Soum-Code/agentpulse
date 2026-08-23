"""Unit tests for Upgraded Multi-Type Claim Extractor."""

import pytest
from app.services.claim_extractor import ClaimExtractor, claim_extractor


def test_extract_citation_claim():
    text = "According to Zhang et al. (2024), universal cellular regeneration was observed."
    claims = claim_extractor.extract_claims(text, source_span="span_01")
    assert len(claims) >= 1
    assert any(c.claim_type == "CITATION_RELATED" for c in claims)


def test_extract_tool_claim():
    text = "We queried the support_kb_search and retrieved runbook results."
    claims = claim_extractor.extract_claims(text)
    assert len(claims) >= 1
    assert any(c.claim_type == "TOOL_RELATED" for c in claims)


def test_extract_numeric_claim():
    text = "The system achieved 99.9% uptime and processed 400 records."
    claims = claim_extractor.extract_claims(text)
    assert len(claims) >= 1
    assert any(c.claim_type == "NUMERIC" for c in claims)


def test_extract_comparison_claim():
    text = "Query latency decreased by 40% compared to traditional baseline."
    claims = claim_extractor.extract_claims(text)
    assert len(claims) >= 1
    assert any(c.claim_type == "COMPARISON" for c in claims)


def test_extract_temporal_claim():
    text = "The observational study analyzed cohort records between 2019 and 2021."
    claims = claim_extractor.extract_claims(text)
    assert len(claims) >= 1
    assert any(c.claim_type in ("TEMPORAL", "FACTUAL") for c in claims)


def test_extract_empty_string():
    claims = claim_extractor.extract_claims("")
    assert claims == []
