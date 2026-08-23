"""Abstract Base Integration for AgentPulse Framework Adapters.

Defines the required lifecycle hooks for capturing agent execution,
tool use, LLM calls, handoffs, and errors.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseIntegration(ABC):
    """Abstract base class for all agent framework integrations."""

    @abstractmethod
    def start_agent(
        self,
        agent_id: str,
        role: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        input_state: Optional[Any] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        """Called when an agent node begins execution.
        
        Returns:
            span_id: Generated span identifier for this execution step.
        """
        pass

    @abstractmethod
    def end_agent(
        self,
        span_id: str,
        output_state: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        """Called when an agent node completes or fails execution."""
        pass

    @abstractmethod
    def start_tool(
        self,
        tool_name: str,
        tool_args: Optional[dict] = None,
        agent_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> str:
        """Called when an agent invokes an external tool.
        
        Returns:
            span_id: Generated span identifier for the tool call.
        """
        pass

    @abstractmethod
    def end_tool(
        self,
        span_id: str,
        result: Optional[Any] = None,
        status: str = "success",
        error: Optional[Exception] = None,
    ) -> None:
        """Called when a tool invocation returns a result or fails."""
        pass

    @abstractmethod
    def capture_handoff(
        self,
        from_agent: str,
        to_agent: str,
        state_payload: Optional[dict] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Called when execution control transfers between agents."""
        pass

    @abstractmethod
    def capture_error(
        self,
        span_id: str,
        error: Exception,
        context: Optional[dict] = None,
    ) -> None:
        """Record an unhandled exception or agent failure."""
        pass
