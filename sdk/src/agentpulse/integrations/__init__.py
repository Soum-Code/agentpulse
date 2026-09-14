"""Integrations package for AgentPulse.

Exports supported framework adapters.
"""

from __future__ import annotations

from agentpulse.integrations.base import BaseIntegration
from agentpulse.integrations.langgraph import LangGraphAdapter, instrument_graph, create_langgraph_monitor
from agentpulse.integrations.llm import (
    UnsupportedClientError,
    detect_provider,
    instrument_client,
)

__all__ = [
    "BaseIntegration",
    "LangGraphAdapter",
    "instrument_graph",
    "create_langgraph_monitor",
    # Framework-independent: wraps an OpenAI or Anthropic client directly.
    # Normally reached through AgentPulse.instrument_llm() rather than imported.
    "instrument_client",
    "detect_provider",
    "UnsupportedClientError",
]
