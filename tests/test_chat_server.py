"""Tests for demo/chat_server.py.

The model client is a recording fake: it is the one thing that cannot be real in
a unit test, and what matters here is what the server sends it and what it does
with the answer. Retrieval is the real local index, and spans are the real SDK's,
captured at the transport's enqueue so nothing leaves the process.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

import pytest
from fastapi.testclient import TestClient

from agentpulse import AgentPulse
from agentpulse.schemas.enums import SpanStatus
from demo.chat_server import AGENTS, ChatConfig, create_app, resolve_config
from demo.workflows.retrieval import local_retriever


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Usage:
    prompt_tokens = 11
    completion_tokens = 7


class _Response:
    def __init__(self, content):
        self.choices = [_Choice(content)]
        self.usage = _Usage()


class FakeClient:
    """Answers per model name, records every prompt, can be made to fail."""

    def __init__(self, replies=None, fail_on=None, empty_on=None):
        self.replies = replies or {}
        self.fail_on = fail_on
        self.empty_on = empty_on
        self.prompts = []
        self.chat = self
        self.completions = self

    def create(self, model, messages, max_tokens):
        self.prompts.append((model, messages[0]["content"]))
        if model == self.fail_on:
            raise RuntimeError("upstream 500")
        if model == self.empty_on:
            return _Response("")
        return _Response(self.replies.get(model, f"answer from {model}"))


def _config(key="k"):
    return ChatConfig(
        provider="nvidia",
        models={a: f"model-{a}" for a in AGENTS},
        api_key=key,
        key_env="NVIDIA_API_KEY",
    )


@pytest.fixture
def spans():
    return []


@pytest.fixture
def pulse(spans):
    p = AgentPulse(endpoint="http://unused", capture_inputs=True, capture_outputs=True)
    p._transport.enqueue = spans.append
    return p


def _client(pulse, llm, config=None):
    return TestClient(create_app(config or _config(), llm_client=llm, pulse=pulse))


def test_corpus_lists_the_real_index_titles(pulse):
    body = _client(pulse, FakeClient()).get("/corpus").json()
    assert body["documents"] == [d["title"] for d in local_retriever.corpus]
    assert body["documents"]


def test_chat_runs_three_agents_in_order(pulse, spans):
    llm = FakeClient()
    res = _client(pulse, llm).post(
        "/chat", json={"message": "How does self-attention work?", "session_id": "s1"}
    )
    assert res.status_code == 200
    body = res.json()

    assert body["session_id"] == "s1"
    assert [a["agent"] for a in body["agents"]] == ["retriever", "verifier", "answerer"]
    assert [a["model"] for a in body["agents"]] == [f"model-{a}" for a in AGENTS]
    assert body["reply"] == "answer from model-answerer"
    assert body["verifier_verdict"] == "answer from model-verifier"
    assert body["trace_id"]
    assert all(a["latency_ms"] >= 0 for a in body["agents"])


def test_retrieved_titles_come_from_the_index_not_the_model(pulse):
    body = _client(pulse, FakeClient()).post("/chat", json={"message": "transformers"}).json()
    titles = {d["title"] for d in local_retriever.corpus}
    assert len(body["retrieved"]) == 3
    assert set(body["retrieved"]) <= titles


def test_each_agent_emits_one_span_in_one_trace(pulse, spans):
    body = _client(pulse, FakeClient()).post("/chat", json={"message": "q"}).json()
    assert [s.agent_id for s in spans] == ["retriever", "verifier", "answerer"]
    assert {s.trace_id for s in spans} == {body["trace_id"]}
    assert all(s.status == SpanStatus.SUCCESS for s in spans)


def test_retriever_span_carries_the_real_tool_result(pulse, spans):
    body = _client(pulse, FakeClient()).post("/chat", json={"message": "q"}).json()
    retriever = spans[0]
    assert retriever.tool_name == "local_retriever"
    assert retriever.tool_result_summary == "Found 3 documents: " + "; ".join(body["retrieved"])


def test_grounding_input_is_the_evidence_not_the_prompt(pulse, spans):
    _client(pulse, FakeClient()).post("/chat", json={"message": "What is attention?"})
    for span in spans:
        assert "Question:" not in span.input_summary
        assert "Write one sentence" not in span.input_summary
    # Whichever three documents came back, their text is what was recorded.
    assert any(d["content"][:40] in spans[2].input_summary for d in local_retriever.corpus)


def test_retriever_is_not_told_to_use_the_extractors_phrasing(pulse):
    llm = FakeClient()
    _client(pulse, llm).post("/chat", json={"message": "q"})
    retriever_prompt = next(p for m, p in llm.prompts if m == "model-retriever")
    assert "Retrieved N documents" not in retriever_prompt
    assert "in the form" not in retriever_prompt


def test_missing_credential_is_503_and_names_the_variable(pulse, spans):
    llm = FakeClient()
    res = _client(pulse, llm, _config(key=None)).post("/chat", json={"message": "q"})
    assert res.status_code == 503
    assert "NVIDIA_API_KEY" in res.json()["error"]
    assert res.json()["agents"] == []
    assert llm.prompts == [] and spans == []


def test_failing_agent_is_502_with_partial_agents_and_an_error_span(pulse, spans):
    llm = FakeClient(fail_on="model-verifier")
    res = _client(pulse, llm).post("/chat", json={"message": "q"})
    assert res.status_code == 502
    body = res.json()
    assert "verifier" in body["error"] and "model-verifier" in body["error"]
    assert [a["agent"] for a in body["agents"]] == ["retriever"]
    assert body["trace_id"]
    assert [s.status for s in spans] == [SpanStatus.SUCCESS, SpanStatus.ERROR]
    assert spans[1].output_summary is None
    assert "upstream 500" in spans[1].error_message


def test_empty_completion_is_a_failure_not_a_blank_reply(pulse, spans):
    llm = FakeClient(empty_on="model-answerer")
    res = _client(pulse, llm).post("/chat", json={"message": "q"})
    assert res.status_code == 502
    assert "EmptyCompletion" in res.json()["error"]
    assert spans[-1].status == SpanStatus.ERROR


def test_empty_message_is_rejected(pulse):
    assert _client(pulse, FakeClient()).post("/chat", json={"message": ""}).status_code == 422


def test_session_id_is_generated_when_absent(pulse):
    body = _client(pulse, FakeClient()).post("/chat", json={"message": "q"}).json()
    assert body["session_id"].startswith("sess_")


def test_health_reports_config_without_leaking_the_key(pulse):
    body = _client(pulse, FakeClient()).get("/health").json()
    assert body["provider"] == "nvidia"
    assert body["key_configured"] is True
    assert "api_key" not in body and "k" not in body.values()


def test_cors_allows_any_localhost_port(pulse):
    res = _client(pulse, FakeClient()).get("/corpus", headers={"Origin": "http://localhost:3000"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    res = _client(pulse, FakeClient()).get("/corpus", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


class TestResolveConfig:
    def test_picks_the_provider_whose_key_is_set(self):
        cfg = resolve_config({"OPENROUTER_API_KEY": "x"})
        assert cfg.provider == "openrouter" and cfg.key_configured

    def test_no_keys_defaults_to_nvidia_unconfigured(self):
        cfg = resolve_config({})
        assert cfg.provider == "nvidia" and not cfg.key_configured

    def test_model_override(self):
        cfg = resolve_config({"NVIDIA_API_KEY": "x", "CHAT_MODEL_VERIFIER": "my/model"})
        assert cfg.models["verifier"] == "my/model"
        assert cfg.models["retriever"] != "my/model"

    def test_answerer_uses_the_pipelines_analyst_model(self):
        from demo.multi_model_pipeline import NVIDIA_AGENT_MODELS

        cfg = resolve_config({"NVIDIA_API_KEY": "x"})
        assert cfg.models["answerer"] == NVIDIA_AGENT_MODELS["analyst"]

    def test_keyless_provider_needs_no_key(self):
        assert resolve_config({"CHAT_PROVIDER": "pollinations"}).key_configured

    def test_base_url_override(self):
        cfg = resolve_config({"CHAT_BASE_URL": "http://localhost:9/v1"})
        assert cfg.base_url == "http://localhost:9/v1"

    def test_unknown_provider_is_an_error(self):
        with pytest.raises(ValueError):
            resolve_config({"CHAT_PROVIDER": "nope"})
