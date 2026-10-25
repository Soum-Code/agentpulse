"""A real RAG chat service: three agents, every call instrumented, safe to put on the internet.

Serves the contract the dashboard's RAG chat view speaks. Every path also answers under
/chat, which is the prefix Caddy sends to this service on the public site:

    GET  /chat/corpus  (/corpus)   -> {"documents": [titles the retriever can return]}
    GET  /chat/health  (/health)   -> loading / ready / paused / failed, the provider chain
                                      and the limits; 200 only when ready
    POST /chat                     -> {"message", "session_id"} answered by three agents in
                                      turn, as one JSON object
    POST /chat/stream              -> the same turn as newline-delimited JSON events, one per
                                      stage as it finishes (see run_turn below)

    retriever   searches the real local index, then describes what it found
    verifier    checks whether that evidence answers the question
    answerer    writes the reply from the evidence and nothing else

That is three LLM calls a turn. The retriever's call is not decoration: the sentence the
model writes about the search is what AgentPulse's tool-claim check compares with the
index's real result (it travels on the same span), so without it the live chat would show
no tool-claim signal at all.

Each call goes to the provider chain in demo/chat_providers.py (Groq, Cerebras, NVIDIA,
Pollinations, OpenRouter, failing over in that order), and each agent reports which provider
and model answered. Before a turn runs, demo/chat_guard.py checks the kill switch, the
question's length and the per-IP and site-wide limits.

Nothing here is simulated. If no provider answers, the turn ends with an error that says so
and lists the agents that did run and the trace id, so the failed span can be found in
AgentPulse; no reply is invented. Errors never carry a stack trace or a provider's response
body, and nothing is logged with the question's text or any key.

Every agent gets exactly one span, built explicitly, for the same reason
multi_model_pipeline.py does it that way: the retriever's span has to carry the index's real
result next to the model's description of it, and wrapping the client as well would emit a
second span per call. The span records the model that answered, and its metadata the
provider and every failed attempt before it.

The retriever is deliberately NOT told what phrasing to use. multi_model_pipeline dictates
"Retrieved N documents", which is exactly what the tool-claim extractor matches, so its
tool-claim result describes the prompt rather than the model (SESSION_HANDOFF.md 25.3). Here
the model words the sentence itself, and the tool-claim signal gets whatever it actually wrote.

Conversations are stateless: each message is answered from a fresh retrieval. session_id is
echoed back and nothing else keys on it.

Usage:

    export AGENTPULSE_ENDPOINT=http://localhost:8000
    export AGENTPULSE_API_KEY=...
    export GROQ_API_KEY=...                # optional; with no key at all, Pollinations answers
    python -m uvicorn demo.chat_server:app --port 8100

Environment (see chat_providers.py and chat_guard.py for theirs):

    CHAT_TURN_BUDGET_SECONDS      the most one turn may take, all agents together. Default 120:
                                  a turn answered by Pollinations alone takes about 90 s
                                  (three replies, 32 s apart)
    CHAT_MAX_TOKENS_<AGENT>       the answer's token limit, AGENT in RETRIEVER, VERIFIER,
                                  ANSWERER. Defaults 200, 250, 500; on the gpt-oss models it
                                  includes their (low) reasoning
    CHAT_CORS_ORIGINS             comma-separated origins allowed to call from a browser on
                                  another origin; default is any localhost port. The public
                                  site calls same-origin through Caddy and needs none
"""

# ABOUT THIS FILE
# ---------------
# This is a small web service (built with FastAPI) that answers a question with three LLM
# "agents" run one after another: a retriever, a verifier, an answerer. RAG = retrieval-
# augmented generation: look up documents first, then answer from them. Each agent call is
# recorded as one "span" (one recorded step of an agent) and sent to AgentPulse, so AgentPulse
# can score text that real models actually wrote.
#
# HOW IT FITS IN
# The dashboard's chat page (dashboard/src/lib/ragApi.ts) calls this service: same-origin
# /chat on the public site, port 8100 locally. It searches with demo/workflows/retrieval.py,
# sends model calls through demo/chat_providers.py, applies demo/chat_guard.py's limits, and
# sends spans through the AgentPulse SDK (sdk/src/agentpulse). deploy/azure runs it as the
# `chat` compose service. tests/test_chat_server.py tests it.

from __future__ import annotations

# asyncio.to_thread (used below) runs a blocking call in a worker thread.
import asyncio
import json
import logging
import os
import sys
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Optional

# Make two folders importable without installing anything: the SDK source (so that
# "import agentpulse" works) and the repo root (so that "import demo.xxx" works).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# FastAPI = the web framework. CORSMiddleware lets a web page on another address (the
# dashboard in local development) call this API. pydantic checks a request body's shape.
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# AgentPulse = the SDK client that sends spans. SpanKind and SpanStatus are labels
# for a span (here: an LLM call, and whether it succeeded).
from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
from demo.chat_guard import (
    GuardSettings,
    Refusal,
    TurnLimiter,
    check_message,
    check_pause,
    clean_session_id,
    client_ip,
)
from demo.chat_providers import ChainExhausted, ProviderChain
# local_retriever = the ready-made search index over a small set of local documents.
from demo.workflows.retrieval import ensure_embedding_model, local_retriever

logger = logging.getLogger("agentpulse.chat")

# The three agents, in the order they run for every question.
AGENTS = ("retriever", "verifier", "answerer")

# A readable job title for each agent. It is sent on each span as agent_role.
AGENT_ROLES = {
    "retriever": "Evidence Retriever",
    "verifier": "Claim Verifier",
    "answerer": "Answer Synthesizer",
}

# The answer's token limit per agent. The retriever writes one sentence and the verifier two;
# the answerer needs room. On the gpt-oss models the limit includes their reasoning, kept low.
DEFAULT_MAX_TOKENS = {"retriever": 200, "verifier": 250, "answerer": 500}

# How many documents the search returns for each question.
TOP_K = 3

# CORS = the browser rule about which web pages may call this API. In words, this
# pattern allows http or https pages on localhost or 127.0.0.1, with any port or none.
DEFAULT_CORS_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

# Shown while the embedding model loads after a start (a minute or so on the VM).
LOADING_MESSAGE = "The chat is starting up. Try again in a minute."
FAILED_MESSAGE = "The chat cannot search its documents right now, so it is not answering."


# The JSON body of POST /chat and /chat/stream. The length rule a visitor sees is
# CHAT_MAX_INPUT_CHARS, checked in chat_guard with a readable message; max_length here only
# stops a body far past any setting before it is looked at.
class ChatRequest(BaseModel):
    message: str = Field(max_length=20_000)
    session_id: Optional[str] = Field(default=None, max_length=200)


# What a turn has produced so far, kept so a failure can report it.
@dataclass
class TurnState:
    trace_id: str = ""
    agents: list[dict[str, Any]] = field(default_factory=list)
    retrieved: list[str] = field(default_factory=list)


# Raised when no provider answered one agent's step. It remembers which agent, and the
# chain's own error (which attempts were made, and whether time ran out).
class AgentFailure(RuntimeError):
    def __init__(self, agent: str, cause: ChainExhausted):
        super().__init__(f"{agent}: {cause}")
        self.agent = agent
        self.cause = cause


# In short: a number from the environment, or the default when it is unset or not a number.
def _env_float(env: dict[str, str], name: str, default: float) -> float:
    try:
        return float(env.get(name) or default)
    except ValueError:
        return default


# In short: what the visitor reads when an agent's step fails, by the chain's reason: one short
# sentence and a code the page switches on. Never the provider's own error text.
def _failure(exc: AgentFailure, budget: float) -> tuple[int, str, str]:
    if exc.cause.out_of_time:
        return 504, "budget_exceeded", (
            f"The {exc.agent} step ran out of time (a turn may take at most {budget:.0f} s). "
            "Try again in a minute."
        )
    if exc.cause.all_rate_limited:
        return 503, "providers_busy", "All model providers are busy right now. Try again in a minute."
    return 502, "provider_failed", (
        f"No model provider could answer the {exc.agent} step right now. Try again in a minute."
    )


# In short: a streamed turn's response, which frees the turn's concurrency slot when it is over.
# The slot is freed here, around the whole response, rather than in the body's generator: if
# the visitor disconnects before the first line is sent, the generator never starts and its
# finally would never run, and the slot would stay taken for good.
class _TurnStream(StreamingResponse):
    def __init__(self, *args: Any, release: Callable[[], None], **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._release = release

    # Starlette calls this to send the response; finally runs however it ends: finished,
    # failed, or cut off by the visitor.
    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self._release()


# In short: a refused turn as JSON, with Retry-After when the refusal says when to try again.
# agents is always present (empty) so the page reads every error body the same way.
def _refusal_response(refusal: Refusal, session_id: Optional[str] = None) -> JSONResponse:
    body = refusal.as_dict()
    if session_id:
        body["session_id"] = session_id
    body["agents"] = []
    headers = {"Retry-After": str(refusal.retry_after)} if refusal.retry_after else None
    return JSONResponse(status_code=refusal.status, content=body, headers=headers)


# The loader the service uses: MiniLM alone, then the index built with it. It raises if the
# index still came out of stand-in vectors, because then every search would be near-random.
def load_retrieval() -> None:
    ensure_embedding_model(embedding_only=True)
    local_retriever.build_index()
    if not local_retriever._index_is_real:
        raise RuntimeError("the document index was built from stand-in vectors")


def create_app(
    chain: Optional[ProviderChain] = None,
    guard: Optional[GuardSettings] = None,
    pulse: Optional[AgentPulse] = None,
    loader: Optional[Callable[[], None]] = None,
    env: Optional[dict[str, str]] = None,
    load_in_background: bool = True,
) -> FastAPI:
    """Build the app. Everything can be injected; tests do.

    loader prepares retrieval (by default load_retrieval). With load_in_background the server
    starts at once and answers "loading" until it is done; tests pass False so the first
    request finds it finished.
    """
    env = dict(os.environ) if env is None else env
    chain = chain or ProviderChain.from_env(env)
    guard = guard or GuardSettings.from_env(env)
    limiter = TurnLimiter(guard)
    loader = loader or load_retrieval
    budget = _env_float(env, "CHAT_TURN_BUDGET_SECONDS", 120.0)
    max_tokens = {
        agent: int(_env_float(env, f"CHAT_MAX_TOKENS_{agent.upper()}", default))
        for agent, default in DEFAULT_MAX_TOKENS.items()
    }
    # "loading" until the loader returns, then "ready", or "failed" if it raised.
    retrieval = {"state": "loading"}

    # owns_pulse is True when we create the AgentPulse client here. Then we also start
    # and stop it ourselves; a client passed in by the caller is the caller's to manage.
    owns_pulse = pulse is None
    if pulse is None:
        pulse = AgentPulse(
            endpoint=env.get("AGENTPULSE_ENDPOINT") or "http://localhost:8000",
            api_key=env.get("AGENTPULSE_API_KEY") or None,
            service_name="rag_chat",
            capture_inputs=True,
            capture_outputs=True,
        )

    # In short: get ready to answer, in a thread so the server can say "loading" meanwhile:
    # build the provider clients (the openai import is slow), then load MiniLM and the index.
    async def load() -> None:
        try:
            await asyncio.to_thread(chain.prepare)
            await asyncio.to_thread(loader)
            retrieval["state"] = "ready"
            logger.info("chat: retrieval ready; providers: %s", ", ".join(chain.providers()) or "none")
        except Exception as exc:  # noqa: BLE001 - reported on /health, the service stays up
            retrieval["state"] = "failed"
            logger.error("chat: retrieval failed to load: %s", type(exc).__name__)

    # FastAPI runs this around the life of the app: the code before "yield" runs at start-up,
    # the code after it at shutdown. It starts the embedding model loading (in the background,
    # so /health can say "loading"), and starts and stops the SDK's background sender, but only
    # if we created the client.
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s %(message)s")
        logger.setLevel(logging.INFO)
        task = None
        if load_in_background:
            task = asyncio.create_task(load())
        else:
            await load()
        if owns_pulse:
            await pulse.start()
        yield
        if task is not None and not task.done():
            task.cancel()
        if owns_pulse:
            # Drains the buffer; without it the last turn's spans can be lost.
            await pulse.shutdown()

    app = FastAPI(title="AgentPulse RAG chat", lifespan=lifespan, docs_url=None, redoc_url=None)

    # Which web pages may call this API from a browser on another origin. If
    # CHAT_CORS_ORIGINS is set, only those origins (a comma-separated list); if not, any
    # localhost page, using DEFAULT_CORS_REGEX. The public site calls same-origin, through
    # Caddy, so CORS does not come into it there.
    origins = env.get("CHAT_CORS_ORIGINS")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins.split(",") if o.strip()] if origins else [],
        allow_origin_regex=None if origins else DEFAULT_CORS_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    # Anything that escapes a handler: a plain message, never the traceback. The log gets the
    # exception's type and where it was raised, not its text, which could quote the question.
    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        frame = traceback.extract_tb(exc.__traceback__)[-1] if exc.__traceback__ else None
        where = f" at {os.path.basename(frame.filename)}:{frame.lineno}" if frame else ""
        logger.error("chat: unhandled %s%s", type(exc).__name__, where)
        return JSONResponse(
            status_code=500,
            content={"code": "internal", "error": "Something went wrong on the server.", "agents": []},
        )

    # In short: whether a turn would run right now, and if not the sentence that says why.
    # The kill switch comes first, so a paused chat says "paused" even while it is loading.
    def status_now() -> tuple[str, Optional[str]]:
        pause = check_pause(guard)
        if pause:
            return "paused", pause.message
        if retrieval["state"] == "loading":
            return "loading", LOADING_MESSAGE
        if retrieval["state"] == "failed":
            return "failed", FAILED_MESSAGE
        if not chain.routes:
            return "failed", "No model provider is configured, so the chat is not answering."
        return "ready", None

    # GET /corpus: the titles of every document the retriever can return.
    @app.get("/corpus")
    @app.get("/chat/corpus")
    def corpus() -> dict[str, list[str]]:
        return {"documents": [doc["title"] for doc in local_retriever.corpus]}

    # GET /health: whether a turn would run now, and if not why; each provider's state
    # (configured or not, last success, last failure as an outcome and a status, never a key,
    # a URL or an error body); the limits a visitor is held to; and today's usage. 200 only
    # when ready, so a probe can tell the states apart. "degraded" is true while a configured
    # provider's last call failed, so an uptime monitor can catch a broken key or model id
    # while the chain still answers through the providers after it.
    @app.get("/health")
    @app.get("/chat/health")
    def health() -> JSONResponse:
        state, message = status_now()
        providers = chain.provider_status()
        degraded = any(
            p["configured"]
            and p["last_error"]
            and (not p["last_success"] or p["last_error"]["at"] > p["last_success"])
            for p in providers
        )
        body: dict[str, Any] = {
            "status": state,
            "degraded": degraded,
            "embedding": retrieval["state"],
            "providers": providers,
            "chain": [{"provider": r.provider, "model": r.model} for r in chain.routes],
            "agents": list(AGENTS),
            "limits": {
                "ip_turns_per_minute": guard.ip_per_minute,
                "ip_turns_per_day": guard.ip_per_day,
                "daily_turn_cap": guard.daily_cap,
                "max_input_chars": guard.max_input_chars,
                "turn_budget_seconds": budget,
            },
            "usage": limiter.usage(),
        }
        if message:
            body["message"] = message
        return JSONResponse(status_code=200 if state == "ready" else 503, content=body)

    # The checks before a turn may spend anything, in this order: paused, not ready, a bad
    # question, then the limits (so a refused question costs the visitor nothing). Out: the
    # cleaned session id, or the response that refuses the turn. A turn that is admitted
    # holds a concurrency slot until limiter.finish().
    def admit(request: Request, body: ChatRequest) -> tuple[str, Optional[JSONResponse]]:
        session_id = clean_session_id(body.session_id, lambda: "sess_" + uuid.uuid4().hex[:10])
        state, message = status_now()
        if state == "paused":
            return session_id, _refusal_response(check_pause(guard), session_id)
        if state != "ready":
            return session_id, _refusal_response(
                Refusal(503, "loading" if state == "loading" else "unavailable", message, 30),
                session_id,
            )
        refusal = check_message(body.message, guard)
        if refusal is None:
            ip = client_ip(
                request.client.host if request.client else None,
                request.headers.get("x-forwarded-for"),
                guard.trusted_proxies,
            )
            refusal = limiter.admit(ip)
        return session_id, (_refusal_response(refusal, session_id) if refusal else None)

    # Answer one question with the three agents, as a stream of events. Each is a dict with a
    # "type":
    #   start        session_id, trace_id, the agents that will run, the turn's time budget
    #   retrieved    the titles the search returned, and how long it took (search_ms)
    #   agent_start  agent
    #   agent_done   agent, provider, model, output, latency_ms, attempts
    #   done         the whole turn, the same object POST /chat answers with
    #   error        code, error, and the turn so far (agents that finished, trace_id)
    # A turn always ends with exactly one done or error event.
    async def run_turn(message: str, session_id: str) -> AsyncIterator[dict[str, Any]]:
        state = TurnState()
        started = time.monotonic()
        deadline = started + budget

        # In short: milliseconds since the turn started, for total_ms and the logs.
        def elapsed_ms() -> int:
            return round((time.monotonic() - started) * 1000)

        # A trace for the turn. The three spans share its id. It is reported at once, so even a
        # failed turn tells the caller which trace to look at.
        trace = pulse.create_trace(pipeline_id="rag_chat")
        state.trace_id = trace.trace_id
        yield {
            "type": "start",
            "session_id": session_id,
            "trace_id": trace.trace_id,
            "agents": list(AGENTS),
            "turn_budget_seconds": budget,
        }

        # call() runs ONE agent: open a span, ask the chain, close the span.
        #   agent        which agent this is
        #   prompt       the full text sent to the model
        #   source       text to record as the span's input instead of the prompt
        #   span_kwargs  extra span fields, for example tool_name / tool_result_summary
        # Returns the agent's entry for the response. Raises AgentFailure if no provider
        # answered; the span is then closed as an ERROR that lists the attempts.
        async def call(agent: str, prompt: str, *, source: str, **span_kwargs: Any) -> dict[str, Any]:
            span = pulse.start_span(
                agent_id=agent,
                trace_context=trace,
                agent_role=AGENT_ROLES[agent],
                span_kind=SpanKind.LLM,
                # The grounding evaluator checks output_summary against input_summary, so for
                # agents reasoning over retrieved text that must be the evidence, not the
                # prompt wrapped around it.
                input_summary=source,
                **span_kwargs,
            )
            agent_started = time.monotonic()
            try:
                result = await chain.complete(prompt, max_tokens=max_tokens[agent], deadline=deadline)
            except ChainExhausted as exc:
                span.output_summary = None
                span.error_message = f"ChainExhausted: {exc}"
                span.metadata = {"attempts": [a.as_dict() for a in exc.attempts]}
                pulse.end_span(span, status=SpanStatus.ERROR)
                raise AgentFailure(agent, exc) from exc
            except asyncio.CancelledError:
                # The visitor went away mid-call. The span still ends, so AgentPulse shows
                # where the turn stopped rather than a step that never finished.
                span.error_message = "cancelled: the client disconnected"
                pulse.end_span(span, status=SpanStatus.ERROR)
                raise
            # Success: the model that answered, its text and token counts go on the span,
            # the provider and any failed attempts before it in its metadata.
            attempts = [a.as_dict() for a in result.attempts]
            span.model = result.model
            span.output_summary = result.text
            span.tokens_in, span.tokens_out = result.tokens_in, result.tokens_out
            span.metadata = {"provider": result.provider, "attempts": attempts}
            pulse.end_span(span)
            entry = {
                "agent": agent,
                "provider": result.provider,
                "model": result.model,
                "output": result.text,
                "latency_ms": round((time.monotonic() - agent_started) * 1000),
                "attempts": attempts,
            }
            state.agents.append(entry)
            return entry

        try:
            # Step 1: the real search, run in a thread because it takes CPU time. It compares
            # the question with each document using embeddings (lists of numbers that stand
            # for meaning); see demo/workflows/retrieval.py.
            search_started = time.monotonic()
            docs = await asyncio.to_thread(local_retriever.search, message, TOP_K)
            search_ms = round((time.monotonic() - search_started) * 1000)
            state.retrieved = [d.title for d in docs]
            yield {"type": "retrieved", "retrieved": state.retrieved, "search_ms": search_ms}
            # evidence = the found documents as "title: text" blocks, one blank line apart.
            evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
            # tool_result = what the search really returned (count and titles). It travels on
            # the retriever's span, next to the model's own description of the search.
            tool_result = f"Found {len(docs)} documents: " + "; ".join(state.retrieved)

            stages = [
                # Step 2: the retriever agent describes what was found. Its span also carries
                # the tool name, the query and the real tool result.
                (
                    "retriever",
                    f"A search for '{message}' returned these documents:\n\n{evidence}\n\n"
                    "Write one sentence describing what you retrieved.",
                    {"tool_name": "local_retriever", "tool_args": message, "tool_result_summary": tool_result},
                ),
                # Step 3: the verifier says whether the evidence answers the question.
                (
                    "verifier",
                    f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
                    "Does the evidence answer the question? Answer in two sentences.",
                    {},
                ),
                # Step 4: the answerer writes the reply, told to use only the evidence.
                (
                    "answerer",
                    f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
                    "Answer the question using only the evidence. If the evidence does "
                    "not cover it, say so instead of guessing.",
                    {},
                ),
            ]
            # All three pass source=evidence, so the grounding check compares each reply with
            # the documents.
            for agent, prompt, span_kwargs in stages:
                yield {"type": "agent_start", "agent": agent}
                entry = await call(agent, prompt, source=evidence, **span_kwargs)
                yield {"type": "agent_done", **entry}
        except AgentFailure as exc:
            status, code, text = _failure(exc, budget)
            logger.warning("chat: turn failed at %s (%s) after %d ms", exc.agent, code, elapsed_ms())
            yield {
                "type": "error",
                "status": status,
                "code": code,
                "error": text,
                "session_id": session_id,
                "trace_id": state.trace_id,
                "agents": state.agents,
                "retrieved": state.retrieved,
                "total_ms": elapsed_ms(),
            }
            return
        except Exception as exc:  # noqa: BLE001 - the stream must still end with one event
            logger.error("chat: turn failed with %s after %d ms", type(exc).__name__, elapsed_ms())
            yield {
                "type": "error",
                "status": 500,
                "code": "internal",
                "error": "Something went wrong on the server.",
                "session_id": session_id,
                "trace_id": state.trace_id,
                "agents": state.agents,
                "retrieved": state.retrieved,
                "total_ms": elapsed_ms(),
            }
            return

        by_agent = {a["agent"]: a for a in state.agents}
        total_ms = elapsed_ms()
        logger.info(
            "chat: turn ok in %d ms (%s)",
            total_ms,
            ", ".join(f"{a['agent']}={a['provider']}" for a in state.agents),
        )
        yield {
            "type": "done",
            "session_id": session_id,
            "trace_id": state.trace_id,
            "reply": by_agent["answerer"]["output"],
            "verifier_verdict": by_agent["verifier"]["output"],
            "retrieved": state.retrieved,
            "agents": state.agents,
            "search_ms": search_ms,
            "total_ms": total_ms,
        }

    # POST /chat: the whole turn as one JSON object. It answers
    #   200  the reply, the verifier's verdict, the titles found, each agent's output, model,
    #        provider and time, and the turn's total time
    #   400  the question is empty or too long          429  a limit was reached (Retry-After)
    #   503  paused, starting up, or every provider is at its limit
    #   502  no provider answered a step                504  the turn ran out of time
    # A failed turn's body still lists the agents that did run, and the trace id.
    @app.post("/chat")
    async def chat(request: Request, body: ChatRequest) -> JSONResponse:
        session_id, refused = admit(request, body)
        if refused:
            return refused
        final: dict[str, Any] = {}
        try:
            async for event in run_turn(body.message, session_id):
                final = event
        finally:
            limiter.finish()
        status = final.pop("status", 200) if final.get("type") == "error" else 200
        final.pop("type", None)
        return JSONResponse(status_code=status, content=final)

    # POST /chat/stream: the same turn, one JSON object per line as each stage finishes, so
    # the page can show progress. Refusals happen before the stream starts, with the same
    # status codes and bodies as /chat; once it starts it is a 200 and a failure arrives as
    # an "error" event.
    @app.post("/chat/stream")
    async def chat_stream(request: Request, body: ChatRequest):
        session_id, refused = admit(request, body)
        if refused:
            return refused

        # In short: the stream writer. Each event becomes one JSON line, sent as soon as it is
        # produced. "status" is dropped: on a stream the HTTP status is already 200.
        async def lines() -> AsyncIterator[str]:
            async for event in run_turn(body.message, session_id):
                event.pop("status", None)
                yield json.dumps(event) + "\n"

        return _TurnStream(
            lines(),
            release=limiter.finish,
            media_type="application/x-ndjson",
            # no-transform and X-Accel-Buffering ask proxies on the way not to hold the lines
            # back; Caddy is told the same in the Caddyfile.
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    return app


# Built when this module is imported, so "uvicorn demo.chat_server:app" can find it. Importing
# reads the environment; an unknown name in CHAT_PROVIDERS or a CHAT_TRUSTED_PROXIES entry
# that is not an address raises ValueError right here, before the server starts.
app = create_app()
