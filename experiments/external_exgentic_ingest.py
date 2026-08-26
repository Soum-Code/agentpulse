"""Exgentic v2 ingestion — scoped to the drift diagnosis only.

Extracts paired same-task/different-model agent outputs from the external
corpus `Exgentic/agent-llm-traces-v2`, so the drift question can be asked
against REAL text instead of the synthetic vectors that
`experiments/drift_scenarios.py` constructs.

Why this corpus answers the question:
`DRIFT_EXPERIMENT_REPORT.md` cannot say whether the centroid detector is
broken or whether the synthetic scenarios simply never move the embedding
far enough, because no text was ever embedded. Exgentic v2 supplies real
agent outputs where task prompts are byte-identical across models, giving a
controlled model-shift axis: same task, same harness, same benchmark, one
variable changed.

SCOPE. This is deliberately NOT a general adapter. It extracts only what the
drift diagnosis needs. Other AgentPulse evaluators are out of scope here:
- disagreement cannot use this corpus at all (one agent identity per session)
- tool-claim and grounding have no ground truth in it
See EXTERNAL_TRACE_EVALUATION_REPORT.md / the check-in notes for detail.

PROVENANCE. Raw source rows are never modified. Derived records keep
session_id, run_id, config_path, benchmark, harness, model, outcome fields
and the dataset revision. Fields that cannot be mapped are recorded as
unavailable rather than invented.

COST. The `spans` column is large (~231 MB across the corpus). This script
uses parquet column projection and reads spans only from the shards that
actually contain the target cell.

Outputs (derived data only, raw corpus is not mirrored):
- datasets/external/exgentic_v2/source_metadata.json
- datasets/external/exgentic_v2/raw/manifest.json
- datasets/external/exgentic_v2/derived/drift_pairs.json
- datasets/external/exgentic_v2/README.md
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
from huggingface_hub import HfApi, HfFileSystem

DATASET_ID = "Exgentic/agent-llm-traces-v2"
DATASET_URL = f"https://huggingface.co/datasets/{DATASET_ID}"
GLOB = f"datasets/{DATASET_ID}/**/*.parquet"

OUT_DIR = Path(__file__).parent.parent / "datasets" / "external" / "exgentic_v2"

# Cheap columns — safe to read from every shard.
RUN_COLS = [
    "session_id", "run_id", "config_path", "schema_version",
    "benchmark", "benchmark_subset", "harness", "models",
    "success", "status", "score", "steps", "action_count",
    "execution_time", "total_tokens", "collected_at",
]

# Run-level fields carried through to every derived record, verbatim.
PROVENANCE_FIELDS = [
    "session_id", "run_id", "config_path", "schema_version",
    "benchmark", "benchmark_subset", "harness",
    "success", "status", "score", "steps", "action_count",
    "execution_time", "total_tokens", "collected_at",
]

# Exgentic fields deliberately NOT mapped into the drift records, recorded so
# the loss is explicit rather than silent (see module docstring, PROVENANCE).
UNMAPPED_FIELDS = {
    "spans[].attributes.gen_ai.tool.definitions": "tool schemas, not needed for output-drift; very large (~400KB/span)",
    "spans[].attributes.gen_ai.system_instructions": "not required for output centroid drift",
    "spans[].events": "not required for output centroid drift",
    "spans[].resource_attributes": "constant across the corpus (service.name=exgentic)",
    "agent_cost / benchmark_cost / max_tokens": "cost fields, not part of the drift question",
    "tool_call / tool_call_response parts": "present in the corpus but out of scope for drift; relevant to a future tool-claim study",
}


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def jsonable(value: Any) -> Any:
    """Convert pandas missing values to null.

    Some fields are genuinely absent in the source (e.g. `benchmark_subset`
    is unset for browsecompplus). Pandas surfaces those as float NaN, and
    `json.dump` writes a bare `NaN` token, which is not valid JSON and fails
    strict parsers. Absent stays absent — it is emitted as null, never
    replaced with a substitute value.
    """
    if isinstance(value, float) and value != value:  # NaN
        return None
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return str(value)


def first_user_text(spans: Any) -> str | None:
    """The task prompt — the pairing key across models.

    Taken from the first span's input messages. The conversation is
    cumulative (span N carries 2N+1 messages), so the first user text of the
    first span is the original task statement.
    """
    if spans is None or len(spans) == 0:
        return None
    raw = spans[0]["attributes"].get("gen_ai.input.messages")
    if not raw:
        return None
    try:
        messages = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    for msg in messages:
        if msg.get("role") != "user":
            continue
        for part in msg.get("parts", []) or []:
            if part.get("type") == "text" and part.get("content"):
                return part["content"]
    return None


def assistant_outputs(spans: Any) -> list[str]:
    """Ordered assistant text output, one entry per span.

    This is the observation stream a drift detector would see: each span is
    one agent step. Only `text` parts are kept — `tool_call` parts carry
    arguments rather than agent prose, and mixing them would change what the
    embedding represents.
    """
    outputs: list[str] = []
    for span in spans:
        raw = span["attributes"].get("gen_ai.output.messages")
        if not raw:
            continue
        try:
            messages = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        texts = [
            part["content"]
            for msg in messages
            if msg.get("role") == "assistant"
            for part in (msg.get("parts", []) or [])
            if part.get("type") == "text" and part.get("content")
        ]
        if texts:
            outputs.append("\n".join(texts))
    return outputs


def scan_shard_index(fs: HfFileSystem, files: list[str]) -> dict[int, Counter]:
    """Which (benchmark, harness) cells live in which shard — cheap projection."""
    index: dict[int, Counter] = {}
    for i, path in enumerate(files):
        with fs.open(path, "rb") as fh:
            table = pq.read_table(fh, columns=["benchmark", "harness"])
        cells = Counter(zip(table["benchmark"].to_pylist(), table["harness"].to_pylist()))
        index[i] = cells
        print(f"  shard {i}: {sum(cells.values())} rows, {len(cells)} cells", flush=True)
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    # Cell chosen on measured prose coverage, not convenience. Assistant text
    # availability is strongly harness- and model-dependent in this corpus:
    # in browsecompplus/tool_calling, claude-opus-4-5 emits prose in 0/100
    # sessions and gpt-5.2 in 1/100 (both emit only tool_call parts), so a
    # text-based extraction there silently drops two of five models and would
    # measure narration style as if it were semantic drift.
    # browsecompplus/smolagents_code is the one cell where all five models
    # produce prose in 100/100 sessions. See CHECK-IN 2 notes.
    parser.add_argument("--benchmark", default="browsecompplus")
    parser.add_argument("--harness", default="smolagents_code")
    parser.add_argument("--min-models", type=int, default=2,
                        help="Minimum distinct models for a task to count as a paired group.")
    args = parser.parse_args()

    print("=" * 70)
    print("EXGENTIC v2 INGEST — DRIFT DIAGNOSIS SCOPE")
    print("=" * 70)
    print(f"target cell: benchmark={args.benchmark} harness={args.harness}")

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    api = HfApi()
    info = api.dataset_info(DATASET_ID)
    revision = info.sha
    print(f"dataset revision: {revision}")

    fs = HfFileSystem()
    files = sorted(fs.glob(GLOB))
    print(f"parquet shards: {len(files)}\n")

    print("Indexing shards (run-level columns only)...")
    shard_index = scan_shard_index(fs, files)

    target = (args.benchmark, args.harness)
    target_shards = [i for i, cells in shard_index.items() if cells.get(target, 0) > 0]
    if not target_shards:
        raise SystemExit(f"No shard contains {target}. Available cells: "
                         f"{sorted({c for cells in shard_index.values() for c in cells})}")
    print(f"\nShards containing {target}: {target_shards} "
          f"({sum(shard_index[i][target] for i in target_shards)} sessions) "
          f"-- reading spans from these only")

    sessions: list[dict[str, Any]] = []
    rows_seen = 0
    skipped: Counter = Counter()

    for shard in target_shards:
        with fs.open(files[shard], "rb") as fh:
            table = pq.read_table(fh, columns=RUN_COLS + ["spans"])
        df = table.to_pandas()
        rows_seen += len(df)
        df = df[(df.benchmark == args.benchmark) & (df.harness == args.harness)]
        print(f"  shard {shard}: {len(df)} matching sessions", flush=True)

        for row in df.itertuples(index=False):
            record = {f: jsonable(getattr(row, f)) for f in PROVENANCE_FIELDS}
            models = list(row.models)
            if len(models) != 1:
                skipped["model_count_not_1"] += 1
                continue
            record["model"] = models[0]

            task = first_user_text(row.spans)
            if not task:
                skipped["no_task_prompt"] += 1
                continue

            outputs = assistant_outputs(row.spans)
            if not outputs:
                skipped["no_assistant_output"] += 1
                continue

            record["task_prompt_sha256"] = sha256(task)
            record["task_prompt_chars"] = len(task)
            record["n_spans"] = len(row.spans)
            record["outputs"] = outputs
            record["n_outputs"] = len(outputs)
            record["output_chars_total"] = sum(len(o) for o in outputs)
            sessions.append(record)

    print(f"\nsessions extracted: {len(sessions)} (skipped: {dict(skipped) or 'none'})")

    # Group by task; keep only tasks covered by >= min_models distinct models.
    by_task: dict[str, list[dict]] = defaultdict(list)
    for s in sessions:
        by_task[s["task_prompt_sha256"]].append(s)

    groups = []
    for task_hash, members in sorted(by_task.items()):
        models = sorted({m["model"] for m in members})
        if len(models) < args.min_models:
            continue
        groups.append({
            "task_prompt_sha256": task_hash,
            "n_sessions": len(members),
            "n_models": len(models),
            "models": models,
            "sessions": sorted(members, key=lambda m: m["model"]),
        })

    paired_sessions = sum(g["n_sessions"] for g in groups)
    print(f"tasks total: {len(by_task)} | paired tasks (>={args.min_models} models): {len(groups)}")
    print(f"sessions inside paired groups: {paired_sessions}")

    # ── Verification checks (section 24 of the research brief) ────────
    checks = {
        "shards_read_for_spans": target_shards,
        "shards_available": len(files),
        "rows_scanned_in_read_shards": rows_seen,
        "sessions_extracted": len(sessions),
        "sessions_skipped": dict(skipped),
        "unique_session_ids": len({s["session_id"] for s in sessions}),
        "unique_run_ids": len({s["run_id"] for s in sessions}),
        "distinct_models": sorted({s["model"] for s in sessions}),
        "distinct_tasks": len(by_task),
        "paired_task_groups": len(groups),
        "sessions_in_paired_groups": paired_sessions,
        "all_sessions_have_outputs": all(s["n_outputs"] > 0 for s in sessions),
        "corpus_non_empty": len(sessions) > 0,
        "no_duplicate_session_ids": len({s["session_id"] for s in sessions}) == len(sessions),
    }
    if not checks["corpus_non_empty"]:
        raise SystemExit("Refusing to write: extracted zero sessions.")
    if not checks["no_duplicate_session_ids"]:
        raise SystemExit("Refusing to write: duplicate session_ids detected.")

    # ── Write derived artifacts ───────────────────────────────────────
    (OUT_DIR / "raw").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "derived").mkdir(parents=True, exist_ok=True)

    source_metadata = {
        "dataset_id": DATASET_ID,
        "dataset_url": DATASET_URL,
        "revision": revision,
        "retrieved_at": retrieved_at,
        "retrieval_method": "huggingface_hub.HfFileSystem + pyarrow column projection",
        "raw_corpus_mirrored": False,
        "raw_corpus_note": (
            "The full corpus (~231 MB, dominated by the spans column) is NOT mirrored "
            "into this repository. Reproducibility is via this script plus the pinned "
            "revision above; raw/manifest.json lists every source session consumed."
        ),
        "scope": "drift diagnosis only",
        "target_cell": {"benchmark": args.benchmark, "harness": args.harness},
        "transformation_steps": [
            "1. Enumerate parquet shards via HfFileSystem.",
            "2. Project (benchmark, harness) from every shard to locate the target cell.",
            "3. Read RUN_COLS + spans from only the shards containing the target cell.",
            "4. Filter rows to the target benchmark/harness.",
            "5. Task prompt = first user text part of the first span's input messages.",
            "6. Outputs = per-span assistant text parts, in span order; tool_call parts excluded.",
            "7. Group sessions by task_prompt_sha256; keep groups covering >= min_models models.",
        ],
        "fields_not_mapped": UNMAPPED_FIELDS,
        "known_corpus_caveats": {
            "row_count": "10056 rows measured, dataset card states ~10057 runs",
            "rows_are_sessions": "each row is one task session; 115 run_ids group them",
            "status_unknown_share": "~49% of corpus sessions have status='unknown'",
            "single_agent": "one model and one agent identity per session; no multi-agent structure",
        },
        "verification": checks,
    }
    (OUT_DIR / "source_metadata.json").write_text(
        json.dumps(jsonable(source_metadata), indent=2, allow_nan=False), encoding="utf-8")

    manifest = {
        "dataset_id": DATASET_ID,
        "revision": revision,
        "retrieved_at": retrieved_at,
        "target_cell": {"benchmark": args.benchmark, "harness": args.harness},
        "source_sessions": [
            {"session_id": s["session_id"], "run_id": s["run_id"],
             "config_path": s["config_path"], "model": s["model"],
             "task_prompt_sha256": s["task_prompt_sha256"]}
            for s in sorted(sessions, key=lambda x: x["session_id"])
        ],
    }
    (OUT_DIR / "raw" / "manifest.json").write_text(
        json.dumps(jsonable(manifest), indent=2, allow_nan=False), encoding="utf-8")

    derived = {
        "provenance": {
            "dataset_id": DATASET_ID, "dataset_url": DATASET_URL,
            "revision": revision, "retrieved_at": retrieved_at,
            "data_class": "EXTERNAL_REAL_DATA",
            "labels": "NONE — this corpus provides no drift ground truth; "
                      "model identity is the controlled variable, not a drift label",
        },
        "target_cell": {"benchmark": args.benchmark, "harness": args.harness},
        "min_models_per_group": args.min_models,
        "n_paired_groups": len(groups),
        "n_sessions_in_groups": paired_sessions,
        "groups": groups,
    }
    (OUT_DIR / "derived" / "drift_pairs.json").write_text(
        json.dumps(jsonable(derived), indent=2, allow_nan=False), encoding="utf-8")

    (OUT_DIR / "README.md").write_text(f"""# External corpus: Exgentic agent-llm-traces-v2

**Source:** [{DATASET_ID}]({DATASET_URL})
**Revision:** `{revision}`
**Retrieved:** {retrieved_at}
**Class:** `EXTERNAL_REAL_DATA` — independently collected, not authored for AgentPulse.

This directory holds **derived** data only. The raw corpus is not mirrored
(~231 MB, dominated by the `spans` column); `raw/manifest.json` lists every
source session consumed, and `experiments/external_exgentic_ingest.py`
reproduces the extraction against the pinned revision above.

## Scope

Extracted for the **drift diagnosis only** — paired same-task/different-model
agent outputs. Not a general adapter.

This corpus **cannot** support every AgentPulse evaluator:

| Evaluator | Usable | Why |
| :--- | :--- | :--- |
| Drift | Yes | Task prompts are byte-identical across models, giving a controlled model-shift axis over real text |
| Ingestion / temporal | Yes | Real OpenTelemetry spans, timestamps, token usage |
| Tool-claim | Partial | Tool calls and responses exist, but the corpus carries no correctness labels |
| Grounding | Exploratory only | No grounding labels. Using AgentPulse's own NLI as the label would be circular |
| Inter-agent disagreement | **No** | One model and one agent identity per session; no comparison target exists |

## No ground truth

This corpus provides **no drift labels**. Model identity is a controlled
*variable*, not a label meaning "drifted". Any conclusion drawn here is about
measured embedding displacement between real outputs, not about a labelled
drift benchmark.

## Files

- `source_metadata.json` — provenance, transformation steps, unmapped fields, verification counts
- `raw/manifest.json` — every source session consumed (session_id, run_id, config_path, model)
- `derived/drift_pairs.json` — paired task groups with per-session agent outputs
""", encoding="utf-8")

    print("\n" + "-" * 70)
    print("VERIFICATION")
    print("-" * 70)
    for k, v in checks.items():
        print(f"  {k}: {v}")
    print(f"\nWrote:\n  {OUT_DIR / 'source_metadata.json'}"
          f"\n  {OUT_DIR / 'raw' / 'manifest.json'}"
          f"\n  {OUT_DIR / 'derived' / 'drift_pairs.json'}"
          f"\n  {OUT_DIR / 'README.md'}")


if __name__ == "__main__":
    main()
