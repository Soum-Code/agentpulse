"""Llama Model Family Adapter for AgentPulse.

Supports Llama 3.1 8B Instruct and Llama 3.2 1B/3B lightweight models.
"""

from __future__ import annotations

import os
from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter

_DEFAULT_LLAMA31_GGUF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "gguf", "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
)


class LlamaAdapter(LocalHFAdapter):
    """Specialized adapter for Meta Llama 3.1 / 3.2 instruction models."""

    def __init__(
        self,
        model_id: str = "meta-llama/Llama-3.1-8B-Instruct",
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


class LlamaGGUFAdapter(LocalGGUFAdapter):
    """Real local inference adapter for Llama 3.1 8B Instruct (Q4_K_M GGUF via llama.cpp).

    Meta does not publish an official GGUF release the way the Qwen team does
    for Qwen3 -- the model weights ship as safetensors. `bartowski` is one of
    the most widely-used and trusted third-party GGUF quantizers in the
    llama.cpp community (correct quantization of the official Meta weights,
    not a fine-tune or unofficial variant), so
    `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF` is used here -- the closest
    equivalent available to the first-party release used for Qwen3.

    Unlike LlamaAdapter above (LocalHFAdapter-based, falls back to a canned
    response unless load_immediately=True is set somewhere), this adapter
    always does real llama.cpp inference, same guarantee as Qwen3GGUFAdapter.
    """

    def __init__(
        self,
        model_path: str = _DEFAULT_LLAMA31_GGUF_PATH,
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
            model_id="bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M",
            device=device,
            quantization=quantization or "Q4_K_M",
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            default_max_tokens=default_max_tokens,
            seed=seed,
            n_ctx=n_ctx,
            load_immediately=load_immediately,
            qwen_think_suffix=False,
            **kwargs,
        )
