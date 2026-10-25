"""The provider chain behind the public chat: which model answers one agent step, and what
happens when a provider cannot.

Every agent step is one call to ProviderChain.complete(). It walks the chain in order and
returns the first non-empty answer:

    groq          openai/gpt-oss-20b, reasoning effort low        GROQ_API_KEY
    cerebras      gpt-oss-120b, then qwen-3.8-27b                  CEREBRAS_API_KEY
    nvidia        google/gemma-4-31b-it                            NVIDIA_API_KEY
    openrouter    google/gemma-4-31b-it:free                       OPENROUTER_API_KEY
    pollinations  openai-fast                                      (no key; always last)

A provider whose key variable is empty is left out. Pollinations needs no key and is always
the last route, whatever CHAT_PROVIDERS says, so the chain can never end without a provider
that is able to answer: with no key at all it is Pollinations alone. CHAT_PROVIDERS reorders
or shortens the keyed providers in front of it.

When a call fails the chain moves on to the next model. What it does first depends on why:

    429 or 402            rate limited. The model is paused for Retry-After seconds (or
                          CHAT_COOLDOWN_SECONDS when the provider sends none), and retried
                          once if that wait is short and fits in the turn
    5xx, connection error retried once after CHAT_RETRY_DELAY_SECONDS, then the next model
    timeout               the next model straight away: a second wait of the same length
                          would spend the turn on one provider
    401, 403, 404         the next model, and this one is paused for CHAT_COOLDOWN_SECONDS: a
                          wrong key or a model id that rotted does not get better by retrying
    empty completion      the next model (a 200 with no text is not an answer)

So each model is tried at most twice per step, and the whole turn has a deadline
(CHAT_TURN_BUDGET_SECONDS, enforced by the caller passing it in): every call's timeout is the
smaller of CHAT_CALL_TIMEOUT_SECONDS and what is left of the turn, and nothing starts once
less than a second is left. The chain can therefore never loop.

Free-tier limits change, so they are settings, not code. Per provider P (GROQ, CEREBRAS,
NVIDIA, POLLINATIONS, OPENROUTER):

    CHAT_<P>_BASE_URL               the OpenAI-compatible endpoint
    CHAT_<P>_MODELS                 comma-separated model ids, tried in order
    CHAT_<P>_RPM                    requests per minute this service sends to one model; 0 = no
                                    local limit
    CHAT_<P>_MIN_INTERVAL_SECONDS   least time between two requests to one model

A request that the local limits (or a Retry-After) say must wait waits only if the wait is at
most CHAT_MAX_QUEUE_WAIT_SECONDS and still leaves time in the turn; otherwise the model is
skipped. The defaults below are the published free-tier figures on 2026-10-25, cited next to
each one.
"""

# ABOUT THIS FILE
# ---------------
# Used by demo/chat_server.py. It holds no FastAPI code: build_chain() reads the environment
# into a list of Routes (one per provider and model), and ProviderChain.complete() runs one
# completion over them with the failover rules above. The model clients come from the openai
# library (imported only when a real client is built), so tests pass a stub client_factory
# instead and need no network and no openai package. tests/test_chat_providers.py tests it.

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

logger = logging.getLogger("agentpulse.chat")


# The published figures behind each default. Rate limits are per model on every provider
# that documents them.
#   groq        https://console.groq.com/docs/openai (base URL)
#               https://console.groq.com/docs/rate-limits: openai/gpt-oss-20b 30 RPM, 1K RPD,
#               8K TPM, 200K TPD
#               https://console.groq.com/docs/reasoning: reasoning_effort low|medium|high on
#               the gpt-oss models
#   cerebras    https://inference-docs.cerebras.ai/introduction (base URL)
#               https://inference-docs.cerebras.ai/models/overview: gpt-oss-120b and
#               qwen-3.8-27b are the two shared-inference models
#               https://inference-docs.cerebras.ai/support/rate-limits: free trial, both
#               models 5 RPM, 30K uncached TPM, 1M TPD
#               https://inference-docs.cerebras.ai/capabilities/reasoning: reasoning_effort
#               low|medium|high for gpt-oss-120b, "none" turns qwen-3.8-27b's thinking off
#   nvidia      https://integrate.api.nvidia.com/v1/models lists google/gemma-4-31b-it; the
#               free key's rate limit is not published, so there is no local cap
#   openrouter  https://openrouter.ai/docs/api-reference/limits: :free models 20 RPM, and 50
#               requests a day on an account with less than 10 credits bought
#   pollinations https://github.com/pollinations/pollinations/blob/master/APIDOCS.md:
#               anonymous text is one reply every 30 seconds per IP, refused with 402 and a
#               Retry-After header. Every visitor of the site shares the server's one IP.
#               32 s rather than 30 leaves a margin for the two clocks disagreeing.
# In short: one provider's defaults, any of which an environment variable can replace.
@dataclass(frozen=True)
class ProviderDefaults:
    base_url: str
    models: tuple[str, ...]
    key_env: Optional[str]
    rpm: int = 0
    min_interval: float = 0.0


PROVIDER_DEFAULTS: dict[str, ProviderDefaults] = {
    "groq": ProviderDefaults(
        "https://api.groq.com/openai/v1", ("openai/gpt-oss-20b",), "GROQ_API_KEY", rpm=30
    ),
    "cerebras": ProviderDefaults(
        "https://api.cerebras.ai/v1", ("gpt-oss-120b", "qwen-3.8-27b"), "CEREBRAS_API_KEY", rpm=5
    ),
    "nvidia": ProviderDefaults(
        "https://integrate.api.nvidia.com/v1", ("google/gemma-4-31b-it",), "NVIDIA_API_KEY"
    ),
    "openrouter": ProviderDefaults(
        "https://openrouter.ai/api/v1",
        ("google/gemma-4-31b-it:free",),
        "OPENROUTER_API_KEY",
        rpm=20,
    ),
    "pollinations": ProviderDefaults(
        "https://text.pollinations.ai/openai", ("openai-fast",), None, min_interval=32.0
    ),
}

# The keyless provider that ends every chain (see the top of this file).
KEYLESS_LAST = "pollinations"

DEFAULT_ORDER = ("groq", "cerebras", "nvidia", "openrouter", KEYLESS_LAST)


# One model on one provider: a place a completion can be sent. api_key is kept out of repr()
# so that printing a Route, or a traceback that shows one, never shows the key.
@dataclass
class Route:
    provider: str
    model: str
    base_url: str
    api_key: Optional[str] = field(default=None, repr=False)
    # Sent as extra request fields, for example {"reasoning_effort": "low"}.
    extra_body: dict[str, Any] = field(default_factory=dict)
    rpm: int = 0
    min_interval: float = 0.0

    # In short: "provider/model", the name the limits and the logs use for this route.
    @property
    def key(self) -> str:
        return f"{self.provider}/{self.model}"


# The extra request fields a model needs so it does not spend the answer's token budget on
# hidden reasoning. The gpt-oss models always reason; "low" is their smallest setting.
# qwen-3.8-27b on Cerebras can switch reasoning off. Pollinations' openai-fast is gpt-oss-20b
# (its responses say so) and accepts the same field. Nothing is sent to the others: an
# unknown field is a 400 on some providers.
def reasoning_fields(provider: str, model: str, effort: str) -> dict[str, Any]:
    if provider in ("groq", "cerebras", "pollinations") and (
        "gpt-oss" in model or model == "openai-fast"
    ):
        return {"reasoning_effort": effort}
    if provider == "cerebras" and model.startswith("qwen"):
        return {"reasoning_effort": "none"}
    return {}


# In short: a number from the environment, or the default when it is unset or not a number.
# A typo in a limit must not stop the service from starting.
def _env_float(env: dict[str, str], name: str, default: float) -> float:
    try:
        return float(env.get(name) or default)
    except ValueError:
        return default


def _env_int(env: dict[str, str], name: str, default: int) -> int:
    try:
        return int(env.get(name) or default)
    except ValueError:
        return default


# In short: read the chain from the environment. In: a dict to read (tests pass one), by
# default os.environ. Out: the Routes in the order they are tried. Raises ValueError for a
# provider name in CHAT_PROVIDERS that is not one of PROVIDER_DEFAULTS.
def build_chain(env: Optional[dict[str, str]] = None) -> list[Route]:
    env = dict(os.environ) if env is None else env
    names = [n.strip().lower() for n in (env.get("CHAT_PROVIDERS") or ",".join(DEFAULT_ORDER)).split(",")]
    names = [n for n in names if n]
    unknown = [n for n in names if n not in PROVIDER_DEFAULTS]
    if unknown:
        raise ValueError(f"CHAT_PROVIDERS names {unknown}; known: {', '.join(PROVIDER_DEFAULTS)}")
    # The keyless provider goes last, and is added if the list left it out, so that every
    # chain ends with a provider that needs no key and no account, so a missing or revoked
    # key can never leave the chain empty.
    names = [n for n in names if n != KEYLESS_LAST] + [KEYLESS_LAST]
    effort = env.get("CHAT_REASONING_EFFORT") or "low"

    routes: list[Route] = []
    for name in names:
        spec = PROVIDER_DEFAULTS[name]
        upper = name.upper()
        api_key = env.get(spec.key_env) if spec.key_env else None
        # A provider that needs a key and has none is not part of the chain at all.
        if spec.key_env and not api_key:
            continue
        models = [m.strip() for m in (env.get(f"CHAT_{upper}_MODELS") or ",".join(spec.models)).split(",")]
        for model in (m for m in models if m):
            routes.append(
                Route(
                    provider=name,
                    model=model,
                    base_url=env.get(f"CHAT_{upper}_BASE_URL") or spec.base_url,
                    api_key=api_key,
                    extra_body=reasoning_fields(name, model, effort),
                    rpm=_env_int(env, f"CHAT_{upper}_RPM", spec.rpm),
                    min_interval=_env_float(env, f"CHAT_{upper}_MIN_INTERVAL_SECONDS", spec.min_interval),
                )
            )
    return routes


class EmptyCompletion(RuntimeError):
    """A 200 with no text: the model ran out of tokens, or the provider returned nothing."""


# One try of one model, as reported in the chat response and on the agent's span. outcome is
# "ok" or why it failed or was skipped. Never holds the provider's error body: it can carry
# account details, and everything here is shown to visitors.
@dataclass
class Attempt:
    provider: str
    model: str
    outcome: str
    ms: int = 0
    status: Optional[int] = None
    # Time spent queueing for this provider's slot before the request went out (its free-tier
    # spacing, or another turn's request ahead of it). Part of the stage's time, not the call's.
    waited_ms: int = 0

    # In short: the attempt as JSON for the response, the stream and the span's metadata.
    # status and waited_ms are left out when there is nothing to say, to keep the lines short.
    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "provider": self.provider,
            "model": self.model,
            "outcome": self.outcome,
            "ms": self.ms,
        }
        if self.status is not None:
            out["status"] = self.status
        if self.waited_ms:
            out["waited_ms"] = self.waited_ms
        return out


@dataclass
class Completion:
    text: str
    tokens_in: int
    tokens_out: int
    provider: str
    model: str
    attempts: list[Attempt]


# Raised when no model in the chain answered. out_of_time is True when the turn's deadline,
# not the last provider, is what stopped it.
class ChainExhausted(RuntimeError):
    def __init__(self, attempts: list[Attempt], out_of_time: bool = False):
        self.attempts = attempts
        self.out_of_time = out_of_time
        tried = ", ".join(f"{a.provider}/{a.model}: {a.outcome}" for a in attempts) or "none"
        reason = "the turn ran out of time" if out_of_time else "no provider answered"
        super().__init__(f"{reason} (tried {tried})")

    # True when every model refused for its rate limit or was skipped as busy: nothing is
    # broken, the free quotas are used up for now, and the visitor should try again later.
    @property
    def all_rate_limited(self) -> bool:
        return bool(self.attempts) and all(
            a.outcome in ("rate_limited", "skipped_busy") for a in self.attempts
        )


# Why a call failed. Out: (outcome, HTTP status or None, Retry-After seconds or None).
# It goes by attribute and class name rather than by isinstance on openai's exception types,
# so the openai package is not needed to import this file, and a stub can raise anything with
# a status_code. Timeout is checked before connection error because openai's APITimeoutError
# is a subclass of its APIConnectionError.
def classify(exc: BaseException) -> tuple[str, Optional[int], Optional[float]]:
    name = type(exc).__name__
    if isinstance(exc, EmptyCompletion):
        return "empty", None, None
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or "Timeout" in name:
        return "timeout", None, None
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        if status in (402, 429):
            return "rate_limited", status, _retry_after(exc)
        if status >= 500:
            return "server_error", status, None
        return "http_error", status, None
    if isinstance(exc, (ConnectionError, OSError)) or "Connection" in name:
        return "connection_error", None, None
    return "error", None, None


# The Retry-After header of a refused response, in seconds, or None. Only the number-of-seconds
# form is read; the date form is rare on these APIs and None then means "use the default".
def _retry_after(exc: BaseException) -> Optional[float]:
    headers = getattr(getattr(exc, "response", None), "headers", None)
    if headers is None:
        return None
    try:
        value = headers.get("retry-after")
        return max(0.0, float(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


# Ask one model. Blocking (the openai client is), so ProviderChain runs it in a thread.
def _call(client: Any, route: Route, prompt: str, max_tokens: int, timeout: float) -> tuple[str, int, int]:
    kwargs: dict[str, Any] = {
        "model": route.model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "timeout": timeout,
    }
    if route.extra_body:
        kwargs["extra_body"] = route.extra_body
    response = client.chat.completions.create(**kwargs)
    choices = getattr(response, "choices", None) or []
    text = ((choices[0].message.content if choices else None) or "").strip()
    if not text:
        raise EmptyCompletion(f"{route.key} returned no text")
    usage = getattr(response, "usage", None)
    return (
        text,
        getattr(usage, "prompt_tokens", None) or 0,
        getattr(usage, "completion_tokens", None) or 0,
    )


# The real client: openai's, with its own retries off, because the chain decides when to
# retry. A provider with no key (Pollinations) still needs a non-empty string.
def openai_client(route: Route, timeout: float) -> Any:
    from openai import OpenAI

    return OpenAI(base_url=route.base_url, api_key=route.api_key or "keyless", max_retries=0, timeout=timeout)


class ProviderChain:
    """The routes, the failover rules, and what has been learned about each route's limits.

    All of its state is changed only from the event loop (the blocking call runs in a thread
    and returns before anything is recorded), so plain dicts are enough. A route with a
    min_interval also has an asyncio lock: its requests go out one at a time, because such a
    provider (Pollinations' anonymous tier) refuses a second request while one is running.
    """

    def __init__(
        self,
        routes: list[Route],
        *,
        call_timeout: float = 25.0,
        retry_delay: float = 1.0,
        cooldown: float = 60.0,
        max_queue_wait: float = 45.0,
        hang_grace: float = 2.0,
        client_factory: Optional[Callable[[Route, float], Any]] = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Any] = asyncio.sleep,
    ):
        self.routes = routes
        self.call_timeout = call_timeout
        self.retry_delay = retry_delay
        self.cooldown = cooldown
        self.max_queue_wait = max_queue_wait
        # How long past its own timeout a call may run before the turn stops waiting for it.
        self.hang_grace = hang_grace
        self._client_factory = client_factory or openai_client
        self._clock = clock
        self._sleep = sleep
        self._clients: dict[str, Any] = {}
        # Per route: the start times of the last minute's requests (for rpm), when the last
        # request ended (for min_interval), and the time before which it must not be called
        # at all (a Retry-After or a cooldown).
        self._starts: dict[str, deque[float]] = {r.key: deque() for r in routes}
        self._last_end: dict[str, float] = {}
        self._paused_until: dict[str, float] = {r.key: 0.0 for r in routes}
        self._locks: dict[str, asyncio.Lock] = {
            r.key: asyncio.Lock() for r in routes if r.min_interval > 0
        }
        # Per provider, for /health: when it last answered and how it last failed (UTC ISO
        # times, the outcome word and the HTTP status; never an error body).
        self._last_ok: dict[str, str] = {}
        self._last_error: dict[str, dict[str, Any]] = {}

    # In short: the chain with its settings read from the environment. Arguments passed in
    # (tests pass a stub client_factory and a fake clock) win over the environment.
    @classmethod
    def from_env(cls, env: Optional[dict[str, str]] = None, **kwargs: Any) -> "ProviderChain":
        env = dict(os.environ) if env is None else env
        settings: dict[str, Any] = {
            "call_timeout": _env_float(env, "CHAT_CALL_TIMEOUT_SECONDS", 25.0),
            "retry_delay": _env_float(env, "CHAT_RETRY_DELAY_SECONDS", 1.0),
            "cooldown": _env_float(env, "CHAT_COOLDOWN_SECONDS", 60.0),
            "max_queue_wait": _env_float(env, "CHAT_MAX_QUEUE_WAIT_SECONDS", 45.0),
        }
        settings.update(kwargs)
        return cls(build_chain(env), **settings)

    # In short: the provider names in the chain, in order, each once.
    def providers(self) -> list[str]:
        return list(dict.fromkeys(r.provider for r in self.routes))

    # In short: one entry per known provider for /health, configured or not, so the owner or
    # an uptime monitor can see a provider that is missing its key, paused after a refusal,
    # or failing, before a visitor meets it. Times are UTC; nothing secret is in it.
    def provider_status(self) -> list[dict[str, Any]]:
        now = self._clock()
        out = []
        for name in PROVIDER_DEFAULTS:
            routes = [r for r in self.routes if r.provider == name]
            paused = max((self._paused_until[r.key] - now for r in routes), default=0.0)
            out.append(
                {
                    "provider": name,
                    "configured": bool(routes),
                    "models": [r.model for r in routes],
                    "last_success": self._last_ok.get(name),
                    "last_error": self._last_error.get(name),
                    "paused_for_seconds": round(paused) if paused > 0 else 0,
                }
            )
        return out

    # In short: build every route's client now, at start-up, in a thread. The first one
    # imports the openai package, which takes over a second; done on the first call instead,
    # that import held up the event loop and with it every other request (measured: one
    # stream event arrived 1.7 s late on the first turn).
    def prepare(self) -> None:
        for route in self.routes:
            self._client(route)

    # In short: the client for a route's provider, made once and then reused.
    def _client(self, route: Route) -> Any:
        if route.provider not in self._clients:
            self._clients[route.provider] = self._client_factory(route, self.call_timeout)
        return self._clients[route.provider]

    # In short: the earliest time a request to this route may start: after its pause,
    # min_interval after the last request to it ENDED, and, once rpm requests started in the
    # last minute, a minute after the oldest of them.
    #
    # min_interval counts from the end because that is how Pollinations counts: one reply
    # every 30 s from the last reply. Measured on 2026-10-25, a request sent 30 s after the
    # previous one STARTED (that one had taken 9 s) was refused with 402, and the refusal
    # itself restarted the 30 s, so a request sent too early costs a whole extra interval.
    def _next_slot(self, route: Route, now: float) -> float:
        starts = self._starts[route.key]
        while starts and starts[0] <= now - 60.0:
            starts.popleft()
        slot = max(now, self._paused_until[route.key])
        if route.min_interval > 0 and route.key in self._last_end:
            slot = max(slot, self._last_end[route.key] + route.min_interval)
        if route.rpm > 0 and len(starts) >= route.rpm:
            slot = max(slot, starts[-route.rpm] + 60.0)
        return slot

    # In short: do not call this route again for `seconds` (a Retry-After, a cooldown, or the
    # short gap before a retry). A longer pause already in place is kept.
    def _pause(self, route: Route, seconds: float) -> None:
        until = self._clock() + seconds
        self._paused_until[route.key] = max(self._paused_until[route.key], until)

    # Run one completion over the chain. In: the prompt, the answer's token limit, and the
    # turn's deadline (a time.monotonic() value; the chain's clock). Out: a Completion that
    # names the provider and model that answered and every attempt before it. Raises
    # ChainExhausted when nothing answered.
    async def complete(self, prompt: str, *, max_tokens: int, deadline: float) -> Completion:
        attempts: list[Attempt] = []
        # The failover loop: each route in order, each at most twice (`tries`), with the turn's
        # deadline checked before every try, so it always ends.
        for route in self.routes:
            tries = 0
            while tries < 2:
                now = self._clock()
                if deadline - now < 1.0:
                    raise ChainExhausted(attempts, out_of_time=True)
                # A spaced provider takes one request at a time: queue behind another turn's
                # request, but no longer than a slot wait may last, and never past the turn.
                lock = self._locks.get(route.key)
                if lock is not None and lock.locked():
                    limit = min(self.max_queue_wait, deadline - now - 1.0)
                    try:
                        await asyncio.wait_for(lock.acquire(), timeout=max(limit, 0.001))
                    except asyncio.TimeoutError:
                        if tries == 0:
                            attempts.append(Attempt(route.provider, route.model, "skipped_busy"))
                        break
                elif lock is not None:
                    await lock.acquire()
                try:
                    result = await self._attempt(route, prompt, max_tokens, deadline, now, tries, attempts)
                finally:
                    if lock is not None:
                        lock.release()
                if isinstance(result, Completion):
                    return result
                if result == "skip":
                    break
                tries += 1
                if result == "next":
                    break
                # result == "retry": round again on the same route, once (see `tries`).
        raise ChainExhausted(attempts)

    # In short: one request to one route, after waiting for its slot. Out: the Completion, or
    # what the caller does next: "retry" this route, go to the "next" one, or "skip" it (its
    # slot is too far away; nothing was sent). Every outcome is appended to attempts.
    async def _attempt(
        self,
        route: Route,
        prompt: str,
        max_tokens: int,
        deadline: float,
        queued_at: float,
        tries: int,
        attempts: list[Attempt],
    ) -> Any:
        # Wait for this route's next slot only when the wait is short and the turn still has
        # time for a call after it; otherwise go to the next route. A retry that cannot happen
        # is not recorded again: the failure before it already is.
        now = self._clock()
        wait = self._next_slot(route, now) - now
        if wait > 0:
            if wait > self.max_queue_wait or now + wait + 1.0 > deadline:
                if tries == 0:
                    attempts.append(Attempt(route.provider, route.model, "skipped_busy"))
                return "skip"
        # The slot is taken before the wait, so the rpm count already includes this request.
        self._starts[route.key].append(now + max(wait, 0.0))
        if wait > 0:
            await self._sleep(wait)

        started = self._clock()
        waited_ms = round((started - queued_at) * 1000)
        timeout = max(1.0, min(self.call_timeout, deadline - started))
        try:
            # wait_for bounds the call even if a client ignores its own timeout. The thread is
            # then left to finish on its own; the turn does not wait for it.
            text, tin, tout = await asyncio.wait_for(
                asyncio.to_thread(_call, self._client(route), route, prompt, max_tokens, timeout),
                timeout=timeout + self.hang_grace,
            )
        except Exception as exc:  # noqa: BLE001 - every failure is classified below
            self._last_end[route.key] = self._clock()
            outcome, status, retry_after = classify(exc)
            ms = round((self._clock() - started) * 1000)
            attempts.append(Attempt(route.provider, route.model, outcome, ms, status, waited_ms))
            self._last_error[route.provider] = {
                "at": _utc_now(),
                "model": route.model,
                "outcome": outcome,
                "status": status,
            }
            # Provider, model, outcome and status only: no error text, which can hold the
            # provider's body, and never the prompt.
            logger.warning(
                "chat: %s %s after %d ms%s", route.key, outcome, ms, f" (HTTP {status})" if status else ""
            )
            # What each failure means for this route (the table at the top of this file).
            if outcome == "rate_limited":
                self._pause(route, retry_after if retry_after is not None else self.cooldown)
                return "retry"
            if outcome in ("server_error", "connection_error"):
                self._pause(route, self.retry_delay)
                return "retry"
            if outcome == "http_error" and status in (401, 403, 404):
                self._pause(route, self.cooldown)
            return "next"
        self._last_end[route.key] = self._clock()
        self._last_ok[route.provider] = _utc_now()
        ms = round((self._clock() - started) * 1000)
        attempts.append(Attempt(route.provider, route.model, "ok", ms, None, waited_ms))
        return Completion(text, tin, tout, route.provider, route.model, attempts)


# In short: the current UTC time as ISO text, to the second, for /health.
def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
