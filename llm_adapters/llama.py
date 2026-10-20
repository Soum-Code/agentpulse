"""Llama Model Family Adapter for AgentPulse.

Supports Llama 3.1 8B Instruct and Llama 3.2 1B/3B lightweight models.
"""

# What this file is for: two adapters for Meta's Llama 3.1 models. LlamaAdapter runs the model
# through HuggingFace transformers (LocalHFAdapter does the work). LlamaGGUFAdapter runs
# Llama 3.1 8B from a local .gguf file through llama.cpp (LocalGGUFAdapter does the work).
# Each class only fills in Llama defaults and adds no new behaviour.
#
# How it fits in: get_llm_adapter() in llm_adapters/__init__.py returns LlamaGGUFAdapter when
# the name contains "llama3-gguf" or "llama-3.1-gguf", and LlamaAdapter for any other name
# that contains "llama".

from __future__ import annotations

import os
from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter
from llm_adapters.local_gguf import LocalGGUFAdapter

# Default place for the Llama model file:
# <repo root>/models/gguf/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf
# (The repo root is the folder that contains this llm_adapters folder.)
_DEFAULT_LLAMA31_GGUF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "gguf", "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
)


# Llama 3.1 8B Instruct through HuggingFace transformers. Only the default model_id differs
# from LocalHFAdapter; pass another model_id (for example a Llama 3.2 one) to change it.
class LlamaAdapter(LocalHFAdapter):
    """Specialized adapter for Meta Llama 3.1 / 3.2 instruction models."""

    # Same settings as LocalHFAdapter; only the default model_id differs.
    # cache_dir = the folder where downloaded model files are kept. load_immediately=True
    # loads the model now. If it stays False the model is never loaded, and the adapter
    # returns fixed canned text instead of real model output (see local_hf.py).
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


# Runs Llama 3.1 8B Instruct from a local .gguf file through llama.cpp (the how is in
# local_gguf.py). Q4_K_M is a label for how the weights were quantized (stored with fewer
# bits, to save memory and time). It is the Llama twin of Qwen3GGUFAdapter in qwen.py.
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

    # model_path = the .gguf file on disk (default: the path built near the top of this
    # file). n_ctx = the context window: how many tokens (prompt plus answer) the model can
    # hold at once. Extra keywords (for example n_threads or n_gpu_layers) are passed on to
    # LocalGGUFAdapter through **kwargs.
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
            # model_id is only a name for reports and results. The file that is really
            # loaded is the one at model_path.
            model_id="bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M",
            device=device,
            # If quantization is None (the factory's default), the label "Q4_K_M" is used.
            quantization=quantization or "Q4_K_M",
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            default_max_tokens=default_max_tokens,
            seed=seed,
            n_ctx=n_ctx,
            load_immediately=load_immediately,
            # "/no_think" is a Qwen3 switch, so it is never added to a Llama prompt. The value
            # is fixed here: a caller who also put qwen_think_suffix in **kwargs would get a
            # TypeError (the same keyword passed twice).
            qwen_think_suffix=False,
            **kwargs,
        )
