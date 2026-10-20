"""REST endpoints for Experiments, Datasets, and Trace Curation.

Provides:
- GET /v1/experiments: list experiment runs
- GET /v1/experiments/{id}: detail for specific experiment
- GET /v1/datasets: list versioned datasets
- GET /v1/datasets/{name}: list test cases in dataset
- POST /v1/datasets/{name}/cases: curate trace / incident into dataset
"""

# WHAT THIS FILE IS FOR
# Routes for saved test material. An "experiment" is the saved result of a benchmark run.
# A "dataset" is a set of labeled test cases: a claim, the evidence for it, and the label we
# expect the evaluator to give. This file lists experiments and datasets, returns the cases
# of one dataset, and lets an operator copy ("curate") a real trace into a dataset as a new
# test case.
#
# HOW IT FITS IN
# main.py adds `router` from here. dashboard/src/lib/api.ts has a call for each URL. The
# dashboard uses the list routes and the curate route; nothing calls GET /v1/datasets/{name}.
# The routes read JSON files in experiments/results/ and datasets/ at the repo root, and the
# dataset_cases and experiment_runs tables (models.py). backend/Dockerfile copies only app/,
# so in that image the two folders are missing and only the database rows come back.
#
# NOTE: the list in the docstring above mentions GET /v1/experiments/{id}. No such route
# exists in this file; only the routes defined below are real.

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
# pathlib.Path builds file paths that work on both Windows and Linux.
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
# pydantic BaseModel describes the JSON body of a request and checks it automatically.
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
# select() builds a SQL query.
from sqlmodel import select

from app.database import get_session
from app.models import DatasetCase, ExperimentRun

logger = logging.getLogger("agentpulse.api.experiments")

# All routes in this file start with /v1. The rest of each URL is written on the route.
router = APIRouter(prefix="/v1", tags=["experiments", "datasets"])


# Body of POST /v1/datasets/{name}/cases. Only case_id, input_query and agent_claim must be
# sent; every other field has a default.
class CurateCaseRequest(BaseModel):
    """Payload to curate a trace into a dataset test case."""

    # The test case's own name or id inside its dataset.
    case_id: str
    # The question or task given to the agent.
    input_query: str
    # What the agent said: the thing to be judged against the evidence.
    agent_claim: str
    # The evidence the agent had (may be empty).
    evidence: Optional[str] = None
    # The label we expect the evaluator to give. The dev, val and test dataset files use
    # SUPPORTED and CONTRADICTED.
    expected_classification: str = "SUPPORTED"
    # The kind of failure expected. "NO_FAILURE" is for a good claim.
    expected_failure_type: str = "NO_FAILURE"
    is_failure: bool = False
    # The live trace and span this case was taken from, if any.
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    domain: str = "general"
    # Free-text notes from the person who curated the case.
    operator_notes: Optional[str] = None


# Used by list_experiments. Turns a value of unknown shape into a short text (or None).
def _scalar_label(value: Any) -> Optional[str]:
    """Reduce a free-form result-file field to a display string.

    The files under experiments/results/ are written by many different scripts
    over many months, so the same key does not hold the same shape everywhere:
    `dataset` is a bare string in most files but an object with `id`/`url` in
    the three that reference an external HuggingFace corpus. Emitting whichever
    shape happened to be on disk makes this endpoint's contract depend on the
    experiment that produced the file, which is not something a caller can
    reason about.

    Nothing is lost by flattening here -- the untouched original is still
    returned under `data`.
    """
    # Case 1: nothing, or already a text -> use it as it is.
    if value is None or isinstance(value, str):
        return value
    # Case 2: an object (dict) -> use the first of id / name / version / path that is a text.
    # If none of them is, fall back to compact JSON text (no spaces after "," and ":").
    if isinstance(value, dict):
        for key in ("id", "name", "version", "path"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return candidate
        return json.dumps(value, separators=(",", ":"))
    # Case 3: a list -> turn each item into a text the same way (this function calls itself),
    # drop the empty ones, and join the rest with ", ". An empty result becomes None.
    if isinstance(value, (list, tuple)):
        parts = [p for p in (_scalar_label(v) for v in value) if p]
        return ", ".join(parts) or None
    # Case 4: anything else (a number, a bool...) -> its text form.
    return str(value)


# GET /v1/experiments -> experiment results from two places. "file_experiments" come from the
# JSON files in experiments/results/. "experiments" come from the experiment_runs table,
# newest first. `limit` (1 to 100, default 20) applies only to the table rows, not the files.
@router.get("/experiments")
async def list_experiments(
    limit: int = Query(default=20, ge=1, le=100),
) -> Dict[str, Any]:
    """List recent experiment runs."""
    # Check results folder for file-based experiment results
    # Step 1: read the result files. __file__ is backend/app/routers/experiments.py, so four
    # `.parent` steps climb to the repo root; results_dir is <repo root>/experiments/results.
    results_dir = Path(__file__).parent.parent.parent.parent / "experiments" / "results"
    file_experiments = []
    if results_dir.exists():
        # glob("*.json") matches the .json files in this folder only (not sub-folders).
        for p in results_dir.glob("*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Three headline fields are flattened to text by _scalar_label. The whole
                    # file content is also returned under "data".
                    file_experiments.append({
                        "file": p.name,
                        "timestamp": _scalar_label(data.get("timestamp")),
                        "model": _scalar_label(data.get("model")),
                        "dataset": _scalar_label(data.get("dataset")),
                        "data": data,
                    })
            # Caught on purpose: one bad file (for example invalid JSON) is logged and skipped
            # so it cannot break the whole reply.
            except Exception as e:
                logger.warning("Error reading experiment file %s: %s", p, e)

    # Check DB
    # Step 2: the newest rows of the experiment_runs table. No code in backend/app writes
    # that table, so it is normally empty.
    async with get_session() as session:
        query = select(ExperimentRun).order_by(ExperimentRun.created_at.desc()).limit(limit)
        result = await session.execute(query)
        db_runs = result.scalars().all()

        # Step 3: build the reply. precision = of the cases flagged, how many were truly bad.
        # recall = of the truly bad cases, how many were flagged. f1_score combines the two.
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


# Turns a database row (DatasetCase) into a plain dict shaped like a case in the dataset JSON
# files. Note the key "id" holds the case_id (not the table's own numeric id).
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


# GET /v1/datasets -> a short description of each dataset: the files in datasets/ plus the
# curated versions found in the database.
@router.get("/datasets")
async def list_datasets() -> Dict[str, Any]:
    """List available versioned datasets.

    Two sources, since curation writes to the DB but the original
    dev/val/test splits ship as static files: file-based datasets under
    datasets/*.json, plus any dataset_version present in the dataset_cases
    table (e.g. "v1.0_curated", written by POST /datasets/{name}/cases) that
    doesn't already correspond to a file.
    """
    # Step 1: the dataset files. Four `.parent` steps climb from this file to the repo root,
    # so datasets_dir is <repo root>/datasets.
    datasets_dir = Path(__file__).parent.parent.parent.parent / "datasets"
    available_datasets = []
    # The dataset_version of every file found. Step 3 uses it to avoid listing a version twice.
    file_versions: set[str] = set()

    if datasets_dir.exists():
        # Only the .json files directly in this folder (sub-folders like external/ are skipped).
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
                        # total_cases is counted from the file's "cases" list (0 if it has none).
                        "total_cases": len(data.get("cases", [])),
                        "description": data.get("description"),
                    })
            # Caught on purpose: a bad file is logged and skipped, not allowed to break the list.
            except Exception as e:
                logger.warning("Error reading dataset %s: %s", p, e)

    # Step 2: load every curated case from the database and group the cases by their
    # dataset_version. setdefault gives the list for a version, creating an empty one first.
    async with get_session() as session:
        result = await session.execute(select(DatasetCase))
        db_cases = result.scalars().all()

    by_version: Dict[str, list[DatasetCase]] = {}
    for case in db_cases:
        by_version.setdefault(case.dataset_version, []).append(case)

    # Step 3: add one entry per database version. A version that a file already covers is
    # skipped, so the same version is not listed twice.
    for version, cases in by_version.items():
        if version in file_versions:
            continue
        # No file behind this one (filename is None). The name is taken from its first case.
        available_datasets.append({
            "filename": None,
            "dataset_name": cases[0].dataset_name,
            "dataset_version": version,
            "split": "curated",
            "total_cases": len(cases),
            "description": "Curated from live incidents via the dashboard.",
        })

    return {"datasets": available_datasets}


# GET /v1/datasets/{name} -> all the cases of one dataset. It first looks for the file
# datasets/<name>.json. If there is no such file, it looks for curated cases in the database
# whose dataset_version equals `name`. It answers 404 if neither exists.
@router.get("/datasets/{name}")
async def get_dataset_cases(
    name: str,
) -> Dict[str, Any]:
    """Get all cases in a specific dataset (file-based, falling back to DB-curated)."""
    # Step 1: work out which file the name points to. resolve() makes a path absolute and
    # removes any ".." parts. ".json" is added unless the name already ends with it.
    datasets_dir = (Path(__file__).parent.parent.parent.parent / "datasets").resolve()
    filename = name if name.endswith(".json") else f"{name}.json"
    target_path = (datasets_dir / filename).resolve()

    # Step 2: safety check. A name such as "../something" would point outside the datasets
    # folder (a "path traversal" trick to read other files). is_relative_to() is False then, so
    # the file is never opened and we go to the database branch instead.
    # This branch is also taken when the file simply does not exist.
    if not target_path.is_relative_to(datasets_dir) or not target_path.exists():
        # Step 3: no usable file -> look for curated cases whose dataset_version is `name`.
        async with get_session() as session:
            result = await session.execute(
                select(DatasetCase).where(DatasetCase.dataset_version == name)
            )
            db_cases = result.scalars().all()

        if not db_cases:
            raise HTTPException(status_code=404, detail=f"Dataset '{name}' not found.")

        # Shape the reply like a dataset file: name, version, split, case count, description and
        # the list of cases.
        return {
            "dataset_name": db_cases[0].dataset_name,
            "dataset_version": name,
            "split": "curated",
            "total_cases": len(db_cases),
            "description": "Curated from live incidents via the dashboard.",
            "cases": [_case_to_dict(c) for c in db_cases],
        }

    # Step 4: the file exists and is inside the datasets folder -> return its JSON unchanged.
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return data


# POST /v1/datasets/{name}/cases -> save one new test case in the dataset_cases table.
# `name` is stored as the case's dataset_version; it does not have to match a file. The
# dataset_name is always "AgentPulse Benchmark" here.
@router.post("/datasets/{name}/cases")
async def curate_case_to_dataset(
    name: str,
    req: CurateCaseRequest,
) -> Dict[str, Any]:
    """Curate a trace/incident into a dataset test case."""
    async with get_session() as session:
        # Step 1: copy the request fields into a new DatasetCase row. Nothing checks whether
        # a case with the same case_id already exists, so sending it twice makes two rows.
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
        # Step 2: add the row and commit (save) it. refresh() reloads the row from the database
        # so `case.id`, which the database makes, is filled in for the reply.
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
