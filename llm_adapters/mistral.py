"""Mistral Model Family Adapter for AgentPulse.

Supports Mistral 7B Instruct v0.3 and Ministral models.
"""

# What this file is for: the adapter for Mistral models. It adds no behaviour of its own. It
# only sets a default model id ("mistralai/Mistral-7B-Instruct-v0.3") and passes every
# setting on to LocalHFAdapter, which does all the work.
#
# How it fits in: get_llm_adapter() in llm_adapters/__init__.py returns this class when the
# model name contains "mistral". It runs the model with HuggingFace transformers (local_hf.py).

from __future__ import annotations

from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter


# Mistral through HuggingFace transformers; LocalHFAdapter does the work.
class MistralAdapter(LocalHFAdapter):
    """Specialized adapter for Mistral instruction models."""

    # Same settings as LocalHFAdapter; only the default model_id differs.
    # cache_dir = the folder where downloaded model files are kept. load_immediately=True
    # loads the model now. If it stays False the model is never loaded, and the adapter
    # returns fixed canned text instead of real model output (see local_hf.py).
    def __init__(
        self,
        model_id: str = "mistralai/Mistral-7B-Instruct-v0.3",
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
