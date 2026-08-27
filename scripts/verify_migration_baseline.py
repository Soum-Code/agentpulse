"""Verify that stamping the migration baseline does not alter existing data.

`alembic stamp` should only insert a row into `alembic_version`. This asserts
that rather than assuming it: every user table's full contents are hashed before
and after, and any difference fails loudly.

The hash covers row contents, not just counts -- a migration that rewrote values
while preserving row count would pass a count check and fail this one.

Usage:
    python scripts/verify_migration_baseline.py capture <db_path> <out.json>
    python scripts/verify_migration_baseline.py compare <db_path> <out.json>
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path

# Not user data; it is the thing the stamp is supposed to add.
IGNORED_TABLES = {"alembic_version"}


def digest(db_path: str) -> dict[str, dict[str, object]]:
    conn = sqlite3.connect(db_path)
    conn.text_factory = bytes
    tables = [
        r[0].decode() if isinstance(r[0], bytes) else r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    out: dict[str, dict[str, object]] = {}
    for table in tables:
        if table.startswith("sqlite_") or table in IGNORED_TABLES:
            continue
        rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
        hasher = hashlib.sha256()
        # rowid order is not guaranteed stable across a table rewrite, so sort
        # the serialised rows before hashing.
        for row in sorted(repr(r).encode() for r in rows):
            hasher.update(row)
        out[table] = {"rows": len(rows), "sha256": hasher.hexdigest()}
    conn.close()
    return out


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    mode, db_path, state_path = sys.argv[1], sys.argv[2], sys.argv[3]

    if not Path(db_path).exists():
        raise SystemExit(f"ABORT: database not found: {db_path}")

    current = digest(db_path)

    if mode == "capture":
        Path(state_path).write_text(json.dumps(current, indent=2), encoding="utf-8")
        total = sum(int(v["rows"]) for v in current.values())
        print(f"  captured {len(current)} tables, {total} rows -> {state_path}")
        return

    if mode != "compare":
        raise SystemExit(f"ABORT: unknown mode {mode!r}")

    before = json.loads(Path(state_path).read_text(encoding="utf-8"))
    problems: list[str] = []

    for table in sorted(set(before) | set(current)):
        if table not in current:
            problems.append(f"TABLE DISAPPEARED: {table}")
            continue
        if table not in before:
            problems.append(f"TABLE APPEARED: {table}")
            continue
        b, c = before[table], current[table]
        if b["rows"] != c["rows"]:
            problems.append(f"ROW COUNT CHANGED: {table} {b['rows']} -> {c['rows']}")
        elif b["sha256"] != c["sha256"]:
            problems.append(f"CONTENT REWRITTEN: {table} ({b['rows']} rows, hash differs)")

    total = sum(int(v["rows"]) for v in current.values())
    if problems:
        for p in problems:
            print(f"  FAIL  {p}")
        raise SystemExit(f"ABORT: {len(problems)} data integrity problem(s) detected.")

    print(f"  OK  {len(current)} tables, {total} rows — every table byte-identical")


if __name__ == "__main__":
    main()
