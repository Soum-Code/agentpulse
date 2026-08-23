"""Llama Model Family Adapter for AgentPulse.

Supports Llama 3.1 8B Instruct and Llama 3.2 1B/3B lightweight models.
"""

from __future__ import annotations

from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter


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
