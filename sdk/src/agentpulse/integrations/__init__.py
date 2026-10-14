"""Integrations package for AgentPulse.

Exports supported framework adapters.
"""

# What this file is for:
#   Makes the integrations folder a package and re-exports its main pieces. An
#   "integration" is code that connects AgentPulse to some other library: an agent
#   framework such as LangGraph, or an LLM client such as OpenAI or Anthropic.
#
# How it fits in:
#   BaseIntegration (base.py) is the shared interface. LangGraph support is in
#   langgraph.py; the OpenAI/Anthropic wrapper is in llm.py. The LangChain and CrewAI
#   adapters are not imported here: they are placeholders (see langchain.py, crewai.py).

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
