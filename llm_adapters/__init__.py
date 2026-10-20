"""AgentPulse LLM Adapters Package.

Exposes model adapters and a factory function for instantiating model executors.
"""

# What this file is for: one place to import the LLM adapters from, plus a factory function,
# get_llm_adapter(name), that picks the right adapter class from a model name string. An
# adapter hides how a model is run (HuggingFace transformers or llama.cpp) behind one
# interface: generate a text, and report timing and token counts.
#
# How it fits in: the experiments/ scripts and the tests call get_llm_adapter(). The
# workflows and reasoning strategies then only use the LLMAdapter interface (base.py). The
# concrete classes live in local_hf.py, local_gguf.py, qwen.py, llama.py, mistral.py and
# gemma.py.

from __future__ import annotations

from typing import Any, Optional

from llm_adapters.base import GenerationResult, LLMAdapter
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter
from llm_adapters.qwen import FastDevQwenAdapter, Qwen3GGUFAdapter, QwenAdapter
from llm_adapters.llama import LlamaAdapter, LlamaGGUFAdapter
from llm_adapters.mistral import MistralAdapter
from llm_adapters.gemma import GemmaAdapter


# Picks and builds an adapter by looking for key words in model_name. In: a name such as
# "qwen3-8b", the device ("cpu" or "cuda"), a quantization label, and extra settings passed
# on as kwargs. Out: an LLMAdapter object.
# The transformers adapters use device to choose CPU or GPU. The GGUF adapters only record
# it (their GPU use comes from n_gpu_layers in kwargs). No adapter uses quantization to load
# the model differently: it is just a label stored in the results.
#
# load_immediately=True loads the model weights right away. The transformers-based adapters
# (local_hf.py) need it to give real output: without it they return canned text. The GGUF
# adapters (local_gguf.py) load the model on first use either way.
def get_llm_adapter(
    model_name: str = "qwen-7b",
    device: str = "cpu",
    quantization: Optional[str] = None,
    load_immediately: bool = False,
    **kwargs: Any,
) -> LLMAdapter:
    """Factory function for instantiating an LLMAdapter."""
    # Compare in lower case so "Qwen3" and "qwen3" behave the same.
    m_lower = model_name.lower()

    # The rules below are checked in order and the first match wins, so order matters.
    #   1. "qwen-0.5b" or "qwen-dev": small Qwen 2.5 0.5B via transformers (fast, for tests).
    #   2. "qwen3": Qwen3 8B GGUF through llama.cpp (real inference).
    #   3. any other "qwen": Qwen 2.5 7B via transformers.
    #   4. "llama3-gguf" or "llama-3.1-gguf": Llama 3.1 8B GGUF through llama.cpp.
    #   5. any other "llama": Llama 3.1 via transformers.
    #   6. "mistral" or "gemma": the matching transformers adapter.
    #   7. anything else: LocalHFAdapter, with model_name used as the HuggingFace model id.
    # Only rule 7 uses model_name as the model. Rules 1 to 6 use their own default model, so
    # "qwen-7b" just means "the default QwenAdapter". To change it, pass model_id (or
    # model_path for the GGUF adapters) in kwargs.
    # kwargs go straight to the adapter's constructor, so a name that adapter does not accept
    # makes Python raise a TypeError.
    if "qwen-0.5b" in m_lower or "qwen-dev" in m_lower:
        return FastDevQwenAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "qwen3" in m_lower:
        return Qwen3GGUFAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "qwen" in m_lower:
        return QwenAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
    elif "llama3-gguf" in m_lower or "llama-3.1-gguf" in m_lower:
        return LlamaGGUFAdapter(device=device, quantization=quantization, load_immediately=load_immediately, **kwargs)
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
    "LlamaGGUFAdapter",
    "MistralAdapter",
    "GemmaAdapter",
    "get_llm_adapter",
]
