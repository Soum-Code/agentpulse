"""CrewAI Adapter for AgentPulse (Status: PROPOSED / Post-MVP).

Planned integration for CrewAI crew, agent, and task observability.
"""

# What this file is for:
#   A placeholder for a future CrewAI adapter (CrewAI is a framework for teams of LLM
#   agents). Nothing works yet: creating CrewAIAdapter raises NotImplementedError at once.
#
# How it fits in:
#   It subclasses BaseIntegration (base.py) so the planned shape is visible. integrations/
#   __init__.py does not import it; only tests/test_integrations.py does, to check that it
#   raises.

from __future__ import annotations
from agentpulse.integrations.base import BaseIntegration


class CrewAIAdapter(BaseIntegration):
    """Placeholder for upcoming CrewAI integration (Post-MVP)."""

    # Always raises, so an object of this class can never be created: the adapter is not built
    # yet. The message names the version it is planned for.
    def __init__(self, *args, **kwargs):
        raise NotImplementedError("CrewAI integration is planned for AgentPulse v0.2.0 (Post-MVP).")

    # The methods below are stubs. They exist so that the class has every method BaseIntegration
    # requires; without them, creating the class would fail with TypeError (abstract class)
    # instead of this clearer NotImplementedError.
    def start_agent(self, *args, **kwargs) -> str:
        raise NotImplementedError

    def end_agent(self, *args, **kwargs) -> None:
        raise NotImplementedError

    def start_tool(self, *args, **kwargs) -> str:
        raise NotImplementedError

    def end_tool(self, *args, **kwargs) -> None:
        raise NotImplementedError

    def capture_handoff(self, *args, **kwargs) -> None:
        raise NotImplementedError

    def capture_error(self, *args, **kwargs) -> None:
        raise NotImplementedError
