"""Workflows package for AgentPulse real-model execution."""

from __future__ import annotations

from demo.workflows.retrieval import local_retriever, RetrievedDocument
from demo.workflows.research_assistant import create_research_workflow
from demo.workflows.tech_support import create_tech_support_workflow
from demo.workflows.data_analysis import create_data_analysis_workflow

__all__ = [
    "local_retriever",
    "RetrievedDocument",
    "create_research_workflow",
    "create_tech_support_workflow",
    "create_data_analysis_workflow",
]
