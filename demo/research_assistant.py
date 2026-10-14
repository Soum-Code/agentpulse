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

# ABOUT THIS FILE
# ---------------
# A demo that runs five "agents" one after another to build a small research report:
# researcher -> retriever -> verifier -> analyst -> writer. No LLM is called. Every
# agent is plain Python that builds its text from templates, and the "papers" come from
# a hard-coded list. That makes it easy to switch on a controlled failure
# (--inject-failures) and watch how AgentPulse reacts.
# Note: the docstring above says LangGraph, but this file imports no langgraph. The
# agents are ordinary functions called in a loop in run_pipeline().
#
# HOW IT FITS IN
# Run it as a script from the demo/ folder. It uses the AgentPulse SDK (the monitor
# decorator) to send one span (one recorded step of an agent) per agent to the backend
# API; the worker scores the spans later. demo/workflows/research_assistant.py is a
# different file with a similar name: a separate LangGraph version.

from __future__ import annotations

# argparse reads command-line flags; asyncio runs main(); logging prints progress lines.
# json, random, datetime and Any are imported but never used in this file.
import argparse
import asyncio
import json
import logging
import random
import sys
from datetime import datetime
from typing import Any, TypedDict

# Add SDK to path for local development
# This path is relative to the folder you run the command from, not to this file. So run
# the script from the demo/ folder, or install agentpulse first.
sys.path.insert(0, "../sdk/src")

# AgentPulse = the SDK client that records spans and sends them to the backend.
from agentpulse import AgentPulse

# Print progress lines that show the time, the logger name and the message.
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("demo")


# ─── State Definition ──────────────────────────────────────────────────

# The shared "state" that is passed from agent to agent. At run time it is a plain dict;
# TypedDict only gives type hints, and total=False means every key is optional.
#   query            the user's question
#   search_queries   made by the researcher
#   papers           found by the retriever
#   verified_claims  checked by the verifier
#   analysis         the analyst's text
#   report           the writer's final report
#   errors           one message for each agent that raised an error
class ResearchState(TypedDict, total=False):
    query: str
    search_queries: list[str]
    papers: list[dict]
    verified_claims: list[dict]
    analysis: str
    report: str
    errors: list[str]
    # AgentPulse trace propagation
    # The monitor decorator adds these two keys to each agent's returned dict. The next
    # agent's span reads them from the state, so all five spans join the same trace.
    __agentpulse_trace_id: str
    __agentpulse_parent_span_id: str


# ─── Simulated Tools ──────────────────────────────────────────────────

# Three hard-coded papers that stand in for a real paper-search service (no network).
# Each has a title, authors, year, a one-line abstract (a short summary of the paper),
# and "source" = where it was published.
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


# In: a query string, and inject_failure (True = return fewer papers than it should).
# Out: a list of paper dicts taken from PAPER_DATABASE.
def search_papers(query: str, inject_failure: bool = False) -> list[dict]:
    """Simulated paper search tool."""
    # Step 1: keep a paper if ANY word of the query appears in its title or abstract.
    # The test is a plain substring check that ignores upper/lower case, so a short word
    # like "is" also matches inside longer words.
    results = [p for p in PAPER_DATABASE if any(
        word.lower() in p["title"].lower() or word.lower() in p["abstract"].lower()
        for word in query.split()
    )]

    if inject_failure:
        # Return fewer results than expected to trigger tool-claim mismatch
        if len(results) > 1:
            results = results[:1]

    # If nothing matched, fall back to the first two papers, so the caller never gets an
    # empty list.
    return results if results else PAPER_DATABASE[:2]


# In: a claim sentence, the source text to check it against (a paper's abstract), and
# inject_failure. Out: a dict with the claim, verified (True/False), a confidence number,
# and the source. No model is used; the confidence values are fixed constants. With
# inject_failure on, it skips the check and always answers verified=True (confidence 0.95).
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
    # The rule: the claim counts as verified if ANY of its first three words appears (as a
    # plain substring, ignoring case) in the source. This is a loose word match, not real
    # fact-checking. Confidence is 0.8 when verified, otherwise 0.3.
    verified = any(word in source.lower() for word in claim.lower().split()[:3])
    return {
        "claim": claim,
        "verified": verified,
        "confidence": 0.8 if verified else 0.3,
        "source": source,
    }


# ─── Agent Functions ──────────────────────────────────────────────────

# Each agent below is a function. It takes the shared state dict and returns a dict of
# new results, which run_pipeline() merges into the state.
# Besides its real results, a returned dict also holds "output_summary" and, for the two
# tool-using agents, "tool_name" and "tool_result_summary". The monitor decorator does not
# read those three keys. When capture_outputs is on (as it is in main()), it saves the
# returned dict as JSON text, cut to a maximum length, for the span's output. It never
# sets the span's own tool fields (see sdk/src/agentpulse/decorators.py). So the backend
# gets no tool_name for these spans, and its tool-claim check, which only runs when a
# tool_name is set, is skipped for them.

# In: the state. Out: three search queries, made by adding a phrase to the user's query.
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


# In: the state (with the researcher's queries). Out: the papers found, plus summary text.
# Only the FIRST TWO queries are searched (queries[:2]); the third one is never used.
def retriever_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Search for papers using the formulated queries."""
    queries = state.get("search_queries", ["transformers"])
    all_papers = []

    # Step 1: run the search tool once for each of the first two queries and pool the hits.
    for q in queries[:2]:
        results = search_papers(q, inject_failure=inject_failure)
        all_papers.extend(results)

    # Deduplicate by title
    # Step 2: seen = titles already kept; unique = the first copy of each paper, in order.
    seen = set()
    unique = []
    for p in all_papers:
        if p["title"] not in seen:
            seen.add(p["title"])
            unique.append(p)

    # The true number of distinct papers found. The summary texts below use it.
    actual_count = len(unique)

    # Step 3: return the papers (they go into the state) and the labels described in the
    # note above researcher_node: tool name, what the tool returned, one-line summary.
    return {
        "papers": unique,
        "tool_name": "search_papers",
        "tool_result_summary": f"{actual_count} papers found",
        "output_summary": f"Retrieved {actual_count} papers from search",
    }


# In: the state (with the papers). Out: one check result per paper, plus summary text.
def verifier_node(state: ResearchState, inject_failure: bool = False) -> dict:
    """Verify claims against retrieved papers."""
    papers = state.get("papers", [])
    # Step 1: make one claim sentence per paper: "<title> was published by <authors>".
    claims = [
        f"{p['title']} was published by {p['authors']}" for p in papers
    ]

    # Step 2: check each claim against the abstract of the paper it came from. The
    # `else ""` guard is never needed here, because there is exactly one claim per paper.
    verified = []
    for i, claim in enumerate(claims):
        source = papers[i]["abstract"] if i < len(papers) else ""
        result = verify_claim(claim, source, inject_failure=inject_failure)
        verified.append(result)

    # Step 3: return the results. tool_result_summary says "Verified N claims" for every
    # claim checked, passed or not. output_summary shows passed/total, e.g. "Verified 2/3".
    return {
        "verified_claims": verified,
        "tool_name": "verify_claim",
        "tool_result_summary": f"Verified {len(verified)} claims",
        "output_summary": f"Verified {sum(1 for v in verified if v['verified'])}/{len(verified)} claims",
    }


# In: the state (papers and verified claims). Out: an analysis text built from a template.
# Normal mode names up to 3 paper titles and counts the verified claims. Failure mode
# returns a fixed text that says the papers are irrelevant.
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

    # output_summary keeps only the first 200 characters of the analysis.
    return {
        "analysis": analysis,
        "output_summary": analysis[:200],
    }


# In: the state (papers and analysis). Out: a short markdown report. Normal mode lists up
# to 3 papers and repeats the real paper count. Failure mode reports 2 more papers than
# were found and cites a paper that is not in the database.
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
        # One numbered line for each of the first three papers: title, authors, year, and
        # the first 100 characters of the abstract.
        for i, p in enumerate(papers[:3], 1):
            report += f"{i}. {p['title']} ({p['authors']}, {p['year']}): {p['abstract'][:100]}\n"

        # Then the analysis text and a closing line that repeats the real paper count.
        report += (
            f"\n{analysis}\n\n"
            f"Conclusion: Based on {actual_paper_count} retrieved and verified papers, "
            f"the evidence supports continued advances in the field.\n"
        )

    # output_summary keeps only the first 300 characters of the report.
    return {
        "report": report,
        "output_summary": report[:300],
    }


# ─── Pipeline Assembly ────────────────────────────────────────────────

# Run the five agents once, in order, and return the final state.
# In: the user's query, whether to inject failures, and an optional AgentPulse client
# (None = run without monitoring). It is `async` so main() can await it, but it never
# awaits anything inside: the agents are plain, blocking functions.
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
    # pulse.monitor(...) gives a decorator. Applying it to a function returns a wrapped
    # version that records one span each time it runs. The lambdas fix the inject_failure
    # flag, because every agent is later called with the state alone. researcher_node has
    # no flag, so it is wrapped as it is.
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
        # The same agents without monitoring: plain functions, so no spans are made.
        _researcher = researcher_node
        _retriever = lambda s: retriever_node(s, inject_failure=inject_failures)
        _verifier = lambda s: verifier_node(s, inject_failure=inject_failures)
        _analyst = lambda s: analyst_node(s, inject_failure=inject_failures)
        _writer = lambda s: writer_node(s, inject_failure=inject_failures)

    # Execute pipeline
    # (display name, function) pairs, in the order they run.
    agents = [
        ("Researcher", _researcher),
        ("Retriever", _retriever),
        ("Verifier", _verifier),
        ("Analyst", _analyst),
        ("Writer", _writer),
    ]

    # For each agent: run it on the current state, then merge the dict it returns into the
    # state with state.update(). Later agents therefore see earlier results, and also the
    # two trace keys the monitor adds, which keep all five spans in one trace. If an agent
    # raises an error, log it, store the message in state["errors"], and go on to the next.
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

# The entry point: read the flags, set up monitoring, then run the pipeline --runs times.
async def main():
    # Step 1: define and read the command-line flags.
    parser = argparse.ArgumentParser(description="AgentPulse Demo: AI Research Assistant")
    parser.add_argument("--query", default="transformer architecture advances",
                        help="Research query")
    parser.add_argument("--inject-failures", action="store_true",
                        help="Enable controlled failure injection")
    parser.add_argument("--endpoint", default="http://localhost:8000",
                        help="AgentPulse backend URL")
    # The default key is the placeholder value that .env.example uses, not a real secret.
    parser.add_argument("--api-key", default="change-me-to-a-secure-key",
                        help="AgentPulse API key")
    parser.add_argument("--no-monitor", action="store_true",
                        help="Run without AgentPulse monitoring")
    parser.add_argument("--runs", type=int, default=1,
                        help="Number of pipeline runs (for drift testing)")
    args = parser.parse_args()

    # Step 2: unless --no-monitor was given, make the AgentPulse client. pipeline_id is the
    # label for this whole pipeline. capture_inputs / capture_outputs = True let the monitor
    # decorator keep each span's input and output as JSON text (cut to a maximum length).
    # start() starts the SDK's background sender, which ships the spans.
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

    # Step 3: run the pipeline --runs times (run counts from 0).
    try:
        for run in range(args.runs):
            if args.runs > 1:
                logger.info("\n═══ Run %d/%d ═══", run + 1, args.runs)

            # Vary injection for drift testing
            # With several runs, every run after the first 70% turns failures on. For
            # example, with --runs 10 the runs numbered 8 and 9 (counting from 0, the last
            # two) inject; the log shows them as Run 9/10 and Run 10/10.
            inject = args.inject_failures
            if args.runs > 1 and run > args.runs * 0.7:
                inject = True  # Start injecting failures in later runs

            state = await run_pipeline(
                query=args.query,
                inject_failures=inject,
                pulse=pulse,
            )

            # Show the first 500 characters of the report, if the writer produced one.
            if "report" in state:
                logger.info("\n%s", state["report"][:500])

            if args.runs > 1:
                await asyncio.sleep(0.5)  # Space out runs

    finally:
        # Always flush: shutdown() sends any spans still waiting in memory and then stops
        # the sender. Without it the program could exit before the last spans are sent.
        if pulse:
            await pulse.shutdown()

    logger.info("\nDemo complete. Check the AgentPulse dashboard at %s", args.endpoint)


# Run main() when the file is run as a script (not when it is imported).
if __name__ == "__main__":
    asyncio.run(main())
