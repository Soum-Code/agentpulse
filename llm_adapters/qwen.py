"""Qwen Model Family Adapter for AgentPulse.

Supports Qwen 2.5 7B Instruct (primary benchmark model),
as well as fast developer models (Qwen 2.5 1.5B / 0.5B) for CI and fast iteration.
"""

from __future__ import annotations

import os
from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter

_DEFAULT_QWEN3_GGUF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "gguf", "Qwen3-8B-Q4_K_M.gguf",
)


class QwenAdapter(LocalHFAdapter):
    """Specialized adapter for Qwen 2.5 series instruction models."""

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


class FastDevQwenAdapter(QwenAdapter):
    """Fast lightweight Qwen model (0.5B) for smoke tests and CI pipelines."""

    def __init__(self, **kwargs):
        kwargs.setdefault("model_id", "Qwen/Qwen2.5-0.5B-Instruct")
        super().__init__(**kwargs)


class Qwen3GGUFAdapter(LocalGGUFAdapter):
    """Real local inference adapter for Qwen3-8B (Q4_K_M GGUF via llama.cpp).

    This is the adapter that actually loads real model weights -- unlike
    QwenAdapter/FastDevQwenAdapter above, which use LocalHFAdapter's
    HF-transformers path and fall back to a canned-string response unless
    `load_immediately=True` (which, prior to this adapter's introduction,
    was never actually set anywhere in the codebase).
    """

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
            qwen_think_suffix=kwargs.pop("qwen_think_suffix", True),
            **kwargs,
        )
