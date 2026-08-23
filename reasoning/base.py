"""Base Reasoning Strategy Interface for AgentPulse.

Defines the contract for executing different cognitive reasoning strategies
(Direct, Chain-of-Thought, Atom of Thoughts) against an LLMAdapter.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from llm_adapters.base import LLMAdapter


@dataclass
class ReasoningOutput:
    """Standardized output from a reasoning strategy execution."""

    final_answer: str
    strategy: str  # "DIRECT", "COT", "AOT"
    extracted_claims: List[str] = field(default_factory=list)
    atomic_steps: List[Dict[str, Any]] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: float = 0.0
    strategy_version: str = "v1.0"
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ReasoningStrategy(ABC):
    """Abstract base class for reasoning strategies."""

    def __init__(self, name: str, version: str = "v1.0"):
        self.name = name.upper()
        self.version = version

    @abstractmethod
    def execute(
        self,
        adapter: LLMAdapter,
        task_prompt: str,
        context: Optional[str] = None,
        **kwargs: Any,
    ) -> ReasoningOutput:
        """Execute reasoning strategy given a task prompt and optional evidence context."""
        pass
