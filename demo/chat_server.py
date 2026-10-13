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

from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanKind, SpanStatus
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
from demo.workflows.retrieval import local_retriever

AGENTS = ("retriever", "verifier", "answerer")

AGENT_ROLES = {
    "retriever": "Evidence Retriever",
    "verifier": "Claim Verifier",
    "answerer": "Answer Synthesizer",
}

# The pipeline names its third reasoning agent "analyst"; the chat calls the same
# job "answerer", and the dashboard looks agents up by that name.
_PIPELINE_AGENT = {"retriever": "retriever", "verifier": "verifier", "answerer": "analyst"}

TOP_K = 3

DEFAULT_CORS_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = None


@dataclass
class ChatConfig:
    provider: str
    models: dict[str, str]
    api_key: Optional[str]
    key_env: Optional[str]
    base_url: str = ""

    @property
    def key_configured(self) -> bool:
        return self.provider in KEYLESS_PROVIDERS or bool(self.api_key)


def resolve_config(env: Optional[dict[str, str]] = None) -> ChatConfig:
    env = dict(os.environ) if env is None else env

    provider = env.get("CHAT_PROVIDER")
    if not provider:
        provider = next(
            (p for p in ("nvidia", "openrouter") if env.get(PROVIDER_KEY_ENV[p])),
            "nvidia",
        )
    if provider not in PROVIDERS:
        raise ValueError(f"CHAT_PROVIDER={provider!r}; known: {', '.join(PROVIDERS)}")

    if provider == "nvidia":
        base = NVIDIA_AGENT_MODELS
    elif provider == "pollinations":
        base = {name: POLLINATIONS_MODEL for name in NVIDIA_AGENT_MODELS}
    else:
        base = AGENT_MODELS

    models = {
        agent: env.get(f"CHAT_MODEL_{agent.upper()}") or base[_PIPELINE_AGENT[agent]]
        for agent in AGENTS
    }
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

    trace_id: str
    agents: list[dict[str, Any]] = field(default_factory=list)
    retrieved: list[str] = field(default_factory=list)


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
    config = config or resolve_config()
    owns_pulse = pulse is None
    if pulse is None:
        pulse = AgentPulse(
            endpoint=os.getenv("AGENTPULSE_ENDPOINT", "http://localhost:8000"),
            api_key=os.getenv("AGENTPULSE_API_KEY"),
            service_name="rag_chat",
            capture_inputs=True,
            capture_outputs=True,
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if owns_pulse:
            await pulse.start()
        yield
        if owns_pulse:
            # Drains the buffer; without it the last turn's spans can be lost.
            await pulse.shutdown()

    app = FastAPI(title="AgentPulse RAG chat", lifespan=lifespan)

    origins = os.getenv("CHAT_CORS_ORIGINS")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins.split(",")] if origins else [],
        allow_origin_regex=None if origins else DEFAULT_CORS_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    client_holder: dict[str, Any] = {"client": llm_client}

    def get_client() -> Any:
        if client_holder["client"] is None:
            client_holder["client"] = build_client(
                config.api_key or "unused", config.base_url
            )
        return client_holder["client"]

    @app.get("/corpus")
    def corpus() -> dict[str, list[str]]:
        return {"documents": [doc["title"] for doc in local_retriever.corpus]}

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "provider": config.provider,
            "base_url": config.base_url,
            "models": config.models,
            "key_configured": config.key_configured,
            "key_env": config.key_env,
        }

    async def run_turn(message: str, state: TurnState) -> tuple[str, str]:
        trace = pulse.create_trace(pipeline_id="rag_chat")
        state.trace_id = trace.trace_id

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
                text, tin, tout = await asyncio.to_thread(ask, get_client(), model, prompt)
            except Exception as exc:
                span.output_summary = None
                span.error_message = f"{type(exc).__name__}: {exc}"
                pulse.end_span(span, status=SpanStatus.ERROR)
                raise AgentFailure(agent, model, exc) from exc
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

        docs = await asyncio.to_thread(local_retriever.search, message, TOP_K)
        state.retrieved = [d.title for d in docs]
        evidence = "\n\n".join(f"{d.title}: {d.content}" for d in docs)
        tool_result = f"Found {len(docs)} documents: " + "; ".join(state.retrieved)

        await call(
            "retriever",
            f"A search for '{message}' returned these documents:\n\n{evidence}\n\n"
            "Write one sentence describing what you retrieved.",
            source=evidence,
            tool_name="local_retriever",
            tool_args=message,
            tool_result_summary=tool_result,
        )
        verdict = await call(
            "verifier",
            f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
            "Does the evidence answer the question? Answer in two sentences.",
            source=evidence,
        )
        reply = await call(
            "answerer",
            f"Question: {message}\n\nEvidence:\n{evidence}\n\n"
            "Answer the question using only the evidence. If the evidence does "
            "not cover it, say so instead of guessing.",
            source=evidence,
        )
        return reply, verdict

    @app.post("/chat")
    async def chat(request: ChatRequest) -> JSONResponse:
        session_id = request.session_id or "sess_" + uuid.uuid4().hex[:10]

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


app = create_app()
