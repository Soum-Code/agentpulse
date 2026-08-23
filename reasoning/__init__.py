"""Reasoning strategies package for AgentPulse workload execution.

Exposes Direct, Chain-of-Thought (CoT), and Atom of Thoughts (AoT) strategies.
"""

from __future__ import annotations

from reasoning.base import ReasoningOutput, ReasoningStrategy
from reasoning.direct import DirectStrategy
from reasoning.cot import CoTStrategy
from reasoning.aot import AoTStrategy


def get_reasoning_strategy(strategy_name: str = "direct", **kwargs) -> ReasoningStrategy:
    """Factory function for instantiating a ReasoningStrategy."""
    s_lower = strategy_name.lower().strip()
    if s_lower == "cot" or "chain" in s_lower:
        return CoTStrategy(**kwargs)
    elif s_lower == "aot" or "atom" in s_lower:
        return AoTStrategy(**kwargs)
    else:
        return DirectStrategy(**kwargs)


__all__ = [
    "ReasoningStrategy",
    "ReasoningOutput",
    "DirectStrategy",
    "CoTStrategy",
    "AoTStrategy",
    "get_reasoning_strategy",
]
