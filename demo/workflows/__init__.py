"""Workflows package for AgentPulse real-model execution."""

# What this file is for: it turns this folder into a Python package and re-exports the
# three workflow builders (research, tech support, data analysis) and the local document
# search, so they can be imported from one place: `from demo.workflows import ...`.
#
# How it fits in: each create_*_workflow function lives in its own file in this folder.
# retrieval.py holds the small in-memory document search. Python runs this file before it
# loads any module in the package, so even `import demo.workflows.retrieval` also imports
# the three workflow files (and with them langgraph).

from __future__ import annotations

from demo.workflows.retrieval import local_retriever, RetrievedDocument
from demo.workflows.research_assistant import create_research_workflow
from demo.workflows.tech_support import create_tech_support_workflow
from demo.workflows.data_analysis import create_data_analysis_workflow

# __all__ = the names that `from demo.workflows import *` hands out.
__all__ = [
    "local_retriever",
    "RetrievedDocument",
    "create_research_workflow",
    "create_tech_support_workflow",
    "create_data_analysis_workflow",
]
