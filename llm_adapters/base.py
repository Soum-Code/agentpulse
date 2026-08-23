"""Base LLM Adapter Interface for AgentPulse.

Defines the contract for interacting with local and remote open-source models
while capturing rich execution metadata required for observability and drift tracking.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class GenerationResult:
    """Standardized output and execution telemetry for an LLM generation call."""

    text: str
    model_id: str
    model_revision: Optional[str] = "main"
    provider: str = "local_huggingface"
    runtime: str = "pytorch"
    device: str = "cpu"
    quantization: Optional[str] = None
    temperature: float = 0.7
    top_p: float = 0.9
    max_tokens: int = 512
    seed: Optional[int] = None
    prompt_version: str = "v1.0"
    dataset_version: Optional[str] = None
    latency_ms: float = 0.0
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class LLMAdapter(ABC):
    """Abstract base class for all LLM inference adapters."""

    def __init__(
        self,
        model_id: str,
        device: str = "cpu",
        quantization: Optional[str] = None,
        default_temperature: float = 0.7,
        default_top_p: float = 0.9,
        default_max_tokens: int = 512,
        seed: Optional[int] = 42,
    ):
        self.model_id = model_id
        self.device = device
        self.quantization = quantization
        self.default_temperature = default_temperature
        self.default_top_p = default_top_p
        self.default_max_tokens = default_max_tokens
        self.seed = seed

    @abstractmethod
    def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate response text given a prompt string."""
        pass

    @abstractmethod
    def generate_with_metadata(
        self,
        prompt: str,
        prompt_version: str = "v1.0",
        dataset_version: Optional[str] = None,
        **kwargs: Any,
    ) -> GenerationResult:
        """Generate response text and record complete execution metadata."""
        pass

    def get_model_info(self) -> Dict[str, Any]:
        """Return runtime configuration and model metadata."""
        return {
            "model_id": self.model_id,
            "device": self.device,
            "quantization": self.quantization,
            "default_temperature": self.default_temperature,
            "default_top_p": self.default_top_p,
            "default_max_tokens": self.default_max_tokens,
            "seed": self.seed,
        }
