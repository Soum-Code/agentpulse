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

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from sqlmodel import select  # noqa: E402

from app.database import get_session  # noqa: E402
from app.models import Evaluation, Span, Trace  # noqa: E402


async def collect() -> tuple[dict[str, float], dict[str, tuple[int, int]]]:
    """Return (max risk per trace, (evaluated, total) span counts per trace)."""
    async with get_session() as session:
        spans = (await session.execute(select(Span.trace_id, Span.span_id))).all()
        evaluations = (
            await session.execute(select(Evaluation.span_id, Evaluation.overall_risk_score))
        ).all()

    risk_by_span = {span_id: risk for span_id, risk in evaluations if risk is not None}

    max_risk: dict[str, float] = {}
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for trace_id, span_id in spans:
        counts[trace_id][1] += 1
        risk = risk_by_span.get(span_id)
        if risk is None:
            continue
        counts[trace_id][0] += 1
        prev = max_risk.get(trace_id)
        max_risk[trace_id] = risk if prev is None else max(prev, risk)

    return max_risk, {t: (c[0], c[1]) for t, c in counts.items()}


async def main() -> int:
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

    max_risk, counts = await collect()

    async with get_session() as session:
        traces = (await session.execute(select(Trace))).scalars().all()

        risk_changes: list[tuple[str, float | None, float]] = []
        status_changes: list[tuple[str, str, str]] = []
        untouched_no_evals = 0

        for trace in traces:
            evaluated, total = counts.get(trace.trace_id, (0, 0))
            if evaluated == 0:
                untouched_no_evals += 1
                continue

            new_risk = round(max_risk[trace.trace_id], 4)
            if trace.overall_risk_score != new_risk:
                risk_changes.append((trace.trace_id, trace.overall_risk_score, new_risk))

            new_status = "completed" if total > 0 and evaluated == total else trace.status
            if new_status != trace.status:
                status_changes.append((trace.trace_id, trace.status, new_status))

            if args.limit is not None and len(risk_changes) >= args.limit:
                break

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

        if not args.apply:
            print("\nDRY RUN -- nothing written. Re-run with --apply to commit.")
            return 0

        changed = {t for t, _, _ in risk_changes} | {t for t, _, _ in status_changes}
        for trace in traces:
            if trace.trace_id not in changed:
                continue
            evaluated, total = counts.get(trace.trace_id, (0, 0))
            if evaluated == 0:
                continue
            trace.overall_risk_score = round(max_risk[trace.trace_id], 4)
            if total > 0 and evaluated == total:
                trace.status = "completed"
        await session.commit()

        print(f"\nApplied. {len(changed)} traces updated.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
