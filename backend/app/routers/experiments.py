"""REST endpoints for Experiments, Datasets, and Trace Curation.

Provides:
- GET /v1/experiments: list experiment runs
- GET /v1/experiments/{id}: detail for specific experiment
- GET /v1/datasets: list versioned datasets
- GET /v1/datasets/{name}: list test cases in dataset
- POST /v1/datasets/{name}/cases: curate trace / incident into dataset
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import DatasetCase, ExperimentRun

logger = logging.getLogger("agentpulse.api.experiments")

router = APIRouter(prefix="/v1", tags=["experiments", "datasets"])


class CurateCaseRequest(BaseModel):
    """Payload to curate a trace into a dataset test case."""

    case_id: str
    input_query: str
    agent_claim: str
    evidence: Optional[str] = None
    expected_classification: str = "SUPPORTED"
    expected_failure_type: str = "NO_FAILURE"
    is_failure: bool = False
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    domain: str = "general"
    operator_notes: Optional[str] = None


@router.get("/experiments")
async def list_experiments(
    limit: int = Query(default=20, ge=1, le=100),
) -> Dict[str, Any]:
    """List recent experiment runs."""
    # Check results folder for file-based experiment results
    results_dir = Path(__file__).parent.parent.parent.parent / "experiments" / "results"
    file_experiments = []
    if results_dir.exists():
        for p in results_dir.glob("*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    file_experiments.append({
                        "file": p.name,
                        "timestamp": data.get("timestamp"),
                        "model": data.get("model"),
                        "dataset": data.get("dataset"),
                        "data": data,
                    })
            except Exception as e:
                logger.warning("Error reading experiment file %s: %s", p, e)

    # Check DB
    async with get_session() as session:
        query = select(ExperimentRun).order_by(ExperimentRun.created_at.desc()).limit(limit)
        result = await session.execute(query)
        db_runs = result.scalars().all()

        return {
            "experiments": [
                {
                    "experiment_id": r.experiment_id,
                    "name": r.name,
                    "model_name": r.model_name,
                    "reasoning_strategy": r.reasoning_strategy,
                    "dataset_version": r.dataset_version,
                    "precision": r.precision,
                    "recall": r.recall,
                    "f1_score": r.f1_score,
                    "mean_risk": r.mean_risk,
                    "mean_latency_ms": r.mean_latency_ms,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in db_runs
            ],
            "file_experiments": file_experiments,
        }


def _case_to_dict(case: DatasetCase) -> Dict[str, Any]:
    return {
        "id": case.case_id,
        "domain": case.domain,
        "input_query": case.input_query,
        "evidence": case.evidence,
        "agent_claim": case.agent_claim,
        "expected_classification": case.expected_classification,
        "expected_failure_type": case.expected_failure_type,
        "is_failure": case.is_failure,
        "trace_id": case.trace_id,
        "span_id": case.span_id,
        "operator_notes": case.operator_notes,
    }


@router.get("/datasets")
async def list_datasets() -> Dict[str, Any]:
    """List available versioned datasets.

    Two sources, since curation writes to the DB but the original
    dev/val/test splits ship as static files: file-based datasets under
    datasets/*.json, plus any dataset_version present in the dataset_cases
    table (e.g. "v1.0_curated", written by POST /datasets/{name}/cases) that
    doesn't already correspond to a file.
    """
    datasets_dir = Path(__file__).parent.parent.parent.parent / "datasets"
    available_datasets = []
    file_versions: set[str] = set()

    if datasets_dir.exists():
        for p in datasets_dir.glob("*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    version = data.get("dataset_version")
                    if version:
                        file_versions.add(version)
                    available_datasets.append({
                        "filename": p.name,
                        "dataset_name": data.get("dataset_name"),
                        "dataset_version": version,
                        "split": data.get("split"),
                        "total_cases": len(data.get("cases", [])),
                        "description": data.get("description"),
                    })
            except Exception as e:
                logger.warning("Error reading dataset %s: %s", p, e)

    async with get_session() as session:
        result = await session.execute(select(DatasetCase))
        db_cases = result.scalars().all()

    by_version: Dict[str, list[DatasetCase]] = {}
    for case in db_cases:
        by_version.setdefault(case.dataset_version, []).append(case)

    for version, cases in by_version.items():
        if version in file_versions:
            continue
        available_datasets.append({
            "filename": None,
            "dataset_name": cases[0].dataset_name,
            "dataset_version": version,
            "split": "curated",
            "total_cases": len(cases),
            "description": "Curated from live incidents via the dashboard.",
        })

    return {"datasets": available_datasets}


@router.get("/datasets/{name}")
async def get_dataset_cases(
    name: str,
) -> Dict[str, Any]:
    """Get all cases in a specific dataset (file-based, falling back to DB-curated)."""
    datasets_dir = (Path(__file__).parent.parent.parent.parent / "datasets").resolve()
    filename = name if name.endswith(".json") else f"{name}.json"
    target_path = (datasets_dir / filename).resolve()

    if not target_path.is_relative_to(datasets_dir) or not target_path.exists():
        async with get_session() as session:
            result = await session.execute(
                select(DatasetCase).where(DatasetCase.dataset_version == name)
            )
            db_cases = result.scalars().all()

        if not db_cases:
            raise HTTPException(status_code=404, detail=f"Dataset '{name}' not found.")

        return {
            "dataset_name": db_cases[0].dataset_name,
            "dataset_version": name,
            "split": "curated",
            "total_cases": len(db_cases),
            "description": "Curated from live incidents via the dashboard.",
            "cases": [_case_to_dict(c) for c in db_cases],
        }

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return data


@router.post("/datasets/{name}/cases")
async def curate_case_to_dataset(
    name: str,
    req: CurateCaseRequest,
) -> Dict[str, Any]:
    """Curate a trace/incident into a dataset test case."""
    async with get_session() as session:
        case = DatasetCase(
            case_id=req.case_id,
            dataset_name="AgentPulse Benchmark",
            dataset_version=name,
            domain=req.domain,
            input_query=req.input_query,
            evidence=req.evidence,
            agent_claim=req.agent_claim,
            expected_classification=req.expected_classification,
            expected_failure_type=req.expected_failure_type,
            is_failure=req.is_failure,
            trace_id=req.trace_id,
            span_id=req.span_id,
            operator_notes=req.operator_notes,
        )
        session.add(case)
        await session.commit()
        await session.refresh(case)

        return {
            "status": "success",
            "message": f"Case '{req.case_id}' curated into dataset '{name}'.",
            "case": {
                "id": case.id,
                "case_id": case.case_id,
                "dataset_version": case.dataset_version,
                "expected_classification": case.expected_classification,
                "trace_id": case.trace_id,
            },
        }
