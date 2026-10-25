"""Tests for demo/chat_providers.py: the order of the provider chain and its failover rules.

Every model client here is a stub that follows a script (answer, raise a status, time out,
come back empty), and time is a fake clock that the stub and the chain's sleep move forward.
Nothing leaves the process, and the openai package is not needed.
"""

import asyncio
import logging
import os
import sys
import time
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from demo.chat_providers import (
    ChainExhausted,
    ProviderChain,
    Route,
    build_chain,
    classify,
)

ALL_KEYS = {
    "GROQ_API_KEY": "gsk-sentinel-groq",
    "CEREBRAS_API_KEY": "csk-sentinel-cerebras",
    "NVIDIA_API_KEY": "nvapi-sentinel-nvidia",
    "OPENROUTER_API_KEY": "sk-or-sentinel-openrouter",
}


class StatusError(Exception):
    """What openai raises for an HTTP error: a status_code, and the response's headers."""

    def __init__(self, status, retry_after=None):
        super().__init__(f"HTTP {status} body with account details")
        self.status_code = status
        headers = {"retry-after": str(retry_after)} if retry_after is not None else {}
        self.response = SimpleNamespace(headers=headers)


class Clock:
    def __init__(self):
        self.t = 1000.0
        self.sleeps = []

    def __call__(self):
        return self.t

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.t += seconds


def _response(text):
    message = SimpleNamespace(content=text)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
    )


class StubClient:
    """Answers per model from a script; each entry is used once, then "ok" forever.

    An entry is "ok", "empty", an exception to raise, or ("slow", seconds) to move the clock
    forward by that much before answering.
    """

    def __init__(self, clock, script=None):
        self.clock = clock
        self.script = {model: list(steps) for model, steps in (script or {}).items()}
        self.calls = []
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        model = kwargs["model"]
        self.calls.append(kwargs)
        steps = self.script.get(model) or []
        step = steps.pop(0) if steps else "ok"
        if isinstance(step, tuple) and step[0] == "slow":
            self.clock.t += step[1]
            step = "ok"
        if isinstance(step, BaseException):
            raise step
        if step == "empty":
            return _response("")
        return _response(f"answer from {model}")

    def models_called(self):
        return [c["model"] for c in self.calls]


def _chain(env=None, script=None, **kwargs):
    clock = Clock()
    stub = StubClient(clock, script)
    chain = ProviderChain.from_env(
        env if env is not None else dict(ALL_KEYS),
        client_factory=lambda route, timeout: stub,
        clock=clock,
        sleep=clock.sleep,
        **kwargs,
    )
    return chain, stub, clock


def _complete(chain, clock, budget=90.0, max_tokens=100):
    return asyncio.run(chain.complete("the prompt", max_tokens=max_tokens, deadline=clock() + budget))


# Which providers are in the chain, in which order, with which settings: all from the
# environment, with Pollinations (no key) always last.
class TestBuildChain:
    def test_order_is_groq_cerebras_nvidia_openrouter_then_pollinations(self):
        routes = build_chain(dict(ALL_KEYS))
        assert [r.key for r in routes] == [
            "groq/openai/gpt-oss-20b",
            "cerebras/gpt-oss-120b",
            "cerebras/qwen-3.8-27b",
            "nvidia/google/gemma-4-31b-it",
            "openrouter/google/gemma-4-31b-it:free",
            "pollinations/openai-fast",
        ]

    def test_a_provider_without_its_key_is_left_out_and_pollinations_always_stays(self):
        assert [r.provider for r in build_chain({})] == ["pollinations"]
        routes = build_chain({"CEREBRAS_API_KEY": "x"})
        assert [r.provider for r in routes] == ["cerebras", "cerebras", "pollinations"]

    def test_the_keyless_provider_is_last_even_when_the_list_leaves_it_out_or_puts_it_first(self):
        assert [r.provider for r in build_chain({**ALL_KEYS, "CHAT_PROVIDERS": "groq"})] == [
            "groq",
            "pollinations",
        ]
        assert [r.provider for r in build_chain({**ALL_KEYS, "CHAT_PROVIDERS": "pollinations,groq"})] == [
            "groq",
            "pollinations",
        ]

    def test_base_urls_models_and_limits_come_from_the_environment(self):
        routes = build_chain(
            {
                "GROQ_API_KEY": "x",
                "CHAT_PROVIDERS": "groq",
                "CHAT_GROQ_BASE_URL": "http://localhost:9/v1",
                "CHAT_GROQ_MODELS": "a, b",
                "CHAT_GROQ_RPM": "7",
                "CHAT_GROQ_MIN_INTERVAL_SECONDS": "2.5",
            }
        )
        assert [(r.model, r.base_url, r.rpm, r.min_interval) for r in routes if r.provider == "groq"] == [
            ("a", "http://localhost:9/v1", 7, 2.5),
            ("b", "http://localhost:9/v1", 7, 2.5),
        ]

    def test_chat_providers_reorders_and_shortens_the_keyed_providers(self):
        routes = build_chain({**ALL_KEYS, "CHAT_PROVIDERS": "nvidia,groq"})
        assert [r.provider for r in routes] == ["nvidia", "groq", "pollinations"]

    def test_an_unknown_provider_is_an_error(self):
        with pytest.raises(ValueError):
            build_chain({"CHAT_PROVIDERS": "groq,nope"})

    def test_reasoning_is_kept_low_or_off(self):
        by_key = {r.key: r.extra_body for r in build_chain(dict(ALL_KEYS))}
        assert by_key["groq/openai/gpt-oss-20b"] == {"reasoning_effort": "low"}
        assert by_key["cerebras/gpt-oss-120b"] == {"reasoning_effort": "low"}
        assert by_key["cerebras/qwen-3.8-27b"] == {"reasoning_effort": "none"}
        assert by_key["pollinations/openai-fast"] == {"reasoning_effort": "low"}
        assert by_key["nvidia/google/gemma-4-31b-it"] == {}
        assert by_key["openrouter/google/gemma-4-31b-it:free"] == {}
        assert build_chain({"GROQ_API_KEY": "x", "CHAT_REASONING_EFFORT": "medium"})[0].extra_body == {
            "reasoning_effort": "medium"
        }

    def test_a_route_never_shows_its_key(self):
        route = build_chain(dict(ALL_KEYS))[0]
        assert route.api_key == ALL_KEYS["GROQ_API_KEY"]
        assert ALL_KEYS["GROQ_API_KEY"] not in repr(route)


# What the chain does on each kind of failure: retry once, move on, pause the model, and
# always stop (by the number of tries, or by the turn's deadline).
class TestFailover:
    def test_the_first_provider_answers_when_it_can(self):
        chain, stub, clock = _chain()
        result = _complete(chain, clock)
        assert (result.provider, result.model) == ("groq", "openai/gpt-oss-20b")
        assert result.text == "answer from openai/gpt-oss-20b"
        assert [a.outcome for a in result.attempts] == ["ok"]
        assert stub.calls[0]["extra_body"] == {"reasoning_effort": "low"}
        assert stub.calls[0]["max_tokens"] == 100

    def test_a_429_with_a_long_retry_after_fails_over_and_pauses_that_model(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": [StatusError(429, retry_after=120)]})
        result = _complete(chain, clock)
        assert result.provider == "cerebras"
        assert [(a.provider, a.outcome, a.status) for a in result.attempts] == [
            ("groq", "rate_limited", 429),
            ("cerebras", "ok", None),
        ]
        # The next step skips groq without sending it a request, until Retry-After has passed.
        stub.calls.clear()
        again = _complete(chain, clock)
        assert again.attempts[0].outcome == "skipped_busy"
        assert "openai/gpt-oss-20b" not in stub.models_called()
        clock.t += 121
        assert _complete(chain, clock).provider == "groq"

    def test_a_429_with_a_short_retry_after_is_retried_once_on_the_same_model(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": [StatusError(429, retry_after=2)]})
        result = _complete(chain, clock)
        assert result.provider == "groq"
        assert stub.models_called() == ["openai/gpt-oss-20b", "openai/gpt-oss-20b"]
        assert clock.sleeps == [2.0]

    def test_a_402_is_a_rate_limit_too(self):
        # Pollinations refuses a request inside its anonymous tier's 30 s with 402, not 429.
        chain, stub, clock = _chain(
            env={"CHAT_PROVIDERS": "pollinations"},
            script={"openai-fast": [StatusError(402, retry_after=20)]},
        )
        result = _complete(chain, clock)
        assert [(a.provider, a.outcome, a.status) for a in result.attempts] == [
            ("pollinations", "rate_limited", 402),
            ("pollinations", "ok", None),
        ]
        # The retry waited for Retry-After (and the 32 s spacing after the refusal), and says so.
        assert result.attempts[1].waited_ms >= 20_000

    def test_a_5xx_is_retried_once_then_fails_over(self):
        chain, stub, clock = _chain(
            script={"openai/gpt-oss-20b": [StatusError(503), StatusError(502)]}
        )
        result = _complete(chain, clock)
        assert stub.models_called() == ["openai/gpt-oss-20b", "openai/gpt-oss-20b", "gpt-oss-120b"]
        assert [a.outcome for a in result.attempts] == ["server_error", "server_error", "ok"]
        assert result.provider == "cerebras"

    def test_a_connection_error_is_retried_once(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": [ConnectionError("reset")]})
        result = _complete(chain, clock)
        assert result.provider == "groq"
        assert [a.outcome for a in result.attempts] == ["connection_error", "ok"]

    def test_a_timeout_fails_over_without_a_retry(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": [TimeoutError()]})
        result = _complete(chain, clock)
        assert stub.models_called() == ["openai/gpt-oss-20b", "gpt-oss-120b"]
        assert [a.outcome for a in result.attempts] == ["timeout", "ok"]

    def test_a_call_that_hangs_past_its_timeout_is_abandoned(self):
        class Hangs(StubClient):
            def create(self, **kwargs):
                if kwargs["model"] == "openai/gpt-oss-20b":
                    time.sleep(2.5)
                return super().create(**kwargs)

        stub = Hangs(None)
        chain = ProviderChain(
            build_chain({"GROQ_API_KEY": "x", "CEREBRAS_API_KEY": "y"}),
            call_timeout=1.0,
            hang_grace=0.1,
            client_factory=lambda route, timeout: stub,
        )
        # Timed inside the event loop: asyncio.run itself waits for the abandoned thread to
        # finish before it returns, which a long-running server never does.
        async def timed():
            started = time.monotonic()
            result = await chain.complete("p", max_tokens=10, deadline=time.monotonic() + 30)
            return result, time.monotonic() - started

        result, elapsed = asyncio.run(timed())
        assert elapsed < 1.8
        assert [a.outcome for a in result.attempts] == ["timeout", "ok"]

    def test_a_wrong_key_fails_over_and_is_not_tried_again_soon(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": [StatusError(401)]})
        assert _complete(chain, clock).provider == "cerebras"
        stub.calls.clear()
        _complete(chain, clock)
        assert "openai/gpt-oss-20b" not in stub.models_called()

    def test_an_empty_completion_fails_over(self):
        chain, stub, clock = _chain(script={"openai/gpt-oss-20b": ["empty"]})
        result = _complete(chain, clock)
        assert [a.outcome for a in result.attempts] == ["empty", "ok"]

    def test_every_model_is_tried_at_most_twice_and_the_chain_ends(self):
        always_500 = {m: [StatusError(500)] * 5 for m in (
            "openai/gpt-oss-20b", "gpt-oss-120b", "qwen-3.8-27b", "google/gemma-4-31b-it",
            "openai-fast", "google/gemma-4-31b-it:free",
        )}
        chain, stub, clock = _chain(script=always_500, max_queue_wait=60)
        with pytest.raises(ChainExhausted) as err:
            _complete(chain, clock, budget=10_000)
        counts = {m: stub.models_called().count(m) for m in always_500}
        assert set(counts.values()) == {2}
        assert err.value.out_of_time is False
        assert not err.value.all_rate_limited
        assert "account details" not in str(err.value)

    def test_the_turn_budget_stops_the_chain(self):
        # Every call burns 30 s and times out. With a 40 s budget the first call leaves 10 s,
        # the second uses them up, and the chain stops there instead of trying the rest.
        chain, stub, clock = _chain()

        def slow_timeout(**kwargs):
            stub.calls.append(kwargs)
            clock.t += 30
            raise TimeoutError()

        stub.create = slow_timeout
        with pytest.raises(ChainExhausted) as err:
            _complete(chain, clock, budget=40)
        assert err.value.out_of_time is True
        assert len(stub.calls) == 2
        # The second call was given only what was left of the turn, not the full 25 s.
        assert stub.calls[1]["timeout"] == pytest.approx(10.0)

    def test_all_providers_at_their_limit_is_reported_as_rate_limited(self):
        chain, stub, clock = _chain(
            env={"CHAT_PROVIDERS": "pollinations"},
            script={"openai-fast": [StatusError(402, retry_after=500)]},
        )
        with pytest.raises(ChainExhausted) as err:
            _complete(chain, clock)
        assert err.value.all_rate_limited


# The limits this service keeps itself, so it does not spend a request a provider will refuse:
# spacing from the end of the last reply, one request at a time, and requests per minute.
class TestLocalLimits:
    def test_min_interval_counts_from_the_end_of_the_last_reply(self):
        # The first reply takes 9 s. 5 s after it ends, the next request still has 27 s of
        # Pollinations' 32 s spacing to wait, counted from that end, not from the start.
        chain, stub, clock = _chain(env={"CHAT_PROVIDERS": "pollinations"}, script={"openai-fast": [("slow", 9)]})
        _complete(chain, clock)
        clock.t += 5
        result = _complete(chain, clock)
        assert clock.sleeps == [27.0]
        assert len(stub.calls) == 2
        assert result.attempts[0].waited_ms == 27_000

    def test_concurrent_turns_send_to_a_spaced_provider_one_at_a_time(self):
        in_flight = {"now": 0, "most": 0}
        chain, stub, clock = _chain(env={"CHAT_PROVIDERS": "pollinations"})
        answer = stub.create

        def counted(**kwargs):
            in_flight["now"] += 1
            in_flight["most"] = max(in_flight["most"], in_flight["now"])
            time.sleep(0.05)
            clock.t += 9
            in_flight["now"] -= 1
            return answer(**kwargs)

        stub.create = counted

        async def two_turns():
            deadline = clock() + 120
            return await asyncio.gather(
                chain.complete("a", max_tokens=10, deadline=deadline),
                chain.complete("b", max_tokens=10, deadline=deadline),
            )

        results = asyncio.run(two_turns())
        assert [r.provider for r in results] == ["pollinations", "pollinations"]
        assert in_flight["most"] == 1
        # The second waited for the first to finish, then for the spacing after it.
        assert clock.sleeps == [32.0]

    def test_a_wait_longer_than_the_queue_limit_skips_the_model(self):
        chain, stub, clock = _chain(
            env={"CHAT_PROVIDERS": "pollinations", "CHAT_MAX_QUEUE_WAIT_SECONDS": "10"}
        )
        _complete(chain, clock)
        with pytest.raises(ChainExhausted) as err:
            _complete(chain, clock)
        assert [a.outcome for a in err.value.attempts] == ["skipped_busy"]
        assert len(stub.calls) == 1

    def test_a_wait_that_does_not_fit_in_the_turn_skips_the_model(self):
        chain, stub, clock = _chain(env={"CHAT_PROVIDERS": "pollinations"})
        _complete(chain, clock)
        with pytest.raises(ChainExhausted):
            _complete(chain, clock, budget=20)

    def test_rpm_caps_requests_per_model_per_minute(self):
        chain, stub, clock = _chain(
            env={"GROQ_API_KEY": "x", "CHAT_PROVIDERS": "groq,pollinations", "CHAT_GROQ_RPM": "2"},
            max_queue_wait=0,
        )
        providers = [_complete(chain, clock).provider for _ in range(3)]
        assert providers == ["groq", "groq", "pollinations"]
        clock.t += 61
        assert _complete(chain, clock).provider == "groq"


# What /health shows per provider: configured or not, the last success, the last failure as
# an outcome and a status (no body), and how long a refused provider stays paused.
def test_provider_status_shows_each_provider_without_secrets():
    chain, stub, clock = _chain(
        env={"GROQ_API_KEY": ALL_KEYS["GROQ_API_KEY"], "CEREBRAS_API_KEY": ALL_KEYS["CEREBRAS_API_KEY"]},
        script={"openai/gpt-oss-20b": [StatusError(429, retry_after=120)]},
    )
    _complete(chain, clock)
    status = {s["provider"]: s for s in chain.provider_status()}
    assert list(status) == ["groq", "cerebras", "nvidia", "openrouter", "pollinations"]
    assert status["groq"]["configured"] is True
    assert status["groq"]["last_error"]["outcome"] == "rate_limited"
    assert status["groq"]["last_error"]["status"] == 429
    assert status["groq"]["last_success"] is None
    assert 100 < status["groq"]["paused_for_seconds"] <= 120
    assert status["cerebras"]["last_success"] is not None
    assert status["nvidia"] == {
        "provider": "nvidia",
        "configured": False,
        "models": [],
        "last_success": None,
        "last_error": None,
        "paused_for_seconds": 0,
    }
    assert status["pollinations"]["configured"] is True
    text = repr(status)
    assert ALL_KEYS["GROQ_API_KEY"] not in text and "account details" not in text


# How a failure is named: by its HTTP status or exception type, with or without openai.
class TestClassify:
    def test_outcomes(self):
        assert classify(StatusError(429, retry_after=7)) == ("rate_limited", 429, 7.0)
        assert classify(StatusError(402)) == ("rate_limited", 402, None)
        assert classify(StatusError(500)) == ("server_error", 500, None)
        assert classify(StatusError(404)) == ("http_error", 404, None)
        assert classify(TimeoutError())[0] == "timeout"
        assert classify(ConnectionResetError())[0] == "connection_error"
        assert classify(ValueError("x"))[0] == "error"

    def test_the_real_openai_exceptions_classify_the_same_way(self):
        openai = pytest.importorskip("openai")
        httpx = pytest.importorskip("httpx")
        request = httpx.Request("POST", "https://example.invalid/v1/chat/completions")
        limited = httpx.Response(429, headers={"retry-after": "3"}, request=request)
        assert classify(openai.RateLimitError("limited", response=limited, body=None)) == (
            "rate_limited",
            429,
            3.0,
        )
        broken = httpx.Response(503, request=request)
        assert classify(openai.InternalServerError("down", response=broken, body=None))[0] == "server_error"
        assert classify(openai.APITimeoutError(request=request))[0] == "timeout"
        assert classify(openai.APIConnectionError(request=request))[0] == "connection_error"


def test_failures_are_logged_without_the_key_the_prompt_or_the_body(caplog):
    chain, stub, clock = _chain(
        script={
            "openai/gpt-oss-20b": [StatusError(429, retry_after=120)],
            "gpt-oss-120b": [StatusError(500), StatusError(500)],
        }
    )
    with caplog.at_level(logging.DEBUG):
        asyncio.run(
            chain.complete("SECRET-PROMPT-TEXT", max_tokens=10, deadline=clock() + 90)
        )
    assert "groq/openai/gpt-oss-20b rate_limited" in caplog.text
    for secret in [*ALL_KEYS.values(), "SECRET-PROMPT-TEXT", "account details"]:
        assert secret not in caplog.text
