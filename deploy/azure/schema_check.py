"""Compare the app's tables with a SQLite database and add missing nullable columns.

deploy.sh runs this inside the candidate backend image, against a copy of the live
database, before anything live changes:

    docker run --rm -i -v <dir>:/t <image> python - /t/agentpulse.db < deploy/azure/schema_check.py

The live database has no alembic_version table. Its schema comes from create_all, which
creates missing tables but never adds a column to a table that exists (SESSION_HANDOFF.md
28.12). So a column the models have and the database lacks is added here, but only if it
is a plain nullable column, the kind 28.12 added by hand. Older code ignores such a column
and its old rows hold NULL. Anything else (NOT NULL, a key, a unique or indexed column, a
server default) stops the deploy instead of being guessed at.

Not checked: type changes, dropped columns, and new indexes or constraints on columns that
already exist.

Prints each ALTER TABLE it ran on stdout, one per line, so deploy.sh can run the same
statements on the live database. Everything else goes to stderr.
"""

from __future__ import annotations

import sqlite3
import sys

from sqlalchemy.dialects import sqlite
from sqlalchemy.schema import CreateColumn
from sqlmodel import SQLModel

import app.models  # noqa: F401 - registers the tables on SQLModel.metadata


def plan(db: sqlite3.Connection) -> tuple[list[str], list[str]]:
    """Return (ALTER TABLE statements to run, columns that need a person)."""
    alters: list[str] = []
    problems: list[str] = []
    for table in SQLModel.metadata.sorted_tables:
        have = {row[1] for row in db.execute(f'PRAGMA table_info("{table.name}")')}
        if not have:
            continue  # a new table: create_all makes it when the API starts
        indexed = {col.name for index in table.indexes for col in index.columns}
        for col in table.columns:
            if col.name in have:
                continue
            if (col.nullable and not col.primary_key and not col.unique
                    and not col.foreign_keys and col.server_default is None
                    and col.name not in indexed):
                ddl = CreateColumn(col).compile(dialect=sqlite.dialect())
                alters.append(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}')
            else:
                problems.append(f"{table.name}.{col.name} is missing and is not a plain nullable column")
    return alters, problems


def main(path: str) -> int:
    db = sqlite3.connect(path)
    alters, problems = plan(db)
    for problem in problems:
        print(f"schema: {problem}; add it by hand, then run the deploy again", file=sys.stderr)
    if problems:
        return 1
    for statement in alters:
        db.execute(statement)
        print(statement)
    db.commit()
    print(f"schema: {len(alters)} nullable column(s) to add", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
