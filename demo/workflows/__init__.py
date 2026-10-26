"""Workflows package for AgentPulse real-model execution."""

# What this file is for: it turns this folder into a Python package and re-exports the
# three workflow builders (research, tech support, data analysis) and the local document
# search, so they can be imported from one place: `from demo.workflows import ...`.
#
# How it fits in: each create_*_workflow function lives in its own file in this folder.
# retrieval.py holds the small in-memory document search. Python runs this file before it
# loads any module in the package, so the re-exports are lazy (__getattr__ below): a name is
# imported the first time it is asked for. `import demo.workflows.retrieval` therefore loads
# the search alone. demo/chat_server.py needs nothing else, and its container has no
# langgraph, llm_adapters or reasoning, which the three workflow files import.

from __future__ import annotations

import importlib
from typing import Any

# Which module each re-exported name lives in.
_EXPORTS = {
    "local_retriever": "demo.workflows.retrieval",
    "RetrievedDocument": "demo.workflows.retrieval",
    "create_research_workflow": "demo.workflows.research_assistant",
    "create_tech_support_workflow": "demo.workflows.tech_support",
    "create_data_analysis_workflow": "demo.workflows.data_analysis",
}

# __all__ = the names that `from demo.workflows import *` hands out.
__all__ = list(_EXPORTS)


# Called by Python only for a name this module does not have yet (PEP 562).
def __getattr__(name: str) -> Any:
    if name not in _EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(importlib.import_module(_EXPORTS[name]), name)
    globals()[name] = value
    return value
