"""Tests for demo/chat_server.py.

The model client is a stub behind the real provider chain: it is the one thing that cannot be
real in a unit test, and what matters here is what the server sends it and what it does with
the answer. Retrieval is the real local index (with whatever vectors this process has), and
spans are the real SDK's, captured at the transport's enqueue so nothing leaves the process.
"""

import json
import logging
import os
import sys
import threading
import time
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import pytest
from fastapi.testclient import TestClient

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanStatus
from demo.chat_guard import GuardSettings, parse_networks
from demo.chat_providers import ProviderChain
from demo.chat_server import AGENTS, create_app
from demo.workflows import retrieval
from demo.workflows.retrieval import local_retriever

GROQ_KEY = "gsk-sentinel-groq-key"
CEREBRAS_KEY = "csk-sentinel-cerebras-key"
QUESTION = "How does SQLite WAL improve concurrency?"


class StatusError(Exception):
    def __init__(self, status, retry_after=None):
        super().__init__(f"HTTP {status}: SECRET-PROVIDER-BODY")
        self.status_code = status
        headers = {"retry-after": str(retry_after)} if retry_after is not None else {}
        self.response = SimpleNamespace(headers=headers)


def _response(text):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=SimpleNamespace(prompt_tokens=11, completion_tokens=7),
    )


class StubClient:
    """Answers by which agent's prompt it got; can be told to fail for chosen calls.

    fail(call_index) returns an exception to raise for the n-th call (0-based) or None.
    """

    def __init__(self, fail=None, delay=0.0):
        self.calls = []
        self.fail = fail or (lambda n, kwargs: None)
        self.delay = delay
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        n = len(self.calls)
        self.calls.append(kwargs)
        if self.delay:
            time.sleep(self.delay)
        exc = self.fail(n, kwargs)
        if exc is not None:
            raise exc
        prompt = kwargs["messages"][0]["content"]
        if "Write one sentence" in prompt:
            return _response("The search found three documents about databases and models.")
        if "Does the evidence answer" in prompt:
            return _response("Yes. The evidence covers it.")
        return _response(f"answer from {kwargs['model']}")

    def prompts(self):
        return [c["messages"][0]["content"] for c in self.calls]


# In short: the real provider chain over a stub client. Pollinations ends every chain; its
# 32 s spacing is real time here (the server's clock is not faked), so it is turned off, or
# every test whose stub fails would sit out the spacing before Pollinations' retry.
def _chain(stub, env=None):
    env = {"GROQ_API_KEY": GROQ_KEY} if env is None else env
    env = {"CHAT_POLLINATIONS_MIN_INTERVAL_SECONDS": "0", **env}
    return ProviderChain.from_env(env, client_factory=lambda route, timeout: stub, hang_grace=0.2)


@pytest.fixture
def spans():
    return []


@pytest.fixture
def pulse(spans):
    p = AgentPulse(endpoint="http://unused", capture_inputs=True, capture_outputs=True)
    p._transport.enqueue = spans.append
    return p


def _app(pulse, stub=None, chain=None, guard=None, env=None, loader=None, background=False):
    return create_app(
        chain=chain or _chain(stub or StubClient()),
        guard=guard or GuardSettings(max_concurrent=5, ip_per_minute=100, ip_per_day=1000),
        pulse=pulse,
        loader=loader or (lambda: None),
        env=env or {},
        load_in_background=background,
    )


# Every client is opened as a context manager, which is what runs the app's lifespan (the
# retrieval loader among it), and closed again when the test ends.
_open_clients = []


@pytest.fixture(autouse=True)
def _close_clients():
    yield
    while _open_clients:
        _open_clients.pop().__exit__(None, None, None)


def _client(pulse, stub=None, **kwargs):
    client_addr = kwargs.pop("client_addr", ("testclient", 50000))
    client = TestClient(_app(pulse, stub, **kwargs), client=client_addr)
    client.__enter__()
    _open_clients.append(client)
    return client


def _stream_events(res):
    return [json.loads(line) for line in res.text.splitlines() if line.strip()]


def test_corpus_lists_the_real_index_titles_on_both_paths(pulse):
    client = _client(pulse)
    for path in ("/corpus", "/chat/corpus"):
        body = client.get(path).json()
        assert body["documents"] == [d["title"] for d in local_retriever.corpus]
        assert body["documents"]


def test_chat_runs_three_agents_in_order_and_names_the_provider(pulse):
    stub = StubClient()
    res = _client(pulse, stub).post("/chat", json={"message": QUESTION, "session_id": "s1"})
    assert res.status_code == 200
    body = res.json()

    assert body["session_id"] == "s1"
    assert [a["agent"] for a in body["agents"]] == ["retriever", "verifier", "answerer"]
    assert {(a["provider"], a["model"]) for a in body["agents"]} == {("groq", "openai/gpt-oss-20b")}
    assert body["reply"] == "answer from openai/gpt-oss-20b"
    assert body["verifier_verdict"] == "Yes. The evidence covers it."
    assert body["trace_id"]
    assert all(a["latency_ms"] >= 0 for a in body["agents"])
    assert all(a["attempts"] == [a["attempts"][0]] and a["attempts"][0]["outcome"] == "ok" for a in body["agents"])
    assert body["total_ms"] >= body["search_ms"] >= 0
    # Three LLM calls a turn, each with its own small token limit and low reasoning.
    assert [c["max_tokens"] for c in stub.calls] == [200, 250, 500]
    assert all(c["extra_body"] == {"reasoning_effort": "low"} for c in stub.calls)


def test_retrieved_titles_come_from_the_index_not_the_model(pulse):
    body = _client(pulse).post("/chat", json={"message": "transformers"}).json()
    titles = {d["title"] for d in local_retriever.corpus}
    assert len(body["retrieved"]) == 3
    assert set(body["retrieved"]) <= titles


def test_each_agent_emits_one_span_in_one_trace_with_the_answering_model(pulse, spans):
    body = _client(pulse).post("/chat", json={"message": "q"}).json()
    assert [s.agent_id for s in spans] == ["retriever", "verifier", "answerer"]
    assert {s.trace_id for s in spans} == {body["trace_id"]}
    assert all(s.status == SpanStatus.SUCCESS for s in spans)
    assert all(s.model == "openai/gpt-oss-20b" for s in spans)
    assert all(s.metadata["provider"] == "groq" for s in spans)
    assert all((s.tokens_in, s.tokens_out) == (11, 7) for s in spans)


def test_retriever_span_carries_the_real_tool_result(pulse, spans):
    body = _client(pulse).post("/chat", json={"message": "q"}).json()
    retriever_span = spans[0]
    assert retriever_span.tool_name == "local_retriever"
    assert retriever_span.tool_args == "q"
    assert retriever_span.tool_result_summary == "Found 3 documents: " + "; ".join(body["retrieved"])
    assert retriever_span.output_summary == body["agents"][0]["output"]


def test_grounding_input_is_the_evidence_not_the_prompt(pulse, spans):
    _client(pulse).post("/chat", json={"message": "What is attention?"})
    for span in spans:
        assert "Question:" not in span.input_summary
        assert "Write one sentence" not in span.input_summary
    assert any(d["content"][:40] in spans[2].input_summary for d in local_retriever.corpus)


def test_retriever_is_not_told_to_use_the_extractors_phrasing(pulse):
    stub = StubClient()
    _client(pulse, stub).post("/chat", json={"message": "q"})
    retriever_prompt = stub.prompts()[0]
    assert "Retrieved N documents" not in retriever_prompt
    assert "in the form" not in retriever_prompt


# What a visitor gets when providers refuse or fail: the answering provider named, or an
# honest error with the stages that did finish.
class TestFailover:
    def test_a_rate_limited_provider_hands_over_and_the_response_says_so(self, pulse, spans):
        stub = StubClient(fail=lambda n, kw: StatusError(429, retry_after=120) if kw["model"] == "openai/gpt-oss-20b" else None)
        chain = _chain(stub, {"GROQ_API_KEY": GROQ_KEY, "CEREBRAS_API_KEY": CEREBRAS_KEY})
        body = _client(pulse, chain=chain).post("/chat", json={"message": "q"}).json()
        first = body["agents"][0]
        assert (first["provider"], first["model"]) == ("cerebras", "gpt-oss-120b")
        assert [(a["provider"], a["outcome"]) for a in first["attempts"]] == [
            ("groq", "rate_limited"),
            ("cerebras", "ok"),
        ]
        # Groq is paused after its 429, so the next agents skip it without a request.
        assert body["agents"][1]["attempts"][0]["outcome"] == "skipped_busy"
        assert spans[0].metadata["attempts"][0]["status"] == 429
        assert spans[0].model == "gpt-oss-120b"

    def test_no_provider_answering_is_502_with_the_partial_turn_and_an_error_span(self, pulse, spans):
        stub = StubClient(fail=lambda n, kw: StatusError(500) if n >= 1 else None)
        chain = _chain(stub, {"GROQ_API_KEY": GROQ_KEY, "CHAT_PROVIDERS": "groq"})
        res = _client(pulse, chain=chain).post("/chat", json={"message": "q"})
        assert res.status_code == 502
        body = res.json()
        assert body["code"] == "provider_failed"
        assert "verifier" in body["error"]
        assert [a["agent"] for a in body["agents"]] == ["retriever"]
        assert body["trace_id"]
        assert [s.status for s in spans] == [SpanStatus.SUCCESS, SpanStatus.ERROR]
        assert spans[1].output_summary is None
        assert "server_error" in spans[1].error_message
        # The provider's own error text is never passed on, to the visitor or to the span.
        assert "SECRET-PROVIDER-BODY" not in res.text
        assert "SECRET-PROVIDER-BODY" not in spans[1].error_message

    def test_every_provider_at_its_limit_is_503_providers_busy(self, pulse):
        stub = StubClient(fail=lambda n, kw: StatusError(429, retry_after=600))
        res = _client(pulse, stub).post("/chat", json={"message": "q"})
        assert res.status_code == 503
        assert res.json()["code"] == "providers_busy"

    def test_the_turn_budget_is_504_and_names_the_step(self, pulse):
        stub = StubClient(delay=1.0)
        res = _client(pulse, stub, env={"CHAT_TURN_BUDGET_SECONDS": "1.5"}).post("/chat", json={"message": "q"})
        assert res.status_code == 504
        body = res.json()
        assert body["code"] == "budget_exceeded"
        assert [a["agent"] for a in body["agents"]] == ["retriever"]
        assert len(stub.calls) == 1


# Turns refused before anything is spent: a bad question, a per-IP limit, the site's day.
class TestRefusals:
    def test_empty_and_oversize_messages_are_400_and_cost_nothing(self, pulse, spans):
        stub = StubClient()
        guard = GuardSettings(max_input_chars=50, ip_per_minute=1, max_concurrent=5)
        client = _client(pulse, stub, guard=guard)
        empty = client.post("/chat", json={"message": "   "})
        assert (empty.status_code, empty.json()["code"]) == (400, "empty_message")
        long = client.post("/chat", json={"message": "x" * 51})
        assert (long.status_code, long.json()["code"]) == (400, "message_too_long")
        assert "50" in long.json()["error"]
        assert stub.calls == [] and spans == []
        # Neither used up this IP's one turn a minute.
        assert client.post("/chat", json={"message": "q"}).status_code == 200

    def test_a_body_of_the_wrong_shape_is_a_4xx(self, pulse):
        client = _client(pulse)
        assert client.post("/chat", json={}).status_code == 422
        assert client.post("/chat", json={"message": "x" * 20_001}).status_code == 422

    def test_per_ip_limit_is_429_with_retry_after(self, pulse):
        guard = GuardSettings(ip_per_minute=2, max_concurrent=5)
        client = _client(pulse, guard=guard)
        assert [client.post("/chat", json={"message": "q"}).status_code for _ in range(2)] == [200, 200]
        res = client.post("/chat", json={"message": "q"})
        assert res.status_code == 429
        assert res.json()["code"] == "rate_limited"
        assert 1 <= int(res.headers["retry-after"]) <= 61

    def test_the_site_wide_daily_cap(self, pulse):
        guard = GuardSettings(daily_cap=1, ip_per_minute=10, max_concurrent=5)
        client = _client(pulse, guard=guard)
        assert client.post("/chat", json={"message": "q"}).status_code == 200
        res = client.post("/chat", json={"message": "q"})
        assert (res.status_code, res.json()["code"]) == (429, "daily_cap")
        assert client.get("/chat/health").json()["usage"]["turns_today"] == 1

    def test_one_ip_runs_one_turn_at_a_time_but_others_are_not_held_up(self, pulse):
        # The first turn's model call waits on an event, so it is still running while the
        # same IP, then another IP, ask a question.
        release = threading.Event()
        started = []

        class Held(StubClient):
            def create(self, **kwargs):
                # Only the very first call is held; it is counted before it waits, so the
                # other visitor's calls are not mistaken for it.
                started.append(1)
                if len(started) == 1:
                    release.wait(5)
                return super().create(**kwargs)

        guard = GuardSettings(max_concurrent=5, ip_per_minute=100, trusted_proxies=parse_networks("172.16.0.0/12"))
        client = _client(pulse, Held(), guard=guard, client_addr=("172.18.0.5", 40000))
        same_ip = {"X-Forwarded-For": "198.51.100.1"}
        first = {}
        runner = threading.Thread(
            target=lambda: first.update(res=client.post("/chat", json={"message": "q"}, headers=same_ip))
        )
        runner.start()
        time.sleep(0.5)
        again = client.post("/chat", json={"message": "q"}, headers=same_ip)
        assert (again.status_code, again.json()["code"]) == (429, "busy")
        assert "still being answered" in again.json()["error"]
        other = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.2"})
        assert other.status_code == 200
        release.set()
        runner.join(10)
        assert first["res"].status_code == 200
        # Its slot is free again once the turn is over.
        assert client.post("/chat", json={"message": "q"}, headers=same_ip).status_code == 200


# Pausing and resuming a running service, for /chat, /chat/stream and /health alike.
class TestKillSwitch:
    def test_the_flag_file_pauses_chat_and_health_without_a_restart(self, pulse, tmp_path):
        flag = tmp_path / "paused"
        guard = GuardSettings(pause_file=str(flag), max_concurrent=5, ip_per_minute=100)
        stub = StubClient()
        client = _client(pulse, stub, guard=guard)
        assert client.post("/chat", json={"message": "q"}).status_code == 200

        flag.write_text("Paused for maintenance.")
        for path in ("/chat", "/chat/stream"):
            res = client.post(path, json={"message": "q"})
            assert res.status_code == 503
            assert res.json() == {"code": "paused", "error": "Paused for maintenance.", "session_id": res.json()["session_id"], "agents": []}
        health = client.get("/chat/health")
        assert health.status_code == 503
        assert health.json()["status"] == "paused"
        assert health.json()["message"] == "Paused for maintenance."
        calls_while_paused = len(stub.calls)

        flag.unlink()
        assert client.post("/chat", json={"message": "q"}).status_code == 200
        assert calls_while_paused == 3

    def test_the_env_flag_pauses(self, pulse):
        client = _client(pulse, guard=GuardSettings.from_env({"CHAT_PAUSED": "true"}))
        assert client.post("/chat", json={"message": "q"}).json()["code"] == "paused"


# A cold start: "loading" until MiniLM is ready, and a clear state if it cannot load.
class TestReadiness:
    def test_health_says_loading_until_the_embedding_model_is_ready(self, pulse):
        release = threading.Event()
        app = _app(pulse, loader=lambda: release.wait(10), background=True)
        with TestClient(app) as client:
            health = client.get("/chat/health")
            assert health.status_code == 503
            assert (health.json()["status"], health.json()["embedding"]) == ("loading", "loading")
            res = client.post("/chat", json={"message": "q"})
            assert (res.status_code, res.json()["code"]) == (503, "loading")
            release.set()
            for _ in range(50):
                if client.get("/chat/health").status_code == 200:
                    break
                time.sleep(0.05)
            ready = client.get("/chat/health").json()
            assert (ready["status"], ready["embedding"]) == ("ready", "ready")
            assert client.post("/chat", json={"message": "q"}).status_code == 200

    def test_a_failed_load_is_reported_and_chat_refuses(self, pulse):
        def broken():
            raise RuntimeError("no model files")

        client = _client(pulse, loader=broken)
        health = client.get("/health").json()
        assert (health["status"], health["embedding"]) == ("failed", "failed")
        assert client.post("/chat", json={"message": "q"}).json()["code"] == "unavailable"

    def test_the_default_loader_refuses_a_stand_in_index(self, monkeypatch):
        from demo import chat_server

        monkeypatch.setattr(chat_server, "ensure_embedding_model", lambda **kwargs: None)
        monkeypatch.setattr(local_retriever, "build_index", lambda: None)
        monkeypatch.setattr(local_retriever, "_index_is_real", False)
        with pytest.raises(RuntimeError):
            chat_server.load_retrieval()

    def test_without_any_key_the_keyless_provider_still_answers(self, pulse):
        # CHAT_PROVIDERS names only Groq and no key is set: Pollinations is still the last
        # route, so the chat is ready and answers rather than refusing.
        chain = _chain(StubClient(), {"CHAT_PROVIDERS": "groq"})
        client = _client(pulse, chain=chain)
        assert client.get("/chat/health").json()["status"] == "ready"
        body = client.post("/chat", json={"message": "q"}).json()
        assert {a["provider"] for a in body["agents"]} == {"pollinations"}

    def test_an_empty_chain_is_reported_not_crashed_on(self, pulse):
        client = _client(pulse, chain=ProviderChain([]))
        assert client.get("/chat/health").json()["status"] == "failed"
        assert client.post("/chat", json={"message": "q"}).status_code == 503


# Without its own key for AgentPulse the chat would answer while recording nothing, so it
# reports itself as not set up instead. Here the app builds its own AgentPulse client, as
# in the container.
class TestIngestKey:
    # In short: /chat/health from an app that makes its own AgentPulse client from env, and,
    # with ask=True, the answer to one question.
    @staticmethod
    def _ask(env, ask=False):
        app = create_app(
            chain=_chain(StubClient()),
            guard=GuardSettings(max_concurrent=5),
            loader=lambda: None,
            env=env,
            load_in_background=False,
        )
        with TestClient(app) as client:
            health = client.get("/chat/health").json()
            return health, (client.post("/chat", json={"message": "q"}) if ask else None)

    def test_no_key_means_not_ready_and_no_turns(self):
        health, res = self._ask({"AGENTPULSE_ENDPOINT": "http://unused"}, ask=True)
        assert health["status"] == "failed"
        assert "no AgentPulse key" in health["message"]
        assert (res.status_code, res.json()["code"]) == (503, "unavailable")

    def test_with_a_key_it_is_ready(self):
        health, _ = self._ask({"AGENTPULSE_ENDPOINT": "http://unused", "AGENTPULSE_API_KEY": "issued-key"})
        assert health["status"] == "ready"
        assert "issued-key" not in json.dumps(health)


# What /health tells the owner and an uptime monitor: every provider, configured or not, its
# last success and last failure (outcome and status only), and whether the chain is degraded.
class TestHealthProviders:
    def test_health_lists_every_provider_without_keys(self, pulse):
        chain = _chain(StubClient(), {"GROQ_API_KEY": GROQ_KEY, "CEREBRAS_API_KEY": CEREBRAS_KEY})
        res = _client(pulse, chain=chain).get("/chat/health")
        body = res.json()
        assert res.status_code == 200 and body["status"] == "ready"
        assert body["degraded"] is False
        by_name = {p["provider"]: p for p in body["providers"]}
        assert list(by_name) == ["groq", "cerebras", "nvidia", "openrouter", "pollinations"]
        assert [by_name[n]["configured"] for n in by_name] == [True, True, False, False, True]
        assert body["chain"][0] == {"provider": "groq", "model": "openai/gpt-oss-20b"}
        assert body["chain"][-1]["provider"] == "pollinations"
        assert body["agents"] == list(AGENTS)
        assert GROQ_KEY not in res.text and CEREBRAS_KEY not in res.text
        assert "base_url" not in res.text

    def test_a_failing_provider_shows_up_as_degraded_with_its_error_class(self, pulse):
        stub = StubClient(fail=lambda n, kw: StatusError(401) if kw["model"] == "openai/gpt-oss-20b" else None)
        client = _client(pulse, stub)
        assert client.post("/chat", json={"message": "q"}).status_code == 200
        body = client.get("/chat/health").json()
        groq = next(p for p in body["providers"] if p["provider"] == "groq")
        assert body["degraded"] is True
        assert groq["last_error"]["outcome"] == "http_error"
        assert groq["last_error"]["status"] == 401
        assert groq["last_success"] is None
        assert "SECRET-PROVIDER-BODY" not in json.dumps(body)
        pollinations = next(p for p in body["providers"] if p["provider"] == "pollinations")
        assert pollinations["last_success"] is not None


# X-Forwarded-For counts only from a trusted proxy (Caddy); anyone else's is ignored.
class TestForwardedFor:
    def test_behind_a_trusted_proxy_each_forwarded_client_has_its_own_limit(self, pulse):
        guard = GuardSettings(ip_per_minute=1, max_concurrent=5, trusted_proxies=parse_networks("172.16.0.0/12"))
        client = _client(pulse, guard=guard, client_addr=("172.18.0.5", 40000))
        first = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.1"})
        other = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.2"})
        again = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.1"})
        assert [first.status_code, other.status_code, again.status_code] == [200, 200, 429]

    def test_from_an_untrusted_peer_the_header_cannot_dodge_the_limit(self, pulse):
        guard = GuardSettings(ip_per_minute=1, max_concurrent=5, trusted_proxies=parse_networks("172.16.0.0/12"))
        client = _client(pulse, guard=guard, client_addr=("203.0.113.5", 40000))
        first = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.1"})
        spoofed = client.post("/chat", json={"message": "q"}, headers={"X-Forwarded-For": "198.51.100.2"})
        assert [first.status_code, spoofed.status_code] == [200, 429]


# The stream's shape: one event per stage, then exactly one done or error event.
class TestStream:
    def test_the_stream_reports_each_stage_then_the_whole_turn(self, pulse):
        client = _client(pulse)
        res = client.post("/chat/stream", json={"message": QUESTION, "session_id": "s9"})
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/x-ndjson")
        events = _stream_events(res)
        assert [(e["type"], e.get("agent")) for e in events] == [
            ("start", None),
            ("retrieved", None),
            ("agent_start", "retriever"),
            ("agent_done", "retriever"),
            ("agent_start", "verifier"),
            ("agent_done", "verifier"),
            ("agent_start", "answerer"),
            ("agent_done", "answerer"),
            ("done", None),
        ]
        start, retrieved, done = events[0], events[1], events[-1]
        assert start["session_id"] == "s9" and start["agents"] == list(AGENTS)
        assert start["trace_id"] == done["trace_id"]
        assert retrieved["retrieved"] == done["retrieved"] and len(done["retrieved"]) == 3
        for e in events:
            if e["type"] == "agent_done":
                assert e["provider"] == "groq" and e["model"] == "openai/gpt-oss-20b"
                assert e["latency_ms"] >= 0 and e["output"]
        # The last event is the same object POST /chat answers with.
        plain = client.post("/chat", json={"message": QUESTION}).json()
        assert set(done) - {"type"} == set(plain)
        assert done["reply"] == "answer from openai/gpt-oss-20b"

    def test_a_failure_mid_stream_ends_with_an_error_event(self, pulse):
        stub = StubClient(fail=lambda n, kw: StatusError(503) if n >= 1 else None)
        chain = _chain(stub, {"GROQ_API_KEY": GROQ_KEY, "CHAT_PROVIDERS": "groq"})
        res = _client(pulse, chain=chain).post("/chat/stream", json={"message": "q"})
        assert res.status_code == 200
        events = _stream_events(res)
        assert events[-1]["type"] == "error"
        assert events[-1]["code"] == "provider_failed"
        assert [a["agent"] for a in events[-1]["agents"]] == ["retriever"]
        assert "status" not in events[-1]
        assert sum(e["type"] in ("done", "error") for e in events) == 1

    def test_a_refusal_comes_before_the_stream_as_plain_json(self, pulse):
        client = _client(pulse, guard=GuardSettings(ip_per_minute=1, max_concurrent=5))
        assert client.post("/chat/stream", json={"message": "q"}).status_code == 200
        res = client.post("/chat/stream", json={"message": "q"})
        assert res.status_code == 429
        assert res.headers["content-type"].startswith("application/json")
        assert res.json()["code"] == "rate_limited"

    def test_a_finished_stream_frees_its_slot(self, pulse):
        client = _client(pulse, guard=GuardSettings(max_concurrent=1, ip_per_minute=100))
        for _ in range(3):
            assert client.post("/chat/stream", json={"message": "q"}).status_code == 200
        assert client.get("/chat/health").json()["usage"]["running"] == 0


def test_an_unexpected_error_is_a_plain_500(pulse, monkeypatch):
    def broken_search(*args, **kwargs):
        raise RuntimeError("SECRET-INTERNAL-DETAIL")

    monkeypatch.setattr(local_retriever, "search", broken_search)
    res = _client(pulse).post("/chat", json={"message": "q"})
    assert res.status_code == 500
    assert res.json()["code"] == "internal"
    assert "SECRET-INTERNAL-DETAIL" not in res.text and "Traceback" not in res.text


def test_no_key_or_question_text_is_logged(pulse, caplog, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", GROQ_KEY)
    stub = StubClient(fail=lambda n, kw: StatusError(429, retry_after=120) if n == 0 else (StatusError(500) if n in (1, 2) else None))
    chain = _chain(stub, {"GROQ_API_KEY": GROQ_KEY, "CEREBRAS_API_KEY": CEREBRAS_KEY})
    with caplog.at_level(logging.DEBUG):
        res = _client(pulse, chain=chain).post("/chat", json={"message": "MY-PRIVATE-QUESTION"})
    assert res.status_code == 200
    assert "rate_limited" in caplog.text
    for secret in (GROQ_KEY, CEREBRAS_KEY, "MY-PRIVATE-QUESTION", "SECRET-PROVIDER-BODY"):
        assert secret not in caplog.text
    for secret in (GROQ_KEY, CEREBRAS_KEY, "SECRET-PROVIDER-BODY"):
        assert secret not in res.text


def test_session_id_is_generated_when_absent_or_not_a_plain_token(pulse):
    client = _client(pulse)
    assert client.post("/chat", json={"message": "q"}).json()["session_id"].startswith("sess_")
    assert client.post("/chat", json={"message": "q", "session_id": "<b>x</b>"}).json()["session_id"].startswith("sess_")


def test_cors_allows_any_localhost_port_by_default(pulse):
    client = _client(pulse)
    res = client.get("/corpus", headers={"Origin": "http://localhost:3000"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    res = client.get("/corpus", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_cors_origins_setting_allows_only_the_site(pulse):
    client = _client(pulse, env={"CHAT_CORS_ORIGINS": "https://agentpulse.example"})
    res = client.get("/chat/corpus", headers={"Origin": "https://agentpulse.example"})
    assert res.headers["access-control-allow-origin"] == "https://agentpulse.example"
    res = client.get("/chat/corpus", headers={"Origin": "http://localhost:3000"})
    assert "access-control-allow-origin" not in res.headers


def test_the_module_level_app_builds_from_the_environment_without_network():
    # Importing demo.chat_server built `app` from this process's environment. With no keys
    # set, its chain is Pollinations alone, and nothing was called to build it.
    from demo import chat_server

    assert chat_server.app is not None
    assert retrieval.EMBEDDING_MODEL == "sentence-transformers/all-MiniLM-L6-v2"
