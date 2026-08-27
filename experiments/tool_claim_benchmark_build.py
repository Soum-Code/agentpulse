"""Build a real-data tool-claim benchmark from external agent traces.

Step 4 of the tool-claim redesign. Constructs cases from
Exgentic/agent-llm-traces-v2 so the redesigned extraction can be measured
against real agent behaviour instead of 19 hand-written sentences.

The existing 19-case benchmark (experiments/tool_claim_benchmark.py) is NOT
touched. It is preserved as historical evidence of why a self-authored
benchmark was insufficient -- it scored precision 1.000 while the validator
extracted nothing at all from 8,353 real spans.

WHAT A CLAIM IS HERE (established in step 2, from the data)

Per-step agent prose is INTENT ("Let me search the messages"). The verifiable
claim is the retrospective summary written after the work is done:

    "Perfect! I have successfully: 1. Logged into Spotify ...
     4. Added all recommended songs to the queue (5 songs) ..."

That single text carries success assertions, numeric assertions and action
mentions -- and structured telemetry says what actually ran. So a case pairs
the final summary against the evidence set for that session.

LABELS -- AND THEIR HONEST LIMITS

  tier_1_external : the corpus's own `success` field, computed by the
      benchmark harness independently of AgentPulse and of this script.
      A case is an OVERCLAIM when the summary asserts completion but the
      harness scored the run as failed.

      Known weakness, stated up front: an agent can perform several
      sub-actions correctly and still fail the harness's scoring. So an
      overclaim label means "asserted success on an objectively failed run",
      NOT "every statement in the summary is false". This measures
      overclaiming, which is real and externally labelled, rather than
      claim-level truth.

  tier_2_candidate : summary contains a numeric assertion AND the session has
      a tool result with a countable collection. Recorded with its evidence
      but NOT labelled -- resolving which number refers to which result needs
      adjudication this script will not fake.

  unlabelled : everything else. Usable for behavioural measurement only.

AVOIDING BENCHMARK LEAKAGE

Cases are selected and labelled WITHOUT running the validator. The
completion-assertion matcher below is deliberately broader than, and
independent of, tool_claim.py's SUCCESS_CLAIM_PATTERNS -- selecting cases
with the detector's own patterns would build a benchmark of exactly the
cases it can already see.

Sampling is stratified across (benchmark, harness, model). Harness variation
has already burned this project once: smolagents_code emits zero structured
tool calls, and in tool_calling two of five models emit no prose at all.

Outputs:
- datasets/external/exgentic_v2/derived/tool_claim_cases.json
- datasets/external/exgentic_v2/tool_claim_cases_metadata.json
"""

from __future__ import annotations

import json
import re
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

SHARDS = [0, 5]
SESSIONS_PER_CELL = 40
MIN_SUMMARY_CHARS = 40
PLACEHOLDERS = {"[empty]", ""}

RUN_COLS = ["session_id", "run_id", "config_path", "benchmark", "benchmark_subset",
            "harness", "models", "success", "status", "score", "steps", "collected_at"]

# Deliberately BROADER than tool_claim.py's SUCCESS_CLAIM_PATTERNS, and written
# without reference to them. See "AVOIDING BENCHMARK LEAKAGE" above.
COMPLETION_ASSERTION = re.compile(
    r"\b(successful(ly)?|completed?|finished|done|accomplished|all set|"
    r"task is (now )?complete|i have (now )?(completed|finished|done)|"
    r"have been (added|updated|created|set|sent)|no errors?)\b",
    re.IGNORECASE,
)
NUMERIC_ASSERTION = re.compile(r"\b(\d+)\s+([a-z]{3,})", re.IGNORECASE)

# A failed tool leaves no structured flag in this corpus -- only text.
ERROR_MARKER = re.compile(r"\b(error|exception|failed|traceback|not found|invalid)\b",
                          re.IGNORECASE)


def assistant_text(span: dict) -> str:
    raw = span.get("attributes", {}).get("gen_ai.output.messages")
    if not raw:
        return ""
    try:
        messages = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return ""
    parts = [p["content"] for m in messages if m.get("role") == "assistant"
             for p in (m.get("parts") or [])
             if p.get("type") == "text" and p.get("content")]
    return "\n".join(parts).strip()


def final_summary(spans: Any) -> str | None:
    """Last substantive assistant text — the retrospective claim surface."""
    for span in reversed(list(spans)):
        text = assistant_text(span)
        if text in PLACEHOLDERS or len(text) < MIN_SUMMARY_CHARS:
            continue
        return text
    return None


def countable_items(result_text: str) -> int | None:
    """Item count if the result holds a real collection, else None.

    Excludes the single-element [{"type":"text",...}] wrapper this corpus uses,
    and looks one level inside it, since the payload is often nested JSON.
    """
    try:
        parsed = json.loads(result_text)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(parsed, list):
        if len(parsed) > 1:
            return len(parsed)
        if len(parsed) == 1 and isinstance(parsed[0], dict) and "text" in parsed[0]:
            try:
                inner = json.loads(parsed[0]["text"])
            except (json.JSONDecodeError, TypeError):
                return None
            if isinstance(inner, list) and len(inner) > 1:
                return len(inner)
            if isinstance(inner, dict):
                for value in inner.values():
                    if isinstance(value, list) and len(value) > 1:
                        return len(value)
        return None
    if isinstance(parsed, dict):
        for value in parsed.values():
            if isinstance(value, list) and len(value) > 1:
                return len(value)
    return None


def build_evidence(spans: Any) -> dict[str, Any]:
    """What actually ran, from structured telemetry only."""
    tool_names: list[str] = []
    results: dict[str, str] = {}
    seen: set[str] = set()

    for span in spans:
        attrs = span.get("attributes", {})

        raw_out = attrs.get("gen_ai.output.messages")
        if raw_out:
            try:
                for msg in json.loads(raw_out):
                    for part in (msg.get("parts") or []):
                        if part.get("type") == "tool_call":
                            tool_names.append(part.get("name", ""))
            except (json.JSONDecodeError, TypeError):
                pass

        # Responses live on the INPUT side and the conversation is cumulative,
        # so they must be deduplicated by id.
        raw_in = attrs.get("gen_ai.input.messages")
        if raw_in:
            try:
                for msg in json.loads(raw_in):
                    for part in (msg.get("parts") or []):
                        if part.get("type") != "tool_call_response":
                            continue
                        rid = part.get("id", "")
                        if rid and rid in seen:
                            continue
                        if rid:
                            seen.add(rid)
                        results[rid] = part.get("result", "")
            except (json.JSONDecodeError, TypeError):
                pass

    counts = []
    for rid, text in results.items():
        n = countable_items(text)
        if n is not None:
            counts.append({"response_id": rid, "item_count": n})

    return {
        "tool_names_called": sorted(set(n for n in tool_names if n)),
        "tool_call_count": len(tool_names),
        "tool_response_count": len(results),
        "responses_with_error_markers": sum(1 for t in results.values() if ERROR_MARKER.search(t)),
        "countable_results": counts,
    }


def main() -> None:
    print("=" * 78)
    print("TOOL-CLAIM BENCHMARK BUILD — real traces, validator not consulted")
    print("=" * 78)

    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    revision = HfApi().dataset_info(DATASET_ID).sha
    print(f"\ndataset revision: {revision}")

    fs = HfFileSystem()
    files = sorted(fs.glob(GLOB))
    cases: list[dict] = []
    skipped: Counter = Counter()

    for shard in SHARDS:
        with fs.open(files[shard], "rb") as fh:
            df = pq.read_table(fh, columns=RUN_COLS + ["spans"]).to_pandas()
        df = df.assign(_model=df.models.apply(lambda m: m[0] if len(m) else "unknown"))
        print(f"  shard {shard}: {len(df)} sessions", flush=True)

        for (bench, harness, model), group in df.groupby(["benchmark", "harness", "_model"]):
            for row in group.head(SESSIONS_PER_CELL).itertuples(index=False):
                summary = final_summary(row.spans)
                if not summary:
                    skipped["no_substantive_summary"] += 1
                    continue

                evidence = build_evidence(row.spans)
                asserts_completion = bool(COMPLETION_ASSERTION.search(summary))
                numerics = [{"value": int(m.group(1)), "noun": m.group(2)}
                            for m in NUMERIC_ASSERTION.finditer(summary)]

                success = bool(row.success)
                if asserts_completion:
                    tier = "tier_1_external"
                    expected_overclaim = not success
                    basis = ("summary asserts completion; corpus `success` field, computed "
                             "by the benchmark harness, is the independent label")
                elif numerics and evidence["countable_results"]:
                    tier = "tier_2_candidate"
                    expected_overclaim = None
                    basis = ("numeric assertion with a countable tool result present; "
                             "NOT labelled -- needs adjudication")
                else:
                    tier = "unlabelled"
                    expected_overclaim = None
                    basis = "no externally checkable assertion found"

                cases.append({
                    "case_id": f"{row.session_id}",
                    "session_id": row.session_id, "run_id": row.run_id,
                    "config_path": row.config_path,
                    "benchmark": bench, "harness": harness, "model": model,
                    "collected_at": str(row.collected_at),
                    "summary_text": summary,
                    "summary_chars": len(summary),
                    "asserts_completion": asserts_completion,
                    "numeric_assertions": numerics,
                    "evidence": evidence,
                    "external_outcome": {
                        "success": success,
                        "status": row.status,
                        "score": None if row.score != row.score else float(row.score),
                        "steps": int(row.steps),
                    },
                    "label": {"tier": tier, "expected_overclaim": expected_overclaim,
                              "basis": basis},
                })

    tiers = Counter(c["label"]["tier"] for c in cases)
    t1 = [c for c in cases if c["label"]["tier"] == "tier_1_external"]
    overclaims = sum(1 for c in t1 if c["label"]["expected_overclaim"])
    cells = {(c["benchmark"], c["harness"]) for c in cases}
    models = {c["model"] for c in cases}

    if not cases:
        raise SystemExit("Refusing to write: zero cases built.")

    payload = {
        "dataset_name": "agentpulse_tool_claim_external",
        "data_class": "EXTERNAL_REAL_DATA",
        "provenance": {
            "dataset_id": DATASET_ID, "dataset_url": DATASET_URL,
            "revision": revision, "retrieved_at": retrieved_at,
            "shards_read": SHARDS, "sessions_per_cell": SESSIONS_PER_CELL,
        },
        "construction": {
            "claim_surface": "last substantive assistant text (>=40 chars, excluding placeholders)",
            "evidence_source": "structured tool_call names and deduplicated tool_call_response results",
            "validator_consulted_during_construction": False,
            "completion_matcher": "independent of and broader than tool_claim.py SUCCESS_CLAIM_PATTERNS",
            "stratified_by": ["benchmark", "harness", "model"],
        },
        "label_semantics": {
            "tier_1_external": "summary asserts completion; label from the corpus `success` "
                               "field. An overclaim means completion asserted on an "
                               "objectively failed run -- NOT that every statement is false.",
            "tier_2_candidate": "numeric assertion with countable evidence; deliberately UNLABELLED",
            "unlabelled": "behavioural measurement only; no precision/recall",
        },
        "counts": {
            "total_cases": len(cases),
            "by_tier": dict(tiers),
            "tier_1_overclaims": overclaims,
            "tier_1_consistent": len(t1) - overclaims,
            "cells": len(cells), "models": len(models),
            "skipped": dict(skipped),
        },
        "cases": cases,
    }

    (OUT_DIR / "derived").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "derived" / "tool_claim_cases.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8")
    meta = {k: v for k, v in payload.items() if k != "cases"}
    (OUT_DIR / "tool_claim_cases_metadata.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8")

    print("\n" + "-" * 78)
    print("BENCHMARK BUILT")
    print("-" * 78)
    print(f"  total cases            : {len(cases)}")
    print(f"  cells / models covered : {len(cells)} / {len(models)}")
    print(f"  skipped                : {dict(skipped) or 'none'}")
    print()
    for tier, n in tiers.most_common():
        print(f"  {tier:20s} {n}")
    print()
    print(f"  tier 1 — asserts completion AND run failed (overclaim): {overclaims}")
    print(f"  tier 1 — asserts completion AND run succeeded         : {len(t1) - overclaims}")

    print("\n  per cell:")
    per = defaultdict(Counter)
    for c in cases:
        per[(c["benchmark"], c["harness"])][c["label"]["tier"]] += 1
    for cell, t in sorted(per.items()):
        print(f"    {cell[0] + '/' + cell[1]:38s} {dict(t)}")

    print(f"\nWrote:\n  {OUT_DIR / 'derived' / 'tool_claim_cases.json'}"
          f"\n  {OUT_DIR / 'tool_claim_cases_metadata.json'}")


if __name__ == "__main__":
    main()
