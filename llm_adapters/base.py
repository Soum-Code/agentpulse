"""Base LLM Adapter Interface for AgentPulse.

Defines the contract for interacting with local and remote open-source models
while capturing rich execution metadata required for observability and drift tracking.
"""

# What this file is for: it defines the two things every LLM adapter shares. GenerationResult
# is the record returned for one LLM call (the text plus settings, timing and token counts).
# LLMAdapter is the abstract base class (a class that cannot be used on its own; subclasses
# must fill in its abstract methods) that says what an adapter must be able to do.
#
# How it fits in: local_hf.py and local_gguf.py subclass LLMAdapter; qwen.py, llama.py,
# mistral.py and gemma.py subclass those. The reasoning strategies (reasoning/) call
# adapter.generate_with_metadata() and read the GenerationResult.

from __future__ import annotations

# Note: `time` is imported but not used in this file.
import time
# ABC / abstractmethod = the tools for an abstract base class (see LLMAdapter below).
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


# The record of one LLM call. @dataclass writes the boilerplate (__init__ and so on) for a
# class that mainly holds fields. The defaults below are only fallbacks; the adapters fill
# in the real values.
@dataclass
class GenerationResult:
    """Standardized output and execution telemetry for an LLM generation call."""

    # The generated answer, and which model made it (a model id or a file path).
    text: str
    model_id: str
    # Version label of the model files. Both adapters in this folder always write "main".
    model_revision: Optional[str] = "main"
    # Where and how it ran. The defaults describe the transformers adapter; the GGUF
    # adapter writes "local_gguf" and "llama.cpp". "device" is the label the adapter was
    # given, "cpu" or "cuda" (GPU). "quantization" is a label such as "Q4_K_M" (weights
    # stored with fewer bits).
    provider: str = "local_huggingface"
    runtime: str = "pytorch"
    device: str = "cpu"
    quantization: Optional[str] = None
    # Settings used for this call. temperature = how random the word choice is (low means
    # more predictable). top_p = only the most likely words whose chances add up to this
    # share are considered. max_tokens = limit on the answer length, counted in tokens
    # (small pieces of words). seed = makes the random choices repeatable.
    temperature: float = 0.7
    top_p: float = 0.9
    max_tokens: int = 512
    seed: Optional[int] = None
    # Free labels the caller sets so runs of an experiment can be told apart later.
    prompt_version: str = "v1.0"
    dataset_version: Optional[str] = None
    # Time the call took, in milliseconds, and how many tokens went in and came out.
    latency_ms: float = 0.0
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    # When this record was created: current UTC time as ISO text.
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    # Extra facts specific to one adapter (the GGUF adapter fills this in; the
    # transformers adapter leaves it empty).
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    # Plain-dict version of the record (asdict also converts nested values).
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# What every adapter must offer. It stores the model's default settings; subclasses add the
# code that really runs a model. Per-call settings (temperature and so on) fall back to
# these defaults when the caller does not pass them. Each real adapter does that fallback
# itself, with kwargs.get("temperature", self.default_temperature); this base class does not.
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
        # Keep the model's identity and the default call settings on the object.
        self.model_id = model_id
        self.device = device
        self.quantization = quantization
        self.default_temperature = default_temperature
        self.default_top_p = default_top_p
        self.default_max_tokens = default_max_tokens
        self.seed = seed

    # Subclasses must write this. It returns only the answer text. The extra keyword
    # arguments are per-call settings such as temperature, top_p, max_tokens and seed.
    @abstractmethod
    def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate response text given a prompt string."""
        pass

    # Subclasses must write this too. Same as generate(), but returns a GenerationResult
    # (text, settings used, latency, token counts). prompt_version and dataset_version are
    # labels that are copied into the result.
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

    # Not abstract: a ready-made helper that returns the stored settings as a dict.
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
