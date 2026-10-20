"""Qwen Model Family Adapter for AgentPulse.

Supports Qwen 2.5 7B Instruct (primary benchmark model),
as well as fast developer models (Qwen 2.5 1.5B / 0.5B) for CI and fast iteration.
"""

# What this file is for: three adapters for Alibaba's Qwen models. QwenAdapter (Qwen 2.5) and
# FastDevQwenAdapter (a tiny 0.5B version) run through HuggingFace transformers.
# Qwen3GGUFAdapter runs Qwen3 8B through llama.cpp from a local .gguf file.
#
# How it fits in: get_llm_adapter() in llm_adapters/__init__.py returns one of these when the
# model name contains "qwen". They build on LocalHFAdapter (local_hf.py) and
# LocalGGUFAdapter (local_gguf.py), which do the real work.

from __future__ import annotations

import os
from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter

# Default place for the Qwen3 model file: <repo root>/models/gguf/Qwen3-8B-Q4_K_M.gguf.
# (The repo root is the folder that contains this llm_adapters folder.)
_DEFAULT_QWEN3_GGUF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "gguf", "Qwen3-8B-Q4_K_M.gguf",
)


# Qwen 2.5 7B through HuggingFace transformers; LocalHFAdapter does the work. Built by
# get_llm_adapter() for a "qwen" name that is not "qwen3", "qwen-0.5b" or "qwen-dev".
class QwenAdapter(LocalHFAdapter):
    """Specialized adapter for Qwen 2.5 series instruction models."""

    # Same settings as LocalHFAdapter; only the default model_id differs.
    # cache_dir = the folder where downloaded model files are kept. load_immediately=True
    # loads the model now. If it stays False the model is never loaded, and the adapter
    # returns fixed canned text instead of real model output (see local_hf.py).
    def __init__(
        self,
        model_id: str = "Qwen/Qwen2.5-7B-Instruct",
        device: str = "cpu",
        quantization: Optional[str] = None,
        default_temperature: float = 0.7,
        default_top_p: float = 0.9,
        default_max_tokens: int = 512,
        seed: Optional[int] = 42,
        cache_dir: str = "./models",
        load_immediately: bool = False,
    ):
        super().__init__(
            model_id=model_id,
            device=device,
            quantization=quantization,
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            default_max_tokens=default_max_tokens,
            seed=seed,
            cache_dir=cache_dir,
            load_immediately=load_immediately,
        )


# A QwenAdapter whose default model is much smaller (0.5B = 0.5 billion parameters), so
# smoke tests and CI run quickly. get_llm_adapter() builds it for "qwen-0.5b" and "qwen-dev".
# setdefault below keeps a model_id the caller passed in; only if there is none is the
# 0.5B model used. Every other setting goes to QwenAdapter unchanged.
class FastDevQwenAdapter(QwenAdapter):
    """Fast lightweight Qwen model (0.5B) for smoke tests and CI pipelines."""

    def __init__(self, **kwargs):
        kwargs.setdefault("model_id", "Qwen/Qwen2.5-0.5B-Instruct")
        super().__init__(**kwargs)


# Runs Qwen3 8B from a local .gguf file through llama.cpp (the how is in local_gguf.py).
# Q4_K_M is a label for how the weights were quantized (stored with fewer bits, to save
# memory and time). This class only fills in Qwen3 defaults; LocalGGUFAdapter does the work.
# Built by get_llm_adapter() for names that contain "qwen3".
class Qwen3GGUFAdapter(LocalGGUFAdapter):
    """Real local inference adapter for Qwen3-8B (Q4_K_M GGUF via llama.cpp).

    This is the adapter that actually loads real model weights -- unlike
    QwenAdapter/FastDevQwenAdapter above, which use LocalHFAdapter's
    HF-transformers path and fall back to a canned-string response unless
    `load_immediately=True` (which, prior to this adapter's introduction,
    was never actually set anywhere in the codebase).
    """

    # model_path = the .gguf file on disk (default: the path built near the top of this
    # file). n_ctx = the context window: how many tokens (prompt plus answer) the model can
    # hold at once. Extra keywords (for example n_threads, n_gpu_layers, enable_thinking) are
    # passed on to LocalGGUFAdapter through **kwargs.
    def __init__(
        self,
        model_path: str = _DEFAULT_QWEN3_GGUF_PATH,
        device: str = "cpu",
        quantization: Optional[str] = "Q4_K_M",
        default_temperature: float = 0.7,
        default_top_p: float = 0.9,
        default_max_tokens: int = 512,
        seed: Optional[int] = 42,
        n_ctx: int = 4096,
        load_immediately: bool = False,
        **kwargs,
    ):
        super().__init__(
            model_path=model_path,
            # model_id is only a name for reports and results. The file that is really
            # loaded is the one at model_path.
            model_id="Qwen/Qwen3-8B-GGUF:Q4_K_M",
            device=device,
            # The generic factory passes quantization=None by default, which
            # would erase the fact that this is a Q4_K_M build -- a detail the
            # benchmark reports must carry, since latency is quantization-specific.
            quantization=quantization or "Q4_K_M",
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            default_max_tokens=default_max_tokens,
            seed=seed,
            n_ctx=n_ctx,
            load_immediately=load_immediately,
            # Switch the "/no_think" prompt suffix on by default (explained in local_gguf.py).
            # pop takes the caller's value if one was given, and removes it from kwargs so it
            # is not passed twice; if none was given the value is True.
            qwen_think_suffix=kwargs.pop("qwen_think_suffix", True),
            **kwargs,
        )
