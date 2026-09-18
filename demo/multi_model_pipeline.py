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

With no account at all, --provider pollinations needs no key. Its anonymous
tier serves one model, so every agent runs it: enough to prove the pipeline
end to end against real generated text, not enough for a disagreement number.

Nothing here is free of cost in wall-clock terms: five sequential calls to a
free tier take a while, and free models are rate limited. --models lets you cut
it down while testing.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import traceback
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Real model prose is not ASCII. This one emits U+2011 (non-breaking hyphen) in
# ordinary words like "Retrieval-augmented", and a Windows console is cp1252, so
# echoing a completion raises UnicodeEncodeError and kills the run. Only the
# console preview is affected -- spans go out as JSON over HTTP and carry the
# original text -- so replacing unmappable characters here loses nothing that
# matters. A stub client never surfaces this, because fixtures are ASCII.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
from demo.workflows.retrieval import local_retriever

# The usage note above has always said the key can live "in a .env this script
# is run with". Nothing in the import chain loaded one, so that was only true
# if the caller had already exported it. Load the project .env here and make
# the sentence true. Real environment variables still win, which is what you
# want when overriding a committed default for one run.
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)
except ImportError:  # python-dotenv is not an SDK dependency; export instead
    pass

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Any OpenAI-compatible gateway works, because that is all the SDK needs: the
# provider detection behind instrument_llm keys on the client's module root,
# not on the host it points at. Named here so --provider can select one without
# the caller having to remember a URL.
#
# pollinations is keyless and needs no account, which makes it the honest smoke
# test when there is no key yet -- but its anonymous tier serves exactly ONE
# model. Every agent then runs the same model, and the disagreement signal
# becomes meaningless by construction (see the module docstring on why
# different families matter). Use it to prove the pipeline, not to report a
# disagreement number.
PROVIDERS: dict[str, str] = {
    "openrouter": OPENROUTER_BASE_URL,
    "pollinations": "https://text.pollinations.ai/openai",
    # NVIDIA's NIM catalogue. One signup at build.nvidia.com for an nvapi- key,
    # and its /v1/models lists 82 models across 21 owners -- meta, mistralai,
    # google, microsoft, deepseek-ai, z-ai and others. That breadth is the
    # reason to bother: OpenRouter's free tier yielded six families that
    # actually served, and the verifier-diversity question needs more than one.
    #
    # Expect rate limits rather than a token budget. OmniRoute's own catalogue
    # excludes nvidia from its free-tier token table as "rate-limit-only, no
    # published token cap", which is a fair description. As always, listed is
    # not served: send one real request before planning around any of them.
    "nvidia": "https://integrate.api.nvidia.com/v1",
}

# Which environment variable carries each provider's key.
PROVIDER_KEY_ENV: dict[str, str] = {
    "openrouter": "OPENROUTER_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
}

# Providers that serve without any credential. The openai client still requires
# a non-empty api_key string, so one is supplied; it is never checked.
KEYLESS_PROVIDERS = {"pollinations"}

POLLINATIONS_MODEL = "openai-fast"

# One family each, and every one of these was sent a real request rather than
# just read out of the catalogue. That distinction is the whole point: the
# previous set was picked by checking that all five existed at zero pricing,
# and by the time it was first run three of the five no longer produced text --
# qwen and z-ai returned provider errors, and liquid returned HTTP 200 with
# empty content, which a status-code check would have recorded as a success.
#
# Expect this to rot again. --models overrides any of them, and the check that
# matters is whether content comes back non-empty, not whether the call 200s.
AGENT_MODELS: dict[str, str] = {
    "researcher": "nvidia/nemotron-3.5-lightning:free",
    "retriever": "deepseek/deepseek-v4-flash-0731:free",
    "verifier": "nex-agi/nex-n2.5-pro:free",
    "analyst": "poolside/laguna-s-2.1:free",
    "writer": "inclusionai/ling-3.0-flash-vl:free",
}

# Defaults for --provider nvidia. Five owners, chosen from its /v1/models for
# family spread rather than size. NOT yet sent a real request -- listed is not
# served, and 23.6 and 24.7 are both about exactly that gap. Verify before
# quoting any run that uses these, and use --models to swap any that fail.
NVIDIA_AGENT_MODELS: dict[str, str] = {
    "researcher": "microsoft/phi-3.5-moe-instruct",
    "retriever": "deepseek-ai/deepseek-v4-flash-0731",
    "verifier": "mistralai/mistral-7b-instruct-v0.3",
    "analyst": "z-ai/glm-5.3",
    "writer": "moonshotai/kimi-k2.6",
}

AGENT_ROLES: dict[str, str] = {
    "researcher": "Query Planner",
    "retriever": "Evidence Retriever",
    "verifier": "Claim Verifier",
    "analyst": "Synthesis Engine",
    "writer": "Report Author",
}


def build_client(api_key: str, base_url: str = OPENROUTER_BASE_URL) -> Any:
    from openai import OpenAI

    return OpenAI(base_url=base_url, api_key=api_key)


class EmptyCompletion(RuntimeError):
    """A 200 that carried no text.

    Worth its own type because it is not an error anywhere in the stack: the
    provider returns a well-formed response with content "", and a caller that
    checks status codes records a success and hands an empty string to the
    evaluator. Three of the free models behave this way; see AGENT_MODELS.
    """


def ask(
    client: Any,
    model: str,
    prompt: str,
    *,
    max_tokens: int = 320,
    retries: int = 4,
) -> tuple[str, int, int]:
    """One completion, returned with its token counts.

    Deliberately not wrapped in instrument_llm. That records the call but not
    the tool result the retriever's span has to carry, and mixing the two would
    emit a second span for every call. Here each agent gets exactly one span,
    built explicitly below.

    Retries on 429. The free pools are shared across every OpenRouter user, so
    a rate limit here says nothing about this pipeline and everything about who
    else is calling the same model. Without this a batch of runs loses roughly
    one agent per run to a transient upstream limit, which is not a result.
    """
    delay = 5.0
    for attempt in range(retries + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
        except Exception as exc:
            transient = "429" in str(exc) or "rate" in str(exc).lower()
            if not transient or attempt == retries:
                raise
            print(f"      (429 on {model}, retry {attempt + 1}/{retries} in {delay:.0f}s)")
            time.sleep(delay)
            delay *= 2
            continue

        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise EmptyCompletion(
                f"{model} returned HTTP 200 with empty content -- the model is "
                "listed and reachable but produces no text"
            )
        usage = getattr(response, "usage", None)
        return (
            text,
            getattr(usage, "prompt_tokens", None) or 0,
            getattr(usage, "completion_tokens", None) or 0,
        )
    raise RuntimeError("unreachable")


async def run_once(pulse: AgentPulse, client: Any, query: str, models: dict[str, str]) -> str:
    trace = pulse.create_trace(pipeline_id="multi_model_research")
    print(f"\ntrace {trace.trace_id}\n" + "-" * 68)

    async def call(agent: str, prompt: str, *, source: str | None = None, **span_kwargs: Any) -> str:
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
            # to_thread rather than a bare call: the openai client is blocking,
            # and holding the event loop for the whole completion would stop
            # the transport's flush task running between agents. Spans would
            # then all sit in memory until shutdown instead of going out as
            # they are produced.
            text, tin, tout = await asyncio.to_thread(ask, client, model, prompt)
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

    plan = await call(
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

    await call(
        "retriever",
        f"A search for '{query}' returned these documents:\n\n{evidence}\n\n"
        "Write one sentence describing what you retrieved. State how many "
        "documents you are using, in the form 'Retrieved N documents'.",
        source=evidence,
        tool_name="local_retriever",
        tool_args=query,
        tool_result_summary=tool_result,
    )

    await call(
        "verifier",
        f"Question: {query}\n\nEvidence:\n{evidence}\n\n"
        "Does the evidence answer the question? Answer in two sentences.",
        source=evidence,
    )

    synthesis = await call(
        "analyst",
        f"Question: {query}\n\nEvidence:\n{evidence}\n\n"
        "Synthesise what the evidence supports. Three sentences, no speculation.",
        source=evidence,
    )

    await call(
        "writer",
        f"Turn this synthesis into a short report paragraph:\n\n{synthesis}",
        source=evidence,
    )

    return trace.trace_id


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="retrieval augmented generation")
    parser.add_argument("--runs", type=int, default=1, help="repeat, for the drift signal")
    parser.add_argument(
        "--models",
        help="override as agent=model,agent=model; unnamed agents keep their default",
    )
    parser.add_argument(
        "--provider",
        choices=sorted(PROVIDERS),
        default="openrouter",
        help="which OpenAI-compatible gateway to call (default: openrouter)",
    )
    args = parser.parse_args()

    base_url = PROVIDERS[args.provider]

    if args.provider in KEYLESS_PROVIDERS:
        api_key = "keyless"
    else:
        env_var = PROVIDER_KEY_ENV[args.provider]
        api_key = os.getenv(env_var)
        if not api_key:
            where = {
                "openrouter": "https://openrouter.ai/keys",
                "nvidia": "https://build.nvidia.com (account menu -> API keys)",
            }[args.provider]
            print(
                f"{env_var} is not set.\n"
                f"Create a key at {where} and put it in the environment, or in a "
                ".env this script is run with. Do not paste it into a chat window "
                "or commit it.\n"
                "\n"
                "To run without any account, use --provider pollinations. That "
                "serves one model, so it proves the pipeline but cannot produce a "
                "meaningful disagreement score.",
                file=sys.stderr,
            )
            return 2

    models = dict(NVIDIA_AGENT_MODELS if args.provider == "nvidia" else AGENT_MODELS)
    if args.provider == "pollinations":
        # One model is all the anonymous tier offers, so every agent gets it.
        models = {agent: POLLINATIONS_MODEL for agent in models}
    if args.models:
        for pair in args.models.split(","):
            agent, _, model = pair.partition("=")
            if agent.strip() not in models:
                print(f"unknown agent {agent!r}; known: {', '.join(models)}", file=sys.stderr)
                return 2
            models[agent.strip()] = model.strip()

    if len(set(models.values())) == 1:
        print(
            f"NOTE: all five agents are running {next(iter(set(models.values())))}. "
            "Grounding and tool-claim stay valid; the disagreement signal does "
            "not, because it compares two agents that share a model.",
            file=sys.stderr,
        )

    pulse = AgentPulse(
        endpoint=os.getenv("AGENTPULSE_ENDPOINT", "http://localhost:8000"),
        api_key=os.getenv("AGENTPULSE_API_KEY"),
        service_name="multi_model_demo",
        capture_inputs=True,
        capture_outputs=True,
    )
    client = build_client(api_key, base_url)

    print(f"endpoint  {pulse.config.endpoint}")
    print(f"provider  {args.provider} ({base_url})")
    print("models    " + ", ".join(f"{a}={m}" for a, m in models.items()))

    # start() is not optional here. The SDK auto-starts its transport only when
    # there is already a running event loop (client._ensure_transport), so a
    # synchronous script never starts it at all: end_span still enqueues, the
    # flush task never exists, and every span dies in memory at exit. The run
    # prints five happy agent lines and delivers nothing.
    await pulse.start()

    traces = []
    try:
        for i in range(args.runs):
            if args.runs > 1:
                print(f"\n=== run {i + 1} of {args.runs} ===")
            try:
                traces.append(await run_once(pulse, client, args.query, models))
            except Exception as exc:
                # Swallowing this printed exit code 1 and nothing else, which
                # sent a real UnicodeEncodeError back as an unexplained failure.
                # A demo that cannot say why it stopped is worse than one that
                # crashes.
                traceback.print_exc()
                print(f"\nrun failed: {type(exc).__name__}: {exc}", file=sys.stderr)
                return 1
    finally:
        # shutdown drains the buffer. Without it the process can exit with spans
        # still batched in memory, which is the transport working as designed --
        # it never blocks the caller -- and looks like the run silently did
        # nothing. It is a coroutine: calling it without await is the same as
        # not calling it.
        await pulse.shutdown()
    print(f"\nsent {len(traces)} trace(s). Evaluation runs in the worker; "
          "give it a moment, then look at Incidents.")
    for t in traces:
        print(f"  {t}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
