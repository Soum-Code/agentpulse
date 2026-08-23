"""Demo: Multi-agent AI Research Assistant with AgentPulse monitoring.

5-agent LangGraph pipeline with controlled failure injection to demonstrate
AgentPulse's hallucination detection, tool-claim validation, and drift tracking.

Agents:
  1. Researcher  — Formulates search queries
  2. Retriever   — Searches for papers (simulated)
  3. Verifier    — Cross-references claims against sources
  4. Analyst     — Reasons over evidence
  5. Writer      — Produces final report

Usage:
  python research_assistant.py

  # With failure injection:
  python research_assistant.py --inject-failures

Requires: pip install agentpulse langgraph langchain-core
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import sys
from datetime import datetime
from typing import Any, TypedDict

# Add SDK to path for local development
sys.path.insert(0, "../sdk/src")

from agentpulse import AgentPulse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("demo")


# ─── State Definition ──────────────────────────────────────────────────

class ResearchState(TypedDict, total=False):
    query: str
    search_queries: list[str]
    papers: list[dict]
    verified_claims: list[dict]
    analysis: str
    report: str
    errors: list[str]
    # AgentPulse trace propagation
    __agentpulse_trace_id: str
    __agentpulse_parent_span_id: str


# ─── Simulated Tools ──────────────────────────────────────────────────

PAPER_DATABASE = [
    {
        "title": "Attention Is All You Need",
        "authors": "Vaswani et al.",
        "year": 2017,
        "abstract": "We propose the Transformer architecture based on self-attention mechanisms.",
        "source": "NeurIPS 2017",
    },
    {
        "title": "BERT: Pre-training of Deep Bidirectional Transformers",
        "authors": "Devlin et al.",
        "year": 2019,
        "abstract": "We introduce BERT, a bidirectional transformer for language understanding.",
        "source": "NAACL 2019",
    },
    {
        "title": "Language Models are Few-Shot Learners",
        "authors": "Brown et al.",
        "year": 2020,
        "abstract": "GPT-3 demonstrates that scaling language models improves few-shot performance.",
        "source": "NeurIPS 2020",
    },
]


def search_papers(query: str, inject_failure: bool = False) -> list[dict]:
    """Simulated paper search tool."""
    results = [p for p in PAPER_DATABASE if any(
        word.lower() in p["title"].lower() or word.lower() in p["abstract"].lower()
        for word in query.split()
    )]

    if inject_failure:
        # Return fewer results than expected to trigger tool-claim mismatch
        if len(results) > 1:
            results = results[:1]

    return results if results else PAPER_DATABASE[:2]


def verify_claim(claim: str, source: str, inject_failure: bool = False) -> dict:
    """Simulated claim verification tool."""
    if inject_failure:
        # Incorrectly verify a false claim
        return {
            "claim": claim,
            "verified": True,  # Wrong!
            "confidence": 0.95,
            "source": source,
        }

    # Simple heuristic verification
    verified = any(word in source.lower() for word in claim.lower().split()[:3])
    return {
        "claim": claim,
        "verified": verified,
        "confidence": 0.8 if verified else 0.3,
        "source": source,
    }


# ─── Agent Functions ──────────────────────────────────────────────────

def researcher_node(state: ResearchState) -> dict:
    """Formulate search queries based on the user question."""
    query = state.get("query", "transformer architecture")
    search_queries = [
        f"{query} recent advances",
        f"{query} benchmark results",
        f"{query} applications",
    ]

    return {
        "search_queries": search_queries,
        "output_summary": f"Generated {len(search_queries)} search queries for: {query}",
    }


def retriever_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Search for papers using the formulated queries."""
    queries = state.get("search_queries", ["transformers"])
    all_papers = []

    for q in queries[:2]:
        results = search_papers(q, inject_failure=inject_failure)
        all_papers.extend(results)

    # Deduplicate by title
    seen = set()
    unique = []
    for p in all_papers:
        if p["title"] not in seen:
            seen.add(p["title"])
            unique.append(p)

    actual_count = len(unique)

    return {
        "papers": unique,
        "tool_name": "search_papers",
        "tool_result_summary": f"{actual_count} papers found",
        "output_summary": f"Retrieved {actual_count} papers from search",
    }


def verifier_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Verify claims against retrieved papers."""
    papers = state.get("papers", [])
    claims = [
        f"{p['title']} was published by {p['authors']}" for p in papers
    ]

    verified = []
    for i, claim in enumerate(claims):
        source = papers[i]["abstract"] if i < len(papers) else ""
        result = verify_claim(claim, source, inject_failure=inject_failure)
        verified.append(result)

    return {
        "verified_claims": verified,
        "tool_name": "verify_claim",
        "tool_result_summary": f"Verified {len(verified)} claims",
        "output_summary": f"Verified {sum(1 for v in verified if v['verified'])}/{len(verified)} claims",
    }


def analyst_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Analyze the evidence and produce reasoning."""
    papers = state.get("papers", [])
    claims = state.get("verified_claims", [])

    if inject_failure:
        # Contradicts the verifier's findings
        analysis = (
            "Based on my analysis, none of the retrieved papers are relevant "
            "to the query. The evidence does not support any conclusions about "
            "transformer architectures. The search results appear to be from "
            "an unrelated domain."
        )
    else:
        paper_titles = [p["title"] for p in papers]
        verified_count = sum(1 for c in claims if c.get("verified"))

        analysis = (
            f"Analysis of {len(papers)} papers reveals strong evidence. "
            f"Key works include: {', '.join(paper_titles[:3])}. "
            f"{verified_count} out of {len(claims)} claims were verified against sources. "
            f"The evidence consistently supports advances in transformer architectures."
        )

    return {
        "analysis": analysis,
        "output_summary": analysis[:200],
    }


def writer_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Produce the final research report."""
    papers = state.get("papers", [])
    analysis = state.get("analysis", "")
    actual_paper_count = len(papers)

    if inject_failure:
        # Hallucinate: claim more papers than were found, cite non-existent paper
        report = (
            f"# Research Report\n\n"
            f"This report synthesizes findings from {actual_paper_count + 2} papers.\n\n"
            f"Key findings:\n"
            f"1. {papers[0]['title']} demonstrates foundational concepts.\n"
            f"2. A groundbreaking study by Zhang et al. (2024) 'Universal Reasoning "
            f"Framework' provides definitive proof of emergent reasoning.\n"
            f"3. The search identified {actual_paper_count + 2} highly relevant studies.\n\n"
            f"Conclusion: The evidence overwhelmingly supports the hypothesis.\n"
        )
    else:
        report = (
            f"# Research Report\n\n"
            f"This report synthesizes findings from {actual_paper_count} papers.\n\n"
            f"Key findings:\n"
        )
        for i, p in enumerate(papers[:3], 1):
            report += f"{i}. {p['title']} ({p['authors']}, {p['year']}): {p['abstract'][:100]}\n"

        report += (
            f"\n{analysis}\n\n"
            f"Conclusion: Based on {actual_paper_count} retrieved and verified papers, "
            f"the evidence supports continued advances in the field.\n"
        )

    return {
        "report": report,
        "output_summary": report[:300],
    }


# ─── Pipeline Assembly ────────────────────────────────────────────────

async def run_pipeline(
    query: str,
    inject_failures: bool = False,
    pulse: AgentPulse | None = None,
) -> ResearchState:
    """Run the 5-agent research pipeline.
    
    Uses direct function calls instead of full LangGraph to keep the demo
    dependency-light. The AgentPulse decorators work the same way.
    """
    logger.info("Starting research pipeline: %s", query)
    logger.info("Failure injection: %s", "ON" if inject_failures else "OFF")

    # Initial state
    state: ResearchState = {"query": query, "errors": []}

    # Create monitored versions if AgentPulse is available
    if pulse:
        _researcher = pulse.monitor(agent_id="researcher", role="researcher")(researcher_node)
        _retriever = pulse.monitor(agent_id="retriever", role="retriever")(
            lambda s: retriever_node(s, inject_failure=inject_failures)
        )
        _verifier = pulse.monitor(agent_id="verifier", role="verifier")(
            lambda s: verifier_node(s, inject_failure=inject_failures)
        )
        _analyst = pulse.monitor(agent_id="analyst", role="analyst")(
            lambda s: analyst_node(s, inject_failure=inject_failures)
        )
        _writer = pulse.monitor(agent_id="writer", role="writer")(
            lambda s: writer_node(s, inject_failure=inject_failures)
        )
    else:
        _researcher = researcher_node
        _retriever = lambda s: retriever_node(s, inject_failure=inject_failures)
        _verifier = lambda s: verifier_node(s, inject_failure=inject_failures)
        _analyst = lambda s: analyst_node(s, inject_failure=inject_failures)
        _writer = lambda s: writer_node(s, inject_failure=inject_failures)

    # Execute pipeline
    agents = [
        ("Researcher", _researcher),
        ("Retriever", _retriever),
        ("Verifier", _verifier),
        ("Analyst", _analyst),
        ("Writer", _writer),
    ]

    for name, agent_fn in agents:
        try:
            logger.info("→ Running %s...", name)
            result = agent_fn(state)
            state.update(result)
            logger.info("  ✓ %s complete", name)
        except Exception as exc:
            logger.error("  ✗ %s failed: %s", name, exc)
            state.setdefault("errors", []).append(f"{name}: {str(exc)}")

    return state


# ─── Entry Point ──────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="AgentPulse Demo: AI Research Assistant")
    parser.add_argument("--query", default="transformer architecture advances",
                        help="Research query")
    parser.add_argument("--inject-failures", action="store_true",
                        help="Enable controlled failure injection")
    parser.add_argument("--endpoint", default="http://localhost:8000",
                        help="AgentPulse backend URL")
    parser.add_argument("--api-key", default="change-me-to-a-secure-key",
                        help="AgentPulse API key")
    parser.add_argument("--no-monitor", action="store_true",
                        help="Run without AgentPulse monitoring")
    parser.add_argument("--runs", type=int, default=1,
                        help="Number of pipeline runs (for drift testing)")
    args = parser.parse_args()

    pulse = None
    if not args.no_monitor:
        pulse = AgentPulse(
            endpoint=args.endpoint,
            api_key=args.api_key,
            pipeline_id="research_pipeline_v1",
            capture_inputs=True,
            capture_outputs=True,
        )
        await pulse.start()
        logger.info("AgentPulse monitoring ACTIVE → %s", args.endpoint)
    else:
        logger.info("AgentPulse monitoring DISABLED")

    try:
        for run in range(args.runs):
            if args.runs > 1:
                logger.info("\n═══ Run %d/%d ═══", run + 1, args.runs)

            # Vary injection for drift testing
            inject = args.inject_failures
            if args.runs > 1 and run > args.runs * 0.7:
                inject = True  # Start injecting failures in later runs

            state = await run_pipeline(
                query=args.query,
                inject_failures=inject,
                pulse=pulse,
            )

            if "report" in state:
                logger.info("\n%s", state["report"][:500])

            if args.runs > 1:
                await asyncio.sleep(0.5)  # Space out runs

    finally:
        if pulse:
            await pulse.shutdown()

    logger.info("\nDemo complete. Check the AgentPulse dashboard at %s", args.endpoint)


if __name__ == "__main__":
    asyncio.run(main())
