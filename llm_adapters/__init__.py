"""AgentPulse LLM Adapters Package.

Exposes model adapters and a factory function for instantiating model executors.
"""

from __future__ import annotations

from typing import Any, Optional

from llm_adapters.base import GenerationResult, LLMAdapter
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter
from llm_adapters.qwen import FastDevQwenAdapter, Qwen3GGUFAdapter, QwenAdapter
from llm_adapters.llama import LlamaAdapter
from llm_adapters.mistral import MistralAdapter
from llm_adapters.gemma import GemmaAdapter


def get_llm_adapter(
    model_name: str = "qwen-7b",
    device: str = "cpu",
    quantization: Optional[str] = None,
    load_immediately: bool = False,
    **kwargs: Any,
) -> LLMAdapter:
    """Factory function for instantiating an LLMAdapter."""
    m_lower = model_name.lower()

    if "qwen-0.5b" in m_lower or "qwen-dev" in m_lower:
        return FastDevQwenAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "qwen3" in m_lower:
        return Qwen3GGUFAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "qwen" in m_lower:
        return QwenAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "llama" in m_lower:
        return LlamaAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "mistral" in m_lower:
        return MistralAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "gemma" in m_lower:
        return GemmaAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    else:
        return LocalHFAdapter(model_id=model_name, device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)


__all__ = [
    "LLMAdapter",
    "GenerationResult",
    "LocalHFAdapter",
    "LocalGGUFAdapter",
    "QwenAdapter",
    "FastDevQwenAdapter",
    "Qwen3GGUFAdapter",
    "LlamaAdapter",
    "MistralAdapter",
    "GemmaAdapter",
    "get_llm_adapter",
]
