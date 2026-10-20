"""A real RAG chat service: three agents, three models, every call instrumented.

Serves the contract the dashboard's RAG chat view already speaks:

    GET  /corpus   -> {"documents": [titles the retriever can return]}
    GET  /health   -> provider, models and whether a key is configured
    POST /chat     -> {"message", "session_id"} answered by three agents in turn

    retriever   searches the real local index, then describes what it found
    verifier    checks whether that evidence answers the question
    answerer    writes the reply from the evidence and nothing else

Nothing here is simulated. If no model credential is configured, /chat answers
503 and names the variable to set -- it does not invent a reply. If a model
fails or returns an empty completion, /chat answers 502 with the agents that did
run and the trace id, so the failed span can be found in AgentPulse.

Every agent gets exactly one span, built explicitly, for the same reason
multi_model_pipeline.py does it that way: the retriever's span has to carry the
index's real result next to the model's description of it, and wrapping the
client as well would emit a second span per call.

The retriever is deliberately NOT told what phrasing to use. multi_model_pipeline
dictates "Retrieved N documents", which is exactly what the tool-claim extractor
matches, so its tool-claim result describes the prompt rather than the model
(SESSION_HANDOFF.md 25.3). Here the model words the sentence itself, and the
tool-claim signal gets whatever it actually wrote.

Conversations are stateless: each message is answered from a fresh retrieval.
session_id is echoed back and nothing else keys on it.

Usage:

    export NVIDIA_API_KEY=nvapi-...        # or OPENROUTER_API_KEY, see below
    export AGENTPULSE_ENDPOINT=http://localhost:8000
    export AGENTPULSE_API_KEY=...
    uvicorn demo.chat_server:app --port 8100

Environment:

    CHAT_PROVIDER          nvidia | openrouter | pollinations. Default: the first
                           of nvidia/openrouter whose key is set, else nvidia
    CHAT_BASE_URL          point at any OpenAI-compatible endpoint instead of the
                           provider's own
    CHAT_MODEL_<AGENT>     override one agent's model, AGENT in RETRIEVER,
                           VERIFIER, ANSWERER
    CHAT_CORS_ORIGINS      comma-separated origins; default is any localhost port
"""

# ABOUT THIS FILE
# ---------------
# This is a small web service (built with FastAPI) that answers a question with
# three LLM "agents" run one after another: a retriever, a verifier, an answerer.
# RAG = retrieval-augmented generation: look up documents first, then answer from them.
# Each agent call is recorded as one "span" (one recorded step of an agent) and sent
# to AgentPulse, so AgentPulse can score text that real models actually wrote.
#
# HOW IT FITS IN
# The dashboard's chat page (dashboard/src/lib/ragApi.ts) calls this service on port
# 8100. It reuses the model tables and the ask()/build_client() helpers from
# multi_model_pipeline.py, searches with demo/workflows/retrieval.py, and sends spans
# through the AgentPulse SDK (sdk/src/agentpulse). tests/test_chat_server.py tests it.

from __future__ import annotations

# asyncio.to_thread (used below) runs a blocking call in a worker thread.
import asyncio
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

# Make two folders importable without installing anything: the SDK source (so that
# "import agentpulse" works) and the repo root (so that "import demo.xxx" works).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# FastAPI = the web framework. CORSMiddleware lets a web page on another address (the
# dashboard) call this API. pydantic checks that a request body has the right shape.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# AgentPulse = the SDK client that sends spans. SpanKind and SpanStatus are labels
# for a span (here: an LLM call, and whether it succeeded).
from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
# Reused from the pipeline demo: model tables, provider URLs, the client builder, and
# ask() (one model call that returns text and token counts).
from demo.multi_model_pipeline import (
    AGENT_MODELS,
    KEYLESS_PROVIDERS,
    NVIDIA_AGENT_MODELS,
    POLLINATIONS_MODEL,
    PROVIDER_KEY_ENV,
    PROVIDERS,
    build_client,
    ask,
)
# local_retriever = the ready-made search index over a small set of local documents.
from demo.workflows.retrieval import local_retriever

# The three agents, in the order they run for every question.
AGENTS = ("retriever", "verifier", "answerer")

# A readable job title for each agent. It is sent on each span as agent_role.
AGENT_ROLES = {
    "retriever": "Evidence Retriever",
    "verifier": "Claim Verifier",
    "answerer": "Answer Synthesizer",
}

# The pipeline names its third reasoning agent "analyst"; the chat calls the same
# job "answerer", and the dashboard looks agents up by that name.
_PIPELINE_AGENT = {"retriever": "retriever", "verifier": "verifier", "answerer": "analyst"}

# How many documents the search returns for each question.
TOP_K = 3

# CORS = the browser rule about which web pages may call this API. In words, this
# pattern allows http or https pages on localhost or 127.0.0.1, with any port or none.
DEFAULT_CORS_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


# The JSON body of POST /chat. message must be 1 to 4000 characters long; session_id is
# optional. FastAPI rejects a body that breaks these rules before our code runs.
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = None


# Which model provider to call, settled once at start-up from environment variables.
#   provider    a name such as "nvidia" (one of the keys of PROVIDERS)
#   models      agent name -> id of the model that agent uses
#   api_key     the secret read from the environment, or None
#   key_env     the name of the environment variable that holds the key (None if none)
#   base_url    web address of the OpenAI-style API to call (CHAT_BASE_URL, else the provider's)
@dataclass
class ChatConfig:
    provider: str
    models: dict[str, str]
    api_key: Optional[str]
    key_env: Optional[str]
    base_url: str = ""

    # True when no credential is missing: the provider needs no key, or a key was found.
    # It does not check that the key is valid.
    @property
    def key_configured(self) -> bool:
        return self.provider in KEYLESS_PROVIDERS or bool(self.api_key)


# Build a ChatConfig from environment variables. In: a dict to read from (tests pass
# one); by default the real os.environ. Out: the config. Raises ValueError if
# CHAT_PROVIDER names a provider we do not know.
def resolve_config(env: Optional[dict[str, str]] = None) -> ChatConfig:
    # With no dict passed in, take a plain copy of the real environment.
    env = dict(os.environ) if env is None else env

    # Step 1: pick the provider. CHAT_PROVIDER wins. If it is not set, use the first of
    # nvidia / openrouter whose key variable is set; if neither is, use nvidia.
    provider = env.get("CHAT_PROVIDER")
    if not provider:
        provider = next(
            (p for p in ("nvidia", "openrouter") if env.get(PROVIDER_KEY_ENV[p])),
            "nvidia",
        )
    # Stop early, and list the valid names, if the provider is not one we know.
    if provider not in PROVIDERS:
        raise ValueError(f"CHAT_PROVIDER={provider!r}; known: {', '.join(PROVIDERS)}")

    # Step 2: pick the default model table for that provider. Pollinations has only one
    # model, so every agent gets it (the NVIDIA table is used only to get the agent names).
    if provider == "nvidia":
        base = NVIDIA_AGENT_MODELS
    elif provider == "pollinations":
        base = {name: POLLINATIONS_MODEL for name in NVIDIA_AGENT_MODELS}
    else:
        base = AGENT_MODELS

    # Step 3: choose one model per chat agent. CHAT_MODEL_<AGENT> (for example
    # CHAT_MODEL_VERIFIER) wins; otherwise take the table's default for the matching
    # pipeline agent (see _PIPELINE_AGENT above for the name mapping).
    models = {
        agent: env.get(f"CHAT_MODEL_{agent.upper()}") or base[_PIPELINE_AGENT[agent]]
        for agent in AGENTS
    }
    # Step 4: find which variable holds the key and read it. Pollinations has no such
    # variable, so key_env and api_key stay None. CHAT_BASE_URL, if set, replaces the
    # provider's own web address.
    key_env = PROVIDER_KEY_ENV.get(provider)
    return ChatConfig(
        provider=provider,
        models=models,
        api_key=env.get(key_env) if key_env else None,
        key_env=key_env,
        base_url=env.get("CHAT_BASE_URL") or PROVIDERS[provider],
    )


@dataclass
class TurnState:
    """What a turn has produced so far, kept so a failure can report it."""

    # trace_id: the trace made for this turn (empty text until run_turn creates it).
    # agents: one entry for each agent that finished OK (name, model, output, latency).
    # retrieved: titles of the documents the search returned.
    trace_id: str
    agents: list[dict[str, Any]] = field(default_factory=list)
    retrieved: list[str] = field(default_factory=list)


# Raised when one agent's model call fails (an error, or an empty reply). It remembers
# which agent failed. The message holds the error type, agent, model and original message.
class AgentFailure(RuntimeError):
    def __init__(self, agent: str, model: str, exc: Exception):
        super().__init__(f"{type(exc).__name__}: {agent} ({model}): {exc}")
        self.agent = agent


def create_app(
    config: Optional[ChatConfig] = None,
    llm_client: Any = None,
    pulse: Optional[AgentPulse] = None,
) -> FastAPI:
    """Build the app. llm_client and pulse can be injected; tests do."""
    # Step 1: use the given config, or read one from the environment.
    config = config or resolve_config()
    # owns_pulse is True when we create the AgentPulse client here. Then we also start
    # and stop it ourselves; a client passed in by the caller is the caller's to manage.
    owns_pulse = pulse is None
    # Step 2: make the AgentPulse client. It sends spans to the backend API (address and
    # key from the environment). capture_inputs / capture_outputs = True are the SDK's
    # switches for keeping span text, used by @monitor and wrapped clients. The spans in
    # call() below get their text set by hand, so these two flags change nothing for them.
    if pulse is None:
        pulse = AgentPulse(
            endpoint=os.getenv("AGENTPULSE_ENDPOINT", "http://localhost:8000"),
            api_key=os.getenv("AGENTPULSE_API_KEY"),
            service_name="rag_chat",
            capture_inputs=True,
            capture_outputs=True,
        )

    # FastAPI runs this around the life of the app: the code before "yield" runs at
    # start-up, the code after it at shutdown. Here it starts and stops the SDK's
    # background sender, but only if we created the client.
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if owns_pulse:
            await pulse.start()
        yield
        if owns_pulse:
            # Drains the buffer; without it the last turn's spans can be lost.
            await pulse.shutdown()

    app = FastAPI(title="AgentPulse RAG chat", lifespan=lifespan)

    # Which web pages may call this API from a browser. If CHAT_CORS_ORIGINS is set, only
    # those origins (a comma-separated list) are allowed. If not, any localhost page is
    # allowed, using DEFAULT_CORS_REGEX. A page on another origin may only use GET or POST.
    origins = os.getenv("CHAT_CORS_ORIGINS")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins.split(",")] if origins else [],
        allow_origin_regex=None if origins else DEFAULT_CORS_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # The model client is created lazily, on the first real model call, so the server can
    # start without one. A client passed in (tests do) is used as it is. It lives in a
    # dict so the inner function below can fill it in without using "nonlocal".
    client_holder: dict[str, Any] = {"client": llm_client}

    # Return the shared model client, creating it the first time. "unused" is a stand-in
    # key for the case where there is none: the openai library wants a non-empty string.
    def get_client() -> Any:
        if client_holder["client"] is None:
            client_holder["client"] = build_client(
                config.api_key or "unused", config.base_url
            )
        return client_holder["client"]

    # GET /corpus: the titles of every document the retriever can return.
    @app.get("/corpus")
    def corpus() -> dict[str, list[str]]:
        return {"documents": [doc["title"] for doc in local_retriever.corpus]}

    # GET /health: which provider and models are set, and whether a key was found. It
    # shows the name of the key variable, never the key itself.
    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "provider": config.provider,
            "base_url": config.base_url,
            "models": config.models,
            "key_configured": config.key_configured,
            "key_env": config.key_env,
        }

    # Answer one question with the three agents. In: the user's message, and a TurnState
    # that is filled in as we go (so a failure can still report what already happened).
    # Out: (reply, verdict), the answerer's text and the verifier's text.
    # Raises AgentFailure if any model call fails.
    async def run_turn(message: str, state: TurnState) -> tuple[str, str]:
        # Step 1: start a trace. The three spans share its id. It is also saved in state,
        # so even a failed turn can tell the caller which trace to look at.
        trace = pulse.create_trace(pipeline_id="rag_chat")
        state.trace_id = trace.trace_id

        # call() runs ONE agent: open a span, ask the model, close the span.
        #   agent        which agent this is (a key of config.models)
        #   prompt       the full text sent to the model
        #   source       text to record as the span's input instead of the prompt
        #   span_kwargs  extra span fields, for example tool_name / tool_result_summary
        # Returns the model's text. Raises AgentFailure if the model call fails.
        async def call(
            agent: str, prompt: str, *, source: Optional[str] = None, **span_kwargs: Any
        ) -> str:
            model = config.models[agent]
            span = pulse.start_span(
                agent_id=agent,
                trace_context=trace,
                agent_role=AGENT_ROLES[agent],
                span_kind=SpanKind.LLM,
                model=model,
                # The grounding evaluator checks output_summary against
                # input_summary, so for agents reasoning over retrieved text
                # that must be the evidence, not the prompt wrapped around it.
                input_summary=source if source is not None else prompt,
                **span_kwargs,
            )
            started = time.perf_counter()
            try:
                # The model client blocks until the answer arrives. Running it in a worker
                # thread keeps the server free to handle other requests meanwhile.
                text, tin, tout = await asyncio.to_thread(ask, get_client(), model, prompt)
            except Exception as exc:
                # Close the span as an ERROR with the message, so the failed step can be
                # found in AgentPulse. Then re-raise as AgentFailure; /chat turns it into 502.
                span.output_summary = None
                span.error_message = f"{type(exc).__name__}: {exc}"
                pulse.end_span(span, status=SpanStatus.ERROR)
                raise AgentFailure(agent, model, exc) from exc
            # Success: put the text and token counts (in / out) on the span and send it.
            # Then remember this agent's result (with its time in milliseconds) for the reply.
            span.output_summary = text
            span.tokens_in, span.tokens_out = tin, tout
            pulse.end_span(span)
            state.agents.append(
                {
                    "agent": agent,
                    "model": model,
                    "output": text,
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                }
            )
            return text

        # Step 2: the real search, also run in a thread because it takes CPU time. It
        # compares the question with each document using embeddings (lists of numbers
        # that stand for meaning); see demo/workflows/retrieval.py.
        docs = await asyncio.to_thread(local_retriever.search, message, TOP_K)
        state.retrieved = [d.title for d in docs]
        # evidence = the found documents as "title: text" blocks, one blank line apart.
        evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
        # tool_result = what the search really returned (count and titles). It travels on
        # the retriever's span, next to the model's own description of the search.
        tool_result = f"Found {len(docs)} documents: " + "; ".join(state.retrieved)

        # Step 3: the retriever agent describes what was found. Its span also carries the
        # tool name, the query and the real tool result. All three calls below pass
        # source=evidence, so the grounding check compares each reply with the documents.
        await call(
            "retriever",
            f"A search for '{message}' returned these documents:\n\n{evidence}\n\n"
            "Write one sentence describing what you retrieved.",
            source=evidence,
            tool_name="local_retriever",
            tool_args=message,
            tool_result_summary=tool_result,
        )
        # Step 4: the verifier says whether the evidence answers the question.
        verdict = await call(
            "verifier",
            f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
            "Does the evidence answer the question? Answer in two sentences.",
            source=evidence,
        )
        # Step 5: the answerer writes the reply, told to use only the evidence.
        reply = await call(
            "answerer",
            f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
            "Answer the question using only the evidence. If the evidence does "
            "not cover it, say so instead of guessing.",
            source=evidence,
        )
        return reply, verdict

    # POST /chat: take a question, run the three agents, return the reply. It answers
    #   200  the reply, the verifier's verdict, the titles found, and each agent's output
    #   503  no model credential is configured (the message names the variable to set)
    #   502  a model call failed (the body lists the agents that did run, and the trace id)
    @app.post("/chat")
    async def chat(request: ChatRequest) -> JSONResponse:
        # Step 1: use the caller's session id, or make a short random one ("sess_" plus
        # ten hex characters). It is only echoed back; nothing else uses it.
        session_id = request.session_id or "sess_" + uuid.uuid4().hex[:10]

        # Step 2: with no credential, stop now and say which variable to set. Nothing is
        # invented in its place.
        if not config.key_configured:
            return JSONResponse(
                status_code=503,
                content={
                    "session_id": session_id,
                    "error": (
                        f"No credential for provider '{config.provider}'. "
                        f"Set {config.key_env} (or CHAT_PROVIDER to one you have a "
                        "key for) and restart the chat server."
                    ),
                    "agents": [],
                },
            )

        # Step 3: run the three agents. Only AgentFailure is caught here. The 502 body gives
        # the trace id and what had already finished, so the failed span can be found.
        state = TurnState(trace_id="")
        try:
            reply, verdict = await run_turn(request.message, state)
        except AgentFailure as exc:
            return JSONResponse(
                status_code=502,
                content={
                    "session_id": session_id,
                    "trace_id": state.trace_id,
                    "error": str(exc),
                    "agents": state.agents,
                    "retrieved": state.retrieved,
                },
            )

        # Step 4: everything worked, so answer 200 with the reply and the details.
        return JSONResponse(
            content={
                "session_id": session_id,
                "trace_id": state.trace_id,
                "reply": reply,
                "verifier_verdict": verdict,
                "retrieved": state.retrieved,
                "agents": state.agents,
            }
        )

    return app


# Built when this module is imported, so "uvicorn demo.chat_server:app" can find it.
# This means importing the module reads the environment; an unknown CHAT_PROVIDER
# raises ValueError right here.
app = create_app()
