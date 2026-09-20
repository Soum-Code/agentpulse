"""RAG chatbot backend for the dashboard's RAG Live Monitor.

Answers one question: is AgentPulse actually monitoring a live conversation, or
does it only look like it is?

That is not "are its scores correct" -- no dashboard can tell you that, and
Section 24 is a long record of this project believing otherwise. This answers
the narrower question, which is still unanswered and has been "no" more often
than yes:

    the multi-model pipeline delivered zero spans for months while printing a
    successful run (24.1)
    tool-claim scored zero across 1,328 evaluations and nobody noticed (18.4)
    drift has never had enough traffic to produce a sustained value -- it needs
    32 spans for one agent, and every script so far sends five

Drift is the reason this exists. It came out of Section 25 as the most robust of
the four signals and is the one with no production data behind it. Thirty
messages here takes about ten minutes.

Three agents, because one would not exercise anything:

    retriever   searches the local corpus and reports what it found
    verifier    judges whether that evidence answers the question
    answerer    writes the reply from the evidence

Each becomes a span in one trace per turn. The answerer carries the retrieved
text as input_summary and its own reply as output_summary, which is the exact
pair evaluate_grounding compares.

The corpus is six documents, and that is the point: ask something it covers and
the evidence should support the answer, ask anything else and it cannot. A score
here is interpretable only because of that, which is why this is not wired to
the open internet.

Contract matches dashboard/src/lib/ragTypes.ts exactly.

    POST /chat    {message, session_id} -> ChatResponse
    GET  /corpus  -> {documents: [...]}

An error still returns 200 with `error` and whatever `agents` completed, because
a turn that died at the verifier is exactly the kind of thing this is for.

Usage:

    export NVIDIA_API_KEY=...
    export AGENTPULSE_ENDPOINT=http://127.0.0.1:8000
    export AGENTPULSE_API_KEY=change-me-to-a-secure-key
    python -m uvicorn demo.chatbot.app:app --port 8100

Needs the AgentPulse backend AND worker running. Without the worker, spans are
accepted and queued but never evaluated -- which is itself worth seeing once.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "sdk" / "src"))
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=False)
except ImportError:
    pass

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
from demo.workflows.retrieval import local_retriever

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# Verified callable on a free key by the scan in 24.8: the catalogue lists 82
# models and nine answer. Three owners, so the agents are not one model talking
# to itself.
# Chosen for latency and reliability, re-measured rather than assumed. On this
# free tier the same model's response time moves by an order of magnitude
# between runs: mistral-nemotron was 56s, then over 75s, then 26.9s within an
# hour; deepseek was 4.4s, then 7.5s, then 30.8s. google/gemma-4-31b-it answered
# the 24.8 scan and now hangs indefinitely, and z-ai/glm-5.3-flash has joined
# it. That volatility matters here because the three calls are sequential, so a
# turn costs their sum.
#
# Two of these share the nvidia family, which would be wrong for the
# disagreement signal -- two prompts against one family agree with themselves.
# It is acceptable for drift, which is a per-agent signal over time and never
# compares one agent against another.
AGENT_MODELS = {
    "retriever": "nvidia/nemotron-3-super-120b-a12b",
    "verifier": "meta/muse-glimmer-30b",
    "answerer": "nvidia/nemotron-3.5-lightning-30b-a3b",
}

# A hung provider must fail the turn, not stall it. Without this a model that
# stops responding takes the request with it and the UI shows a spinner
# forever, which looks like the app being slow rather than the model being
# gone.
REQUEST_TIMEOUT_S = 75.0

# Four of the nine callable models spend completion tokens on a hidden
# reasoning field before answering; deepseek burned 2,569 characters of it on
# "what is a database index?". At a smaller budget content comes back empty with
# finish_reason "length", which reads exactly like a broken model.
MAX_TOKENS = 1200

TURN_HISTORY = 4

# The dashboard dev server. The frontend calls this service on an absolute URL
# rather than through vite's proxy, so the browser needs the origin allowed.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
]


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class EmptyCompletion(RuntimeError):
    """A 200 carrying no text. Not an error anywhere in the HTTP stack."""


state: dict[str, Any] = {"pulse": None, "client": None, "sessions": {}}


@asynccontextmanager
async def lifespan(_: FastAPI):
    pulse = AgentPulse(
        endpoint=os.getenv("AGENTPULSE_ENDPOINT", "http://127.0.0.1:8000"),
        api_key=os.getenv("AGENTPULSE_API_KEY"),
        service_name="rag_chatbot",
        capture_inputs=True,
        capture_outputs=True,
    )
    # Not optional. The SDK auto-starts its transport only when a loop is
    # already running, so a caller that never awaits start() enqueues spans into
    # a buffer with no flush task and delivers nothing, while printing a
    # perfectly successful run (24.1).
    await pulse.start()
    state["pulse"] = pulse

    key = os.getenv("NVIDIA_API_KEY")
    if key:
        from openai import OpenAI

        state["client"] = OpenAI(base_url=NVIDIA_BASE_URL, api_key=key)
    else:
        print("NVIDIA_API_KEY is not set; /chat will return an error.", file=sys.stderr)

    try:
        yield
    finally:
        await pulse.shutdown()


app = FastAPI(title="AgentPulse RAG chatbot", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def ask(model: str, prompt: str, *, retries: int = 3) -> str:
    """One completion. Retries 429, and refuses to return an empty string.

    The free pools are shared, so a rate limit says nothing about this app and
    everything about who else is calling that model this minute.
    """
    client = state["client"]
    if client is None:
        raise RuntimeError("NVIDIA_API_KEY is not set")
    delay = 4.0
    for attempt in range(retries + 1):
        try:
            r = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=MAX_TOKENS,
                timeout=REQUEST_TIMEOUT_S,
            )
        except Exception as exc:
            transient = "429" in str(exc) or "rate" in str(exc).lower()
            if not transient or attempt == retries:
                raise
            time.sleep(delay)
            delay *= 2
            continue
        choice = r.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            reasoning = len(getattr(choice.message, "reasoning_content", None) or "")
            raise EmptyCompletion(
                f"{model} returned 200 with no content "
                f"({reasoning} chars of hidden reasoning, "
                f"finish_reason={choice.finish_reason})"
            )
        return text
    raise RuntimeError("unreachable")


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    pulse: AgentPulse = state["pulse"]
    session_id = req.session_id or uuid.uuid4().hex[:12]
    history: list[dict[str, str]] = state["sessions"].setdefault(session_id, [])

    trace = pulse.create_trace(pipeline_id="rag_chatbot")
    agents: list[dict[str, Any]] = []

    async def run(agent: str, prompt: str, *, source: str, **span_kwargs: Any) -> str:
        model = AGENT_MODELS[agent]
        span = pulse.start_span(
            agent_id=agent,
            trace_context=trace,
            agent_role=agent,
            span_kind=SpanKind.LLM,
            model=model,
            # evaluate_grounding reads input_summary as the source it checks
            # output_summary against, so for agents reasoning over retrieved
            # text this has to be the evidence -- not the prompt template
            # wrapped around it.
            input_summary=source,
            **span_kwargs,
        )
        started = time.perf_counter()
        try:
            text = await asyncio.to_thread(ask, model, prompt)
        except Exception as exc:
            span.output_summary = None
            span.error_message = f"{type(exc).__name__}: {exc}"
            pulse.end_span(span, status=SpanStatus.ERROR)
            raise
        span.output_summary = text
        pulse.end_span(span)
        agents.append({
            "agent": agent,
            "model": model,
            "output": text,
            "latency_ms": round((time.perf_counter() - started) * 1000),
        })
        return text

    docs = local_retriever.search(req.message, top_k=3)
    evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
    titles = [d.title for d in docs]

    try:
        await run(
            "retriever",
            f"A search for '{req.message}' returned these documents:\n\n{evidence}\n\n"
            "Describe in one sentence what was retrieved.",
            source=evidence,
            tool_name="local_retriever",
            tool_args=req.message,
            tool_result_summary=f"Found {len(docs)} documents: " + "; ".join(titles),
        )

        verdict = await run(
            "verifier",
            f"Question: {req.message}\n\nEvidence:\n{evidence}\n\n"
            "Does this evidence answer the question? Begin with Yes or No, then "
            "one sentence of explanation.",
            source=evidence,
        )

        prior = "\n".join(
            f"{t['role']}: {t['text']}" for t in history[-TURN_HISTORY * 2:]
        )
        reply = await run(
            "answerer",
            (f"Earlier conversation:\n{prior}\n\n" if prior else "")
            + f"Question: {req.message}\n\nEvidence:\n{evidence}\n\n"
            "Answer using only what the evidence supports. If it does not "
            "support an answer, say so plainly. Three sentences at most.",
            source=evidence,
        )
    except Exception as exc:
        # 200 with an error body, per the frontend contract: it reads `error`
        # and `agents` off the payload so a turn that died partway still shows
        # which agents ran. The trace_id is real -- those spans were sent.
        return {
            "session_id": session_id,
            "trace_id": trace.trace_id,
            "error": f"{type(exc).__name__}: {exc}",
            "agents": agents,
            "retrieved": titles,
        }

    history.append({"role": "user", "text": req.message})
    history.append({"role": "assistant", "text": reply})

    return {
        "session_id": session_id,
        "trace_id": trace.trace_id,
        "reply": reply,
        "verifier_verdict": verdict,
        "retrieved": titles,
        "agents": agents,
    }


@app.get("/corpus")
async def corpus() -> dict[str, Any]:
    """The six documents the bot can answer from.

    Exposed because it is the whole basis for reading a score here: ask about
    something in this list and the evidence should support the answer, ask about
    anything else and it cannot.
    """
    # `corpus`, not `documents` -- the first guess returned an empty list and
    # the endpoint answered 200 with {"documents": []}, which the frontend would
    # have shown as "no corpus" rather than as a bug.
    docs = getattr(local_retriever, "corpus", None) or []
    return {
        "documents": [
            d.get("title", str(d)) if isinstance(d, dict) else getattr(d, "title", str(d))
            for d in docs
        ]
    }
