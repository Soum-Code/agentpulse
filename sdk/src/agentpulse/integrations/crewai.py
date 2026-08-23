"""CrewAI Adapter for AgentPulse (Status: PROPOSED / Post-MVP).

Planned integration for CrewAI crew, agent, and task observability.
"""

from __future__ import annotations
from agentpulse.integrations.base import BaseIntegration


class CrewAIAdapter(BaseIntegration):
    """Placeholder for upcoming CrewAI integration (Post-MVP)."""

    def __init__(self, *args, **kwargs):
        raise NotImplementedError("CrewAI integration is planned for AgentPulse v0.2.0 (Post-MVP).")

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
