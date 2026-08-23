"""Unit tests for LLM Adapters."""

import pytest
from llm_adapters import (
    GenerationResult,
    LLMAdapter,
    LocalHFAdapter,
    QwenAdapter,
    FastDevQwenAdapter,
    LlamaAdapter,
    MistralAdapter,
    GemmaAdapter,
    get_llm_adapter,
)


def test_generation_result_dataclass():
    res = GenerationResult(
        text="Sample generated text",
        model_id="Qwen/Qwen2.5-7B-Instruct",
        latency_ms=45.2,
        tokens_in=10,
        tokens_out=5,
    )
    d = res.to_dict()
    assert d["text"] == "Sample generated text"
    assert d["model_id"] == "Qwen/Qwen2.5-7B-Instruct"
    assert d["latency_ms"] == 45.2


def test_adapter_factory_qwen():
    adapter = get_llm_adapter("qwen-7b")
    assert isinstance(adapter, QwenAdapter)
    assert adapter.model_id == "Qwen/Qwen2.5-7B-Instruct"


def test_adapter_factory_fast_dev():
    adapter = get_llm_adapter("qwen-0.5b")
    assert isinstance(adapter, FastDevQwenAdapter)
    assert adapter.model_id == "Qwen/Qwen2.5-0.5B-Instruct"


def test_adapter_factory_llama():
    adapter = get_llm_adapter("llama-8b")
    assert isinstance(adapter, LlamaAdapter)
    assert adapter.model_id == "meta-llama/Llama-3.1-8B-Instruct"


def test_adapter_factory_mistral():
    adapter = get_llm_adapter("mistral-7b")
    assert isinstance(adapter, MistralAdapter)
    assert adapter.model_id == "mistralai/Mistral-7B-Instruct-v0.3"


def test_adapter_factory_gemma():
    adapter = get_llm_adapter("gemma-9b")
    assert isinstance(adapter, GemmaAdapter)
    assert adapter.model_id == "google/gemma-2-9b-it"


def test_adapter_generate_metadata():
    adapter = get_llm_adapter("qwen-0.5b")
    res = adapter.generate_with_metadata(
        prompt="Plan research on transformers",
        prompt_version="v2.0",
        dataset_version="v1.0_dev",
    )
    assert res.text != ""
    assert res.prompt_version == "v2.0"
    assert res.dataset_version == "v1.0_dev"
    assert res.latency_ms >= 0.0
