"""Test the tool-claim validator against real agent traces.

TOOL_CLAIM_VALIDATOR_REPORT.md reports precision 1.000 / recall 0.727 on 19
hand-written cases, authored by the same person who wrote the validator. Its
own section 4 names the follow-on: run it against real model output. This is
that run.

WHAT THIS CAN AND CANNOT MEASURE

The corpus (Exgentic/agent-llm-traces-v2) carries real tool_call and
tool_call_response parts, but NO ground truth for whether an agent's claim
about a tool is truthful. No such labels are invented here.

  measurable : extraction rate on real output -- how often the validator
               finds anything to check at all. Needs no labels.
  measurable : how many spans have a tool call with a countable result, i.e.
               cases a working validator could have checked. Sizes the
               opportunity rather than reporting a bare zero.
  NOT measurable : precision, recall, F1. Reported as UNLABELLED.

POSITIVE CONTROL

Run in this same script, deliberately. A zero extraction rate is
uninterpretable on its own -- it is equally consistent with "the validator
does not fire on this text" and "the measurement harness is broken". The
control uses the validator's own benchmark phrasing, so a passing control
means the zero is a real property of the data.

This lesson comes from the drift work, where a first experiment without a
positive control produced a result that could not be interpreted at all.

The validator is used UNMODIFIED. The point is to measure what ships.

Cost: uses HfFileSystem + parquet column projection. The full corpus is
~231 MB and is never downloaded.

Outputs:
- experiments/results/tool_claim_external_test.json
"""

# WHAT THIS FILE IS FOR
# Tries the tool-claim check (backend/app/services/tool_claim.py) on REAL agent output instead
# of hand-written sentences. It reads agent runs from a public dataset on Hugging Face (a
# site that hosts datasets). Over all spans it counts the tool calls, the tool results, and
# the results that hold a real collection whose size could be checked. For the spans that
# have agent text it counts how often the check finds any claim in that text at all (the
# "extraction rate").
# It does NOT report precision or recall, because the dataset has no correct answers to
# compare with. Before the real run it does a "positive control" (see the docstring above).
#
# HOW IT FITS IN
# Run by hand: python experiments/tool_claim_external_test.py (needs internet). It imports
# extract_claims, evaluate_tool_claims and ToolCallRecord from the backend, and writes
# experiments/results/tool_claim_external_test.json. TOOL_CLAIM_EXTERNAL_TEST_REPORT.md
# explains that file. Nothing in the app imports this script.

from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

# pyarrow reads parquet files (a column-based file format). huggingface_hub lets us list and
# open files of a Hugging Face dataset without downloading the whole dataset.
import pyarrow.parquet as pq
from huggingface_hub import HfApi, HfFileSystem

# These paths let the script import "app" (in backend/) although it lives in experiments/.
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.tool_claim import ToolCallRecord, evaluate_tool_claims, extract_claims

# Name of the dataset on Hugging Face, its web page, and a pattern that matches all of its
# parquet files. OUT_PATH is the JSON file this script writes.
DATASET_ID = "Exgentic/agent-llm-traces-v2"
DATASET_URL = f"https://huggingface.co/datasets/{DATASET_ID}"
GLOB = f"datasets/{DATASET_ID}/**/*.parquet"
OUT_PATH = Path(__file__).parent / "results" / "tool_claim_external_test.json"

# Shards chosen for harness diversity, not cherry-picked for outcome:
# shard 0 is appworld/claude_code, shard 5 carries browsecompplus across four
# harnesses plus swebench.
# The numbers are positions in the sorted list of parquet files.
SHARDS = [0, 5]
# Take at most this many sessions from each group of (benchmark, harness, model) in each
# file. The code takes the first rows of each group, not a random pick.
SESSIONS_PER_CELL = 25

# The validator's own benchmark phrasing, from experiments/tool_claim_benchmark.py.
# Each entry is (text, the tool name the check should find, the number it should find).
# The name "unknown" is what the check uses when it finds a number but no tool name. None
# means no number is expected: "5 rows" gives none because the check's list of nouns for
# counts (results, papers, documents, records, ...) does not include "rows".
POSITIVE_CONTROL = [
    ("We queried the search tool and retrieved 3 records.", "search", 3),
    ("Executed the calculator tool to compute variance.", "calculator", None),
    ("The database_lookup tool returned 5 rows.", "database_lookup", None),
    ("Retrieved 12 records from the database.", "unknown", 12),
]


def run_positive_control() -> dict[str, Any]:
    """Prove the harness can see extractions before reporting that it saw none."""
    # Returns {"cases": [...one dict per sentence...], "all_passed": True or False}.
    cases = []
    for text, expected_tool, expected_count in POSITIVE_CONTROL:
        claims = extract_claims(text)
        # A sentence passes when at least one claim was found and the FIRST claim has the
        # expected tool name and the expected number.
        ok = bool(claims) and claims[0].tool_name == expected_tool \
            and claims[0].claimed_count == expected_count
        cases.append({
            "text": text,
            "expected_tool": expected_tool,
            "expected_count": expected_count,
            "extracted": [{"tool_name": c.tool_name, "claimed_count": c.claimed_count}
                          for c in claims],
            "passed": ok,
        })
    return {"cases": cases, "all_passed": all(c["passed"] for c in cases)}


def countable(result_text: str | None) -> bool:
    """Does this tool result carry a real count a validator could check against?

    Tool results in this corpus are wrapped as a single-element list, e.g.
    `[{"type": "text", "text": "..."}]`. Treating any list as countable marks
    100% of responses countable, which measures the wrapper rather than the
    payload -- a first version of this script did exactly that. A result only
    counts here if it holds MORE THAN ONE item, i.e. an actual result set.
    """
    # Note: unlike countable_items() in tool_claim_benchmark_build.py, this does not open the
    # one-item wrapper. A one-item list simply counts as "not countable".
    # Step 1: nothing, or text that is not valid JSON, cannot be counted.
    if not result_text:
        return False
    try:
        parsed = json.loads(result_text)
    except (json.JSONDecodeError, TypeError):
        return False
    # Step 2: a list is countable when it has more than one item. A dict is countable when
    # at least one of its values is such a list. Anything else is not countable.
    if isinstance(parsed, list):
        return len(parsed) > 1
    if isinstance(parsed, dict):
        return any(isinstance(v, list) and len(v) > 1 for v in parsed.values())
    return False


# Looks at ONE span and adds to the counters in cell_stats (the counters of the cell this
# span belongs to). seen_responses holds the ids of tool responses already counted in this
# session; this function adds new ids to it. It returns nothing.
def analyse_span(span: dict, cell_stats: dict, seen_responses: set[str]) -> None:
    attrs = span.get("attributes", {})

    # Step 1: read the OUTPUT messages. The span keeps them as JSON text under this attribute
    # name. Collect the text the assistant wrote ("prose") and its tool calls. If the JSON
    # cannot be read, the whole span is skipped and nothing from it is counted.
    # Agent prose and structured tool calls, from the OUTPUT side.
    raw_out = attrs.get("gen_ai.output.messages")
    prose: list[str] = []
    tool_calls: list[dict] = []
    if raw_out:
        try:
            for msg in json.loads(raw_out):
                if msg.get("role") != "assistant":
                    continue
                for part in (msg.get("parts") or []):
                    if part.get("type") == "text" and part.get("content"):
                        prose.append(part["content"])
                    elif part.get("type") == "tool_call":
                        tool_calls.append(part)
        except (json.JSONDecodeError, TypeError):
            return

    # Step 2: read the INPUT messages and keep the tool responses not seen before.
    # Tool results arrive on the INPUT side of the following span. The
    # conversation is CUMULATIVE -- span N carries every response from 1..N-1 --
    # so responses must be deduplicated by id. Summing them per span counts
    # each response roughly N times, which a first version of this script did.
    raw_in = attrs.get("gen_ai.input.messages")
    new_responses: dict[str, str] = {}
    if raw_in:
        try:
            for msg in json.loads(raw_in):
                for part in (msg.get("parts") or []):
                    if part.get("type") != "tool_call_response":
                        continue
                    rid = part.get("id", "")
                    # Counted in an earlier span, so skip it.
                    if rid and rid in seen_responses:
                        continue
                    if rid:
                        seen_responses.add(rid)
                    new_responses[rid] = part.get("result", "")
        # Unlike the output side, broken JSON here is ignored and the span is still used.
        except (json.JSONDecodeError, TypeError):
            pass

    # Step 3: add this span to the counters. Only the responses that are new in this span
    # are counted. A response is "countable" when countable() says its result holds a set.
    cell_stats["spans"] += 1
    cell_stats["tool_calls"] += len(tool_calls)
    cell_stats["tool_responses"] += len(new_responses)
    cell_stats["countable_results"] += sum(1 for r in new_responses.values() if countable(r))

    # Step 4: a span with no agent text gives the validator nothing to read. Stop here.
    if not prose:
        return
    cell_stats["prose_spans"] += 1

    # Step 5: run the claim extractor on all the text of the span (the text pieces joined with
    # new lines). Count the span as "with claims" if it found at least one claim.
    text = "\n".join(prose)
    claims = extract_claims(text)
    if claims:
        cell_stats["spans_with_claims"] += 1
        cell_stats["claims_extracted"] += len(claims)

        # Only meaningful when something was extracted; runs the full pipeline
        # against the real structured tool calls.
        # The records below hold only the tool NAME. Their result count is unknown (None) and
        # their status stays "success", so the only mismatch that can appear is FABRICATED_TOOL:
        # a named tool matching none of this span's calls, or a count claim with no calls at
        # all. WRONG_COUNT and RESULT_DISTORTION cannot be found this way.
        records = [ToolCallRecord(tool_name=tc.get("name", "")) for tc in tool_calls]
        result = evaluate_tool_claims(text, records)
        # The span counts as "flagged" when at least one of its claims is a mismatch.
        if result.mismatches:
            cell_stats["spans_flagged"] += 1


# Runs the whole test: positive control, then the real traces, then prints and saves the
# numbers. Takes no input and returns nothing. It needs the internet.
def main() -> None:
    print("=" * 76)
    print("TOOL-CLAIM VALIDATOR vs. REAL AGENT TRACES")
    print("=" * 76)

    # Step 1: run the positive control and print one line per sentence (only the first 56
    # characters of the sentence are shown).
    # ── Positive control first: a zero result is meaningless without it ──
    print("\nPositive control (validator's own benchmark phrasing)...")
    control = run_positive_control()
    for case in control["cases"]:
        mark = "OK " if case["passed"] else "FAIL"
        print(f"  [{mark}] {case['text'][:56]!r} -> {case['extracted']}")
    # If any sentence failed, stop. Otherwise a zero result below could mean a broken script.
    if not control["all_passed"]:
        raise SystemExit(
            "Positive control FAILED. The harness cannot see extractions it should, "
            "so any zero measured below would be uninterpretable. Refusing to continue.")
    print("  control passed — the harness can see extractions when they exist.\n")

    # Step 2: note the time and the dataset's current revision (a commit id), so that the
    # result file says exactly which version of the data was used.
    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    revision = HfApi().dataset_info(DATASET_ID).sha
    print(f"dataset revision: {revision}")

    # Step 3: list the parquet files of the dataset. "cells" maps (benchmark, harness, model)
    # to a dict of counters that start at 0. "samples" will hold a few real examples.
    fs = HfFileSystem()
    files = sorted(fs.glob(GLOB))
    cells: dict[tuple, dict] = defaultdict(lambda: defaultdict(int))
    samples: list[dict] = []

    for shard in SHARDS:
        # Read one file from the web. Only the five named columns are requested, so other
        # columns are skipped. The result is a pandas table.
        with fs.open(files[shard], "rb") as fh:
            df = pq.read_table(
                fh, columns=["session_id", "benchmark", "harness", "models", "spans"]
            ).to_pandas()
        print(f"  shard {shard}: {len(df)} sessions", flush=True)

        # Group by model as well as cell. Rows cluster by model in the parquet,
        # so taking head() per (benchmark, harness) alone samples only the first
        # one or two models and understates coverage.
        # "models" is a list. Use the first model name of each session, or "unknown" if the
        # list is empty.
        df = df.assign(_model=df.models.apply(lambda m: m[0] if len(m) else "unknown"))
        # Step 4: for each cell of this file, take up to SESSIONS_PER_CELL sessions and pass
        # every span of each session to analyse_span, which adds to that cell's counters.
        for (bench, harness, model), group in df.groupby(["benchmark", "harness", "_model"]):
            for row in group.head(SESSIONS_PER_CELL).itertuples(index=False):
                stats = cells[(bench, harness, model)]
                stats["sessions"] += 1
                # Response ids are unique per session, not globally.
                seen_responses: set[str] = set()
                for span in row.spans:
                    analyse_span(span, stats, seen_responses)

                # Keep a few real prose/tool-call pairs so the report can show
                # the mismatch rather than assert it.
                # Only messages with both a text part and a tool call are used. A sample keeps
                # the first 200 characters of the first text part, the tool names in the same
                # message, and the number of claims found in that whole text part (not just
                # the 200 characters). Collecting stops at 6 samples in total.
                if len(samples) < 6:
                    for span in row.spans:
                        raw = span.get("attributes", {}).get("gen_ai.output.messages")
                        if not raw:
                            continue
                        try:
                            msgs = json.loads(raw)
                        except (json.JSONDecodeError, TypeError):
                            continue
                        for msg in msgs:
                            parts = msg.get("parts") or []
                            texts = [p["content"] for p in parts
                                     if p.get("type") == "text" and p.get("content")]
                            names = [p.get("name") for p in parts
                                     if p.get("type") == "tool_call"]
                            if texts and names and len(samples) < 6:
                                samples.append({
                                    "benchmark": bench, "harness": harness,
                                    "agent_prose": texts[0][:200],
                                    "structured_tool_calls": names,
                                    "claims_extracted_from_prose": len(extract_claims(texts[0])),
                                })

    # Step 5: add up the counters of all cells into one "totals" dict, and keep each cell's own
    # counters in "per_cell".
    totals = defaultdict(int)
    per_cell = []
    for (bench, harness, model), s in sorted(cells.items()):
        per_cell.append({"benchmark": bench, "harness": harness, "model": model, **dict(s)})
        for k, v in s.items():
            totals[k] += v

    # Extraction rate = spans where the validator found any claim / spans that have agent
    # text. It is None (not 0) when there are no spans with text, to avoid dividing by zero.
    extraction_rate = (totals["spans_with_claims"] / totals["prose_spans"]
                       if totals["prose_spans"] else None)

    # Step 6: build the result and save it as JSON. The text for "reason" below is fixed
    # text. It was written for a run that finds zero extractions and is not computed from
    # this run's numbers.
    payload = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "data_class": "EXTERNAL_REAL_DATA",
        "source": {"dataset_id": DATASET_ID, "dataset_url": DATASET_URL,
                   "revision": revision, "retrieved_at": retrieved_at,
                   "shards_read": SHARDS, "sessions_per_cell": SESSIONS_PER_CELL},
        "validator": "backend/app/services/tool_claim.py (unmodified)",
        "labels": "NONE — the corpus carries no tool-claim correctness annotations",
        "metrics_not_reported": {
            "precision": "UNLABELLED", "recall": "UNLABELLED", "f1": "UNLABELLED",
            "reason": "no ground truth in the corpus, and with zero extractions "
                      "there are no predictions to score",
        },
        "positive_control": control,
        "totals": dict(totals),
        "extraction_rate_on_prose_spans": extraction_rate,
        "per_cell": per_cell,
        "samples": samples,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # Step 7: print the results. First a table per (benchmark, harness): the counters of
    # all models are added together here. Columns: spans with agent text ("prose"), spans
    # where a claim was found ("w/claims"), tool calls, and countable tool results.
    print("\n" + "-" * 76)
    print("PER CELL")
    print("-" * 76)
    print(f"  {'benchmark/harness':38s} {'prose':>7s} {'w/claims':>9s} {'toolcalls':>10s} {'countable':>10s}")
    agg: dict[tuple, dict] = defaultdict(lambda: defaultdict(int))
    for c in per_cell:
        a = agg[(c["benchmark"], c["harness"])]
        for k in ("prose_spans", "spans_with_claims", "tool_calls", "countable_results"):
            a[k] += c.get(k, 0)
    for (bench, harness), a in sorted(agg.items()):
        print(f"  {bench + '/' + harness:38s} {a['prose_spans']:7d} "
              f"{a['spans_with_claims']:9d} {a['tool_calls']:10d} {a['countable_results']:10d}")

    # Then the totals over all cells.
    print("\n" + "-" * 76)
    print("TOTALS")
    print("-" * 76)
    print(f"  sessions analysed              : {totals['sessions']}")
    print(f"  spans with agent prose         : {totals['prose_spans']}")
    print(f"  spans where the validator      : {totals['spans_with_claims']}")
    print(f"    extracted ANY claim          ")
    print(f"  total claims extracted         : {totals['claims_extracted']}")
    print(f"  extraction rate                : {extraction_rate}")
    print()
    print(f"  structured tool calls present  : {totals['tool_calls']}")
    print(f"  tool responses present         : {totals['tool_responses']}")
    print(f"  responses with a countable result (checkable, but never checked): "
          f"{totals['countable_results']}")
    print(f"\nResults saved to: {OUT_PATH}")


# Only run when this file is started directly, not when it is imported.
if __name__ == "__main__":
    main()
