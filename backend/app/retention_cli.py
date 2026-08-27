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

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from app.config import settings
from app.database import get_session
from app.services.retention import apply_retention

logger = logging.getLogger("agentpulse.retention.cli")


async def _amain(retention_days: int, dry_run: bool, batch_size: int) -> int:
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.info("Database: %s", settings.database_url)

    report = await apply_retention(
        get_session, retention_days, dry_run=dry_run, batch_size=batch_size
    )
    print(json.dumps(report.as_dict(), indent=2))
    return 0


def main() -> None:
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
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    raise SystemExit(
        asyncio.run(_amain(args.retention_days, args.dry_run, args.batch_size))
    )


if __name__ == "__main__":
    main()
