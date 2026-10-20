"""Backfill Trace.overall_risk_score and Trace.status from stored evaluations.

Why this exists
---------------
`overall_risk_score` and `status` are written by the evaluation runner as spans
are scored, so they are only populated for traces evaluated after that code
landed. Every trace ingested before it keeps `overall_risk_score = NULL` and
`status = "running"` forever, which is why the dashboard's risk filter matches
nothing and every trace renders with a "running" badge.

The values are not lost -- they are derivable from the `evaluations` table,
which already holds a per-span `overall_risk_score`. This script recomputes the
trace-level aggregate from those rows.

What it computes
----------------
- `overall_risk_score`: the **maximum** span risk in the trace, matching what
  `persist_results()` does incrementally at runtime. Max, not mean, because a
  single hallucinated span is the finding -- averaging it against clean spans
  hides exactly the case the product exists to surface.
- `status`: set to "completed" only when **every** span in the trace has an
  evaluation. A trace with unevaluated spans stays "running", because it is
  still awaiting work. (The runtime path currently marks a trace completed on
  its first evaluated span; this script deliberately does not reproduce that.)

Traces with no evaluated spans are left untouched.

Safety
------
Dry run by default. Nothing is written unless `--apply` is passed. Run the dry
run first and read the summary -- this rewrites two columns across every trace
in the database, and there is no undo.

Usage
-----
    python scripts/backfill_trace_aggregates.py                    # dry run
    python scripts/backfill_trace_aggregates.py --limit 50         # sample
    python scripts/backfill_trace_aggregates.py --apply            # write
"""

# About this file
# - What it is: a repair script you run by hand. It fixes two columns of the `traces` table,
#   overall_risk_score and status, for traces saved before the worker started filling them.
# - How it works: it reads the per-span scores in the `evaluations` table, finds each
#   trace's highest risk and whether all its spans have a score, and (only with --apply)
#   writes those two values back.
# - How it fits in: STARTUP_GUIDE.md shows how to run it. It reuses the backend's own
#   database session and table classes (app.database, app.models), so it reads the same
#   database the API uses.

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

# This file lives in scripts/, outside the backend package. Putting backend/ first on the
# import path lets the `from app...` imports below work.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

# select() builds a database query. These imports come after sys.path.insert on purpose;
# "noqa: E402" tells the code linter that the late position is intended.
from sqlmodel import select  # noqa: E402

from app.database import get_session  # noqa: E402
from app.models import Evaluation, Span, Trace  # noqa: E402


async def collect() -> tuple[dict[str, float], dict[str, tuple[int, int]]]:
    """Return (max risk per trace, (evaluated, total) span counts per trace)."""
    # Step 1: read every span (only its trace id and span id) and every evaluation (span id
    # and risk score). That is two plain queries; the matching is done below in Python.
    async with get_session() as session:
        spans = (await session.execute(select(Span.trace_id, Span.span_id))).all()
        evaluations = (
            await session.execute(select(Evaluation.span_id, Evaluation.overall_risk_score))
        ).all()

    # Step 2: look-up table span_id -> risk score. Evaluations with no score are left out.
    # If a span has several evaluation rows, the last scored row that was read wins.
    risk_by_span = {span_id: risk for span_id, risk in evaluations if risk is not None}

    # Step 3: go through the spans once.
    #   counts[trace] = [spans that have a score, all spans of the trace]
    #   max_risk[trace] = highest score seen so far (a trace with no score gets no entry)
    # defaultdict(lambda: [0, 0]) makes a trace start at [0, 0] the first time it is seen.
    max_risk: dict[str, float] = {}
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for trace_id, span_id in spans:
        counts[trace_id][1] += 1
        risk = risk_by_span.get(span_id)
        # No score for this span: it counts in the total but not as evaluated.
        if risk is None:
            continue
        counts[trace_id][0] += 1
        # Keep the larger of the old maximum and this span's score.
        prev = max_risk.get(trace_id)
        max_risk[trace_id] = risk if prev is None else max(prev, risk)

    return max_risk, {t: (c[0], c[1]) for t, c in counts.items()}


# Runs the whole job: work out what would change, print a summary, and write the changes
# only when --apply was given. The return value is the process exit code (0 = fine).
async def main() -> int:
    # argparse (standard library) reads the command-line options --apply and --limit.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the changes. Without this flag the script only reports.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only consider the first N traces needing a change (for sampling).",
    )
    args = parser.parse_args()

    # Step 1: work out the new numbers from the evaluations table (see collect() above).
    max_risk, counts = await collect()

    async with get_session() as session:
        # Step 2: load every Trace row and compare it with the new numbers. This only
        # builds two lists of planned changes; nothing is changed yet.
        traces = (await session.execute(select(Trace))).scalars().all()

        # Each entry is (trace id, value now, value it should get).
        risk_changes: list[tuple[str, float | None, float]] = []
        status_changes: list[tuple[str, str, str]] = []
        untouched_no_evals = 0

        for trace in traces:
            evaluated, total = counts.get(trace.trace_id, (0, 0))
            # No scored span means there is nothing to compute from, so skip this trace.
            if evaluated == 0:
                untouched_no_evals += 1
                continue

            # New risk = the highest span risk, rounded to 4 decimals (the same rounding
            # that persist_results uses when it updates a trace at runtime).
            new_risk = round(max_risk[trace.trace_id], 4)
            if trace.overall_risk_score != new_risk:
                risk_changes.append((trace.trace_id, trace.overall_risk_score, new_risk))

            # New status = "completed" only if every span has a score. Otherwise keep the
            # current status, so this script never sets a trace back to "running".
            new_status = "completed" if total > 0 and evaluated == total else trace.status
            if new_status != trace.status:
                status_changes.append((trace.trace_id, trace.status, new_status))

            # --limit: stop once N traces need a new risk value. Only risk changes are
            # counted. Because the loop stops early, the "no evaluations" number printed
            # below only covers the traces looked at so far.
            if args.limit is not None and len(risk_changes) >= args.limit:
                break

        # Step 3: print a summary, then up to 5 examples of each kind of change. Trace ids
        # are cut to 24 characters to fit; `!r` shows the old value as Python writes it, so
        # a missing risk shows as None.
        print(f"traces in database        : {len(traces)}")
        print(f"traces with no evaluations: {untouched_no_evals} (left untouched)")
        print(f"overall_risk_score updates: {len(risk_changes)}")
        print(f"status updates            : {len(status_changes)}")

        for trace_id, old, new in risk_changes[:5]:
            print(f"  risk   {trace_id[:24]:<24} {old!r:>8} -> {new}")
        for trace_id, old, new in status_changes[:5]:
            print(f"  status {trace_id[:24]:<24} {old:>9} -> {new}")
        if len(risk_changes) > 5 or len(status_changes) > 5:
            print("  ...")

        # Dry run: stop here. No Trace object was modified, so nothing is saved.
        if not args.apply:
            print("\nDRY RUN -- nothing written. Re-run with --apply to commit.")
            return 0

        # Step 4 (only with --apply): write the planned values. `changed` = ids of the
        # traces that have a planned risk change or status change.
        changed = {t for t, _, _ in risk_changes} | {t for t, _, _ in status_changes}
        for trace in traces:
            if trace.trace_id not in changed:
                continue
            evaluated, total = counts.get(trace.trace_id, (0, 0))
            if evaluated == 0:
                continue
            # Same formulas as in step 2. Setting the attributes marks the rows as
            # modified; commit() below saves all of them in one go.
            trace.overall_risk_score = round(max_risk[trace.trace_id], 4)
            if total > 0 and evaluated == total:
                trace.status = "completed"
        await session.commit()

        print(f"\nApplied. {len(changed)} traces updated.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
