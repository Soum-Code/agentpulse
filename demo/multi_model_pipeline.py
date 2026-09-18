"""A five-agent pipeline where every agent runs on a different model.

This is the thing the deck's limits slide says does not exist yet: agent text
produced by real models rather than written as fixtures. Every other part of
AgentPulse was already real -- the evaluator, the queue, the alert rules, the
drift maths -- and was being fed strings from ingest.py. This feeds it output
that a model actually generated.

Five families, one per agent, through OpenRouter's free tier. Different families
matter: the disagreement signal compares two agents inside one trace, and two
prompts against the same model tend to agree with themselves, which makes the
signal look better than it is.

    researcher   plans the sub-questions
    retriever    calls the real local index, then narrates what it found
    verifier     checks the retrieved evidence against the question
    analyst      synthesises an answer from the evidence
    writer       turns the synthesis into a short report

What each signal gets out of it:

    grounding      analyst and writer carry the retrieved text as their input
                   and their own prose as output, which is the exact pair
                   evaluate_grounding compares
    tool_claim     the retriever's span carries the index's real result next to
                   the model's description of it. If the model miscounts, the
                   mismatch is real rather than planted
    disagreement   verifier and analyst answer the same question on different
                   models, in one trace
    drift          run it repeatedly with varying queries; a sustained value
                   needs 32 evaluated spans for one agent

Usage:

    export OPENROUTER_API_KEY=...          # from openrouter.ai/keys
    export AGENTPULSE_ENDPOINT=http://localhost:8000
    export AGENTPULSE_API_KEY=...
    python demo/multi_model_pipeline.py --query "retrieval augmented generation"

Nothing here is free of cost in wall-clock terms: five sequential calls to a
free tier take a while, and free models are rate limited. --models lets you cut
it down while testing.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
from demo.workflows.retrieval import local_retriever

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# One family each. Checked against openrouter.ai/api/v1/models -- every one of
# these reported zero for both prompt and completion pricing. Free models get
# deprecated without much warning, so --models exists for when one disappears.
AGENT_MODELS: dict[str, str] = {
    "researcher": "qwen/qwen3.8-27b:free",
    "retriever": "deepseek/deepseek-v4-flash-0731:free",
    "verifier": "z-ai/glm-5.2:free",
    "analyst": "nvidia/nemotron-3.5-lightning:free",
    "writer": "liquid/lfm-2.5-2.6b:free",
}

AGENT_ROLES: dict[str, str] = {
    "researcher": "Query Planner",
    "retriever": "Evidence Retriever",
    "verifier": "Claim Verifier",
    "analyst": "Synthesis Engine",
    "writer": "Report Author",
}


def build_client(api_key: str) -> Any:
    from openai import OpenAI

    return OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)


def ask(client: Any, model: str, prompt: str, *, max_tokens: int = 320) -> tuple[str, int, int]:
    """One completion, returned with its token counts.

    Deliberately not wrapped in instrument_llm. That records the call but not
    the tool result the retriever's span has to carry, and mixing the two would
    emit a second span for every call. Here each agent gets exactly one span,
    built explicitly below.
    """
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    text = (response.choices[0].message.content or "").strip()
    usage = getattr(response, "usage", None)
    return (
        text,
        getattr(usage, "prompt_tokens", None) or 0,
        getattr(usage, "completion_tokens", None) or 0,
    )


def run_once(pulse: AgentPulse, client: Any, query: str, models: dict[str, str]) -> str:
    trace = pulse.create_trace(pipeline_id="multi_model_research")
    print(f"\ntrace {trace.trace_id}\n" + "-" * 68)

    def call(agent: str, prompt: str, *, source: str | None = None, **span_kwargs: Any) -> str:
        model = models[agent]
        span = pulse.start_span(
            agent_id=agent,
            trace_context=trace,
            agent_role=AGENT_ROLES[agent],
            span_kind=SpanKind.LLM,
            model=model,
            # The grounding evaluator reads input_summary as the source it
            # checks output_summary against. For the agents that reason over
            # retrieved text, that has to be the evidence -- not the prompt
            # template wrapped around it.
            input_summary=source if source is not None else prompt,
            **span_kwargs,
        )
        started = time.perf_counter()
        try:
            text, tin, tout = ask(client, model, prompt)
        except Exception as exc:
            span.output_summary = None
            span.error_message = f"{type(exc).__name__}: {exc}"
            pulse.end_span(span, status=SpanStatus.ERROR)
            print(f"  {agent:<11} {model:<42} FAILED  {exc}")
            raise
        span.output_summary = text
        span.tokens_in, span.tokens_out = tin, tout
        pulse.end_span(span)
        elapsed = time.perf_counter() - started
        print(f"  {agent:<11} {model:<42} {elapsed:5.1f}s  {tout:>4} tok")
        print(f"      {text[:150]}{'...' if len(text) > 150 else ''}")
        return text

    plan = call(
        "researcher",
        f"You are planning a literature review on: {query}\n"
        "List three specific sub-questions worth answering. Be brief.",
    )

    # The real tool. Whatever the index returns is what the retriever's claim
    # gets compared against.
    docs = local_retriever.search(query, top_k=3)
    evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
    tool_result = f"Found {len(docs)} documents: " + "; ".join(d.title for d in docs)
    print(f"  {'[tool]':<11} local_retriever                            -> {len(docs)} docs")

    call(
        "retriever",
        f"A search for '{query}' returned these documents:\n\n{evidence}\n\n"
        "Write one sentence describing what you retrieved. State how many "
        "documents you are using, in the form 'Retrieved N documents'.",
        source=evidence,
        tool_name="local_retriever",
        tool_args=query,
        tool_result_summary=tool_result,
    )

    call(
        "verifier",
        f"Question: {query}\n\nEvidence:\n{evidence}\n\n"
        "Does the evidence answer the question? Answer in two sentences.",
        source=evidence,
    )

    synthesis = call(
        "analyst",
        f"Question: {query}\n\nEvidence:\n{evidence}\n\n"
        "Synthesise what the evidence supports. Three sentences, no speculation.",
        source=evidence,
    )

    call(
        "writer",
        f"Turn this synthesis into a short report paragraph:\n\n{synthesis}",
        source=evidence,
    )

    return trace.trace_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="retrieval augmented generation")
    parser.add_argument("--runs", type=int, default=1, help="repeat, for the drift signal")
    parser.add_argument(
        "--models",
        help="override as agent=model,agent=model; unnamed agents keep their default",
    )
    args = parser.parse_args()

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print(
            "OPENROUTER_API_KEY is not set.\n"
            "Create a key at https://openrouter.ai/keys and put it in the "
            "environment, or in a .env this script is run with. Do not paste it "
            "into a chat window or commit it.",
            file=sys.stderr,
        )
        return 2

    models = dict(AGENT_MODELS)
    if args.models:
        for pair in args.models.split(","):
            agent, _, model = pair.partition("=")
            if agent.strip() not in models:
                print(f"unknown agent {agent!r}; known: {', '.join(models)}", file=sys.stderr)
                return 2
            models[agent.strip()] = model.strip()

    pulse = AgentPulse(
        endpoint=os.getenv("AGENTPULSE_ENDPOINT", "http://localhost:8000"),
        api_key=os.getenv("AGENTPULSE_API_KEY"),
        service_name="multi_model_demo",
        capture_inputs=True,
        capture_outputs=True,
    )
    client = build_client(api_key)

    print(f"endpoint  {pulse.config.endpoint}")
    print("models    " + ", ".join(f"{a}={m}" for a, m in models.items()))

    traces = []
    for i in range(args.runs):
        if args.runs > 1:
            print(f"\n=== run {i + 1} of {args.runs} ===")
        try:
            traces.append(run_once(pulse, client, args.query, models))
        except Exception:
            return 1

    # shutdown drains the buffer. Without it the process can exit with spans
    # still batched in memory, which is the transport working as designed --
    # it never blocks the caller -- and looks like the run silently did nothing.
    pulse.shutdown()
    print(f"\nsent {len(traces)} trace(s). Evaluation runs in the worker; "
          "give it a moment, then look at Incidents.")
    for t in traces:
        print(f"  {t}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
