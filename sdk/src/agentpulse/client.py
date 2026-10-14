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

# What this file is for:
#   Defines the AgentPulse class, the one object your agent code creates. It holds the
#   settings, the transport (the background sender that batches spans and posts them to
#   the API) and the privacy filter. It gives you three ways to record spans: the
#   @monitor decorator, instrument_llm() for OpenAI/Anthropic clients, and the manual
#   start_span() / end_span() pair.
#
# How it fits in:
#   Uses config.py, context.py, decorators.py, privacy.py, transport.py and
#   integrations/llm.py. integrations/langgraph.py takes an AgentPulse object and puts
#   its spans into this object's transport.

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


# One AgentPulse object owns its own settings (_config), sender (_transport) and
# privacy filter (_privacy).
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
        # Step 1: work out the settings. A ready-made `config` object wins; the separate
        # arguments above (endpoint, api_key, ...) are used only when no config is given.
        # Note: AgentPulseConfig lets AGENTPULSE_* environment variables override some values.
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
        # Step 2: create the sender (transport) and the privacy filter from those settings.
        self._transport = AsyncTransport(self._config)
        self._privacy = PrivacyFilter(self._config.capture_policy)
        # Step 3: the transport is not running yet; start() (or _ensure_transport) starts it.
        self._started = False

    async def start(self) -> None:
        """Start the SDK transport. Call this before using the SDK."""
        # Calling start() twice is harmless: the second call sees _started and does nothing.
        # transport.start() opens the HTTP session and launches the loop that sends spans.
        if not self._started:
            await self._transport.start()
            self._started = True
            logger.info("AgentPulse SDK started (service=%s)", self._config.service_name)

    async def shutdown(self) -> None:
        """Flush remaining spans and stop the transport."""
        # transport.stop() sends the spans still waiting in the buffer, then closes the session.
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
        # This runs once, when the line "@pulse.monitor(...)" is evaluated, not on every call of
        # your function. It returns a decorator, and that decorator then wraps your function.
        # Step 1: try to start the sender (transport). This works only if an asyncio event loop
        # is already running right now; at import time there usually is none (see
        # _ensure_transport below).
        # Auto-start transport if needed
        self._ensure_transport()

        # Step 2: build the real decorator. The wrapping logic lives in decorators.py; this method
        # only passes in the shared transport, settings and privacy filter, plus the per-agent
        # options (id, role, span kind, event type, capture_state).
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

    def instrument_llm(self, client: Any, agent_id: Optional[str] = None) -> Any:
        """Record a span for every completion this client produces.

        Works with the OpenAI and Anthropic SDKs, sync or async, and needs no
        agent framework -- which is the point. The `@monitor` decorator reads its
        first argument as a LangGraph state dict, so anyone not using LangGraph
        had no way in. Every agent calls an LLM, so wrapping that call reaches
        all of them.

        It is also the most useful place to capture from: the prompt and the
        completion are exactly the input/output pair the grounding evaluator
        compares, so this is what makes grounding available off LangGraph.

            pulse = AgentPulse(endpoint="http://localhost:8000",
                               capture_inputs=True, capture_outputs=True)
            client = pulse.instrument_llm(OpenAI())

        Returns the same client, wrapped in place. Calling it twice on one
        client is a no-op rather than emitting two spans per call.

        The capture flags still apply. With both false -- the default -- spans
        carry hashes and token counts but no text, and grounding cannot run on
        them. `/v1/platform` reports that as a grounding coverage of 0.0.

        Raises UnsupportedClientError if `client` is not an OpenAI or Anthropic
        client, rather than silently instrumenting nothing.
        """
        # Imported here, not at the top of the file: the integrations package imports
        # integrations/langgraph.py, which imports this file, so a top-level import would
        # be circular.
        from agentpulse.integrations.llm import instrument_client

        self._ensure_transport()
        # instrument_client (integrations/llm.py) swaps the client's completion method for a
        # recording wrapper, then returns the same client object.
        return instrument_client(
            client,
            transport=self._transport,
            config=self._config,
            privacy=self._privacy,
            agent_id=agent_id,
        )

    def create_trace(self, pipeline_id: Optional[str] = None) -> TraceContext:
        """Manually create a new trace context.
        
        Useful for non-decorator workflows or explicit trace management.
        """
        # A new random trace id is made here. The pipeline id falls back to the one in the settings.
        # The context is only returned, not installed as the "current" one (see context.py), so
        # pass it to start_span(trace_context=...) yourself.
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
        # Step 1: use the trace context you passed in, or start a brand-new trace if none was given.
        ctx = trace_context or TraceContext()
        # Step 2: build the span with a new random span id. The parent comes from the context and
        # the start time is now. Extra keyword arguments (**kwargs) go straight to SpanPayload, for
        # example model or input_summary. They are not redacted, and the enabled and sampling
        # settings are not checked. Nothing is sent yet; end_span() queues it.
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
        # Step 1: stamp the finish time and the final status.
        span.end_time = utc_now()
        span.status = status
        # Step 2: latency in milliseconds = (end - start) in seconds * 1000, rounded to 2 decimals.
        if span.start_time and span.end_time:
            delta = (span.end_time - span.start_time).total_seconds() * 1000
            span.latency_ms = round(delta, 2)
        # Step 3: hand the finished span to the transport. It is sent later in a batch, so this
        # call does not wait for the network. Nothing here starts the transport: unless it is
        # running (see start()), the span just waits in the buffer.
        self._transport.enqueue(span)

    # Counters kept by the transport: spans buffered, sent, failed, written to the fallback
    # file, and dropped because the buffer was full.
    @property
    def stats(self) -> dict[str, Any]:
        """Get transport statistics."""
        return self._transport.stats

    @property
    def config(self) -> AgentPulseConfig:
        """The settings object this client was built with."""
        return self._config

    def _ensure_transport(self) -> None:
        """Auto-start transport on first use if not manually started."""
        if not self._started:
            # start() is async, so it can only be scheduled when an event loop (asyncio's task
            # runner) is already running. If one is, schedule start() there as a background task.
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.start())
            # get_running_loop() raises RuntimeError when no loop is running. Then nothing here
            # starts the transport, and nothing retries by itself (only another monitor() or
            # instrument_llm() call made while a loop is running would try again). Spans pile up
            # in the buffer (capped by max_buffered_spans in config.py; the oldest are dropped
            # first) until you run `await pulse.start()`. The comment just below, saying the
            # transport will start on the first async call, is out of date: nothing does that.
            except RuntimeError:
                # No running loop — transport will start on first async call
                pass
