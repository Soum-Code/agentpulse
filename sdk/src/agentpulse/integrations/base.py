"""Abstract Base Integration for AgentPulse Framework Adapters.

Defines the required lifecycle hooks for capturing agent execution,
tool use, LLM calls, handoffs, and errors.
"""

# What this file is for:
#   Defines BaseIntegration, the list of methods every agent-framework adapter must have.
#   It is an abstract class (ABC): you cannot create it directly, and a subclass that
#   skips any @abstractmethod below cannot be created either (Python raises TypeError).
#   Nothing here records anything; it only fixes the shape of the interface.
#
# How it fits in:
#   LangGraphAdapter (langgraph.py) is the working implementation (its capture_handoff does
#   nothing). LangChainAdapter and CrewAIAdapter are placeholders whose methods only raise
#   NotImplementedError.

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


# The methods come in pairs: start_agent/end_agent and start_tool/end_tool. Each start_*
# returns a span id, and the matching end_* needs that id to close the same span.
class BaseIntegration(ABC):
    """Abstract base class for all agent framework integrations."""

    # Open a span for one agent step. In: the agent's id, an optional role and pipeline name,
    # the state the agent received, and an optional parent span. Out: the new span id.
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

    # Close the span that start_agent() opened. `status` is a short text ("success" by
    # default); `error` is the exception if the step failed.
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

    # Open a span for one tool call (for example a search or a database lookup). In: the tool
    # name and its arguments. Out: the new span id.
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

    # Close the span that start_tool() opened, with the tool's result or its error.
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

    # Record that control passed from one agent to another (from_agent -> to_agent).
    # LangGraphAdapter accepts the call but does nothing with it.
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

    # Record a failure for a span that is still open.
    @abstractmethod
    def capture_error(
        self,
        span_id: str,
        error: Exception,
        context: Optional[dict] = None,
    ) -> None:
        """Record an unhandled exception or agent failure."""
        pass
