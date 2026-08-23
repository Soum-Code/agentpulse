"""Gemma Model Family Adapter for AgentPulse.

Supports Google Gemma 2 / Gemma 3 series instruction models.
"""

from __future__ import annotations

from typing import Optional
from llm_adapters.local_hf import LocalHFAdapter


class GemmaAdapter(LocalHFAdapter):
    """Specialized adapter for Google Gemma instruction models."""

    def __init__(
        self,
        model_id: str = "google/gemma-2-9b-it",
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
