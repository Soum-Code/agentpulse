"""Run data retention as a scheduled operation.

    python -m app.retention_cli --dry-run          # report only, deletes nothing
    python -m app.retention_cli                    # apply, using settings.retention_days
    python -m app.retention_cli --retention-days 7 # override the window

Deliberately a separate entry point rather than a timer inside the API or the
worker. Deletion is the one operation in this system that cannot be undone, so
it should be something an operator schedules explicitly (cron, Task Scheduler,
a Kubernetes CronJob) and can see the output of, not something that happens as a
side effect of a process that exists for another reason.

`--dry-run` is the recommended first invocation on any database that has never
had retention applied: the first run on a long-lived system may delete a great
deal, and the count should be seen before the deletion happens.
"""

# WHAT THIS FILE IS FOR
# A small command-line program that deletes old data (traces, spans, scores, drift
# records, alerts and finished evaluation jobs) from the database. It reads the
# options from the command line, calls apply_retention, and prints a JSON report of
# what was deleted (or, with --dry-run, what would be deleted).
#
# HOW IT FITS IN
# Run it by hand or from a scheduler. It uses config.py (the default number of days),
# database.py (get_session) and services/retention.py (the code that really deletes).
# Nothing else in the backend starts it.

from __future__ import annotations

# argparse reads the command-line options. asyncio runs the async function below.
import argparse
import asyncio
import json
import logging

from app.config import settings
from app.database import get_session
from app.services.retention import apply_retention

logger = logging.getLogger("agentpulse.retention.cli")


async def _amain(retention_days: int, dry_run: bool, batch_size: int) -> int:
    """Run one retention pass, print the report, and return the exit code (always 0).

    If apply_retention raises an error it is not caught here, so the program then
    stops with an error instead of returning 0.
    """
    # Step 1: set up logging. The level name from settings is looked up on the logging
    # module as it is, so it must be upper case, such as INFO. A name like "info" makes
    # basicConfig raise TypeError (main.py upper-cases it first; this file does not).
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Step 2: log which database is being used, so the operator can see it.
    logger.info("Database: %s", settings.database_url)

    # Step 3: do the work. We pass the get_session function itself, not one session,
    # because apply_retention opens a fresh session for each batch of traces.
    # With dry_run=True it only counts rows and deletes nothing.
    report = await apply_retention(
        get_session, retention_days, dry_run=dry_run, batch_size=batch_size
    )
    # Step 4: print the report as JSON: the cutoff time, rows deleted per table, the
    # total, and the tables that retention never touches.
    print(json.dumps(report.as_dict(), indent=2))
    return 0


def main() -> None:
    """Read the command-line options, run one retention pass, and exit."""
    parser = argparse.ArgumentParser(description="AgentPulse data retention")
    parser.add_argument(
        "--retention-days", type=int, default=settings.retention_days,
        help=f"delete operational data older than this many days "
             f"(default: {settings.retention_days} from settings; 0 disables)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="report what would be deleted without deleting it",
    )
    # Batch size = how many expired traces are deleted in one database transaction,
    # so a big clean-up is split into short transactions instead of one long lock.
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    # asyncio.run runs _amain to the end and gives back its result (0). SystemExit
    # then ends the program with that number as the exit code (0 = success).
    raise SystemExit(
        asyncio.run(_amain(args.retention_days, args.dry_run, args.batch_size))
    )


if __name__ == "__main__":
    main()
