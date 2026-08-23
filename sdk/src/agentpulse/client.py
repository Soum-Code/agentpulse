"""AgentPulse client — the main entry point for SDK users.

Usage:
    from agentpulse import AgentPulse

    # Simple
    pulse = AgentPulse(endpoint="http://localhost:8000")

    @pulse.monitor(agent_id="my_agent")
    async def my_node(state):
        ...

    # With configuration
    pulse = AgentPulse(
        endpoint="http://localhost:8000",
        api_key="my-key",
        pipeline_id="research_pipeline",
        capture_inputs=True,
    )

    # Lifecycle
    await pulse.start()
    ...
    await pulse.shutdown()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Optional

from agentpulse.config import AgentPulseConfig, CapturePolicy
from agentpulse.context import TraceContext
from agentpulse.decorators import create_monitor_decorator
from agentpulse.privacy import PrivacyFilter
from agentpulse.schemas.enums import EventType, SpanKind, SpanStatus
from agentpulse.schemas.events import SpanPayload
from agentpulse.transport import AsyncTransport
from agentpulse.utils import generate_span_id, generate_trace_id, utc_now

logger = logging.getLogger("agentpulse")


class AgentPulse:
    """Main client for the AgentPulse observability SDK.
    
    Provides:
    - .monitor() decorator for agent nodes
    - .start_span() / .end_span() for manual instrumentation
    - .start() / .shutdown() lifecycle management
    - .create_trace() for explicit trace creation
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        service_name: str = "default",
        pipeline_id: Optional[str] = None,
        enabled: bool = True,
        fail_open: bool = True,
        sampling_rate: float = 1.0,
        capture_inputs: bool = False,
        capture_outputs: bool = False,
        capture_tool_results: bool = False,
        max_field_length: int = 2000,
        batch_size: int = 10,
        flush_interval_ms: int = 100,
        config: Optional[AgentPulseConfig] = None,
    ) -> None:
        if config is not None:
            self._config = config
        else:
            capture_policy = CapturePolicy(
                capture_inputs=capture_inputs,
                capture_outputs=capture_outputs,
                capture_tool_results=capture_tool_results,
                max_field_length=max_field_length,
            )
            self._config = AgentPulseConfig(
                endpoint=endpoint,
                api_key=api_key,
                service_name=service_name,
                pipeline_id=pipeline_id,
                enabled=enabled,
                fail_open=fail_open,
                sampling_rate=sampling_rate,
                capture_policy=capture_policy,
                batch_size=batch_size,
                flush_interval_ms=flush_interval_ms,
            )
        self._transport = AsyncTransport(self._config)
        self._privacy = PrivacyFilter(self._config.capture_policy)
        self._started = False

    async def start(self) -> None:
        """Start the SDK transport. Call this before using the SDK."""
        if not self._started:
            await self._transport.start()
            self._started = True
            logger.info("AgentPulse SDK started (service=%s)", self._config.service_name)

    async def shutdown(self) -> None:
        """Flush remaining spans and stop the transport."""
        if self._started:
            await self._transport.stop()
            self._started = False
            logger.info("AgentPulse SDK shutdown complete")

    def monitor(
        self,
        agent_id: Optional[str] = None,
        role: Optional[str] = None,
        span_kind: SpanKind = SpanKind.AGENT,
        event_type: EventType = EventType.AGENT_EXECUTION,
        capture_state: bool = True,
    ) -> Callable:
        """Decorator to instrument an agent node function.
        
        Args:
            agent_id: Unique identifier for this agent. Defaults to function name.
            role: Semantic role (e.g., "researcher", "verifier").
            span_kind: Type of span (AGENT, TOOL, LLM, etc.).
            event_type: Event classification.
            capture_state: Whether to capture input/output state.
            
        Returns:
            Decorated function that transparently captures telemetry.
        """
        # Auto-start transport if needed
        self._ensure_transport()

        return create_monitor_decorator(
            transport=self._transport,
            config=self._config,
            privacy=self._privacy,
            agent_id=agent_id,
            agent_role=role,
            span_kind=span_kind,
            event_type=event_type,
            capture_state=capture_state,
        )

    def create_trace(self, pipeline_id: Optional[str] = None) -> TraceContext:
        """Manually create a new trace context.
        
        Useful for non-decorator workflows or explicit trace management.
        """
        return TraceContext(
            trace_id=generate_trace_id(),
            pipeline_id=pipeline_id or self._config.pipeline_id,
        )

    def start_span(
        self,
        agent_id: str,
        trace_context: Optional[TraceContext] = None,
        **kwargs: Any,
    ) -> SpanPayload:
        """Manually start a span for low-level instrumentation.
        
        Returns the span payload — call end_span() when done.
        """
        ctx = trace_context or TraceContext()
        span = SpanPayload(
            trace_id=ctx.trace_id,
            span_id=generate_span_id(),
            parent_span_id=ctx.parent_span_id,
            agent_id=agent_id,
            start_time=utc_now(),
            **kwargs,
        )
        return span

    def end_span(self, span: SpanPayload, status: SpanStatus = SpanStatus.SUCCESS) -> None:
        """Finalize and enqueue a manually started span."""
        span.end_time = utc_now()
        span.status = status
        if span.start_time and span.end_time:
            delta = (span.end_time - span.start_time).total_seconds() * 1000
            span.latency_ms = round(delta, 2)
        self._transport.enqueue(span)

    @property
    def stats(self) -> dict[str, Any]:
        """Get transport statistics."""
        return self._transport.stats

    @property
    def config(self) -> AgentPulseConfig:
        return self._config

    def _ensure_transport(self) -> None:
        """Auto-start transport on first use if not manually started."""
        if not self._started:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.start())
            except RuntimeError:
                # No running loop — transport will start on first async call
                pass
