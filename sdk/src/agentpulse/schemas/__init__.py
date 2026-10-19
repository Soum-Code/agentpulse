"""Schema package."""

# What this file is for:
#   Makes the schemas folder a Python package and re-exports its main names, so you can
#   write "from agentpulse.schemas import SpanPayload" instead of naming the sub-file.
#   It holds no logic of its own.
#
# How it fits in:
#   The data classes come from events.py (the span and the batch sent to the API) and the
#   fixed-choice lists (enums) come from enums.py. Code in this repo imports from those
#   two files directly, so nothing uses this package-level shortcut yet.

# The three data classes: one span, the batch of spans sent to the API, and its reply.
from agentpulse.schemas.events import IngestRequest, IngestResponse, SpanPayload
# The enums: lists of allowed values for a span's type, kind and status, and for alerts.
from agentpulse.schemas.enums import (
    AlertSeverity,
    AlertType,
    EventType,
    SpanKind,
    SpanStatus,
)

# __all__ = the names that "from agentpulse.schemas import *" brings in. It also tells
# readers and tools which names are the public ones.
__all__ = [
    "IngestRequest",
    "IngestResponse",
    "SpanPayload",
    "AlertSeverity",
    "AlertType",
    "EventType",
    "SpanKind",
    "SpanStatus",
]
