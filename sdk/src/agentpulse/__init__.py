"""AgentPulse SDK — Lightweight observability for multi-agent LLM systems."""

# What this file is for:
#   This is the front door of the SDK (the small library that your own agent code
#   imports to send AgentPulse its spans). It only re-exports the four names a user
#   needs, so you can write "from agentpulse import AgentPulse" instead of digging
#   into sub-modules. It also holds the SDK version string.
#
# How it fits in:
#   The names come from client.py (AgentPulse), config.py (AgentPulseConfig,
#   CapturePolicy) and context.py (TraceContext). No other code lives here.

from agentpulse.client import AgentPulse
from agentpulse.config import AgentPulseConfig, CapturePolicy
from agentpulse.context import TraceContext

__version__ = "0.1.0"

__all__ = [
    "AgentPulse",
    "AgentPulseConfig",
    "CapturePolicy",
    "TraceContext",
]
