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

# About this file
# - What it is: a check you run by hand around `alembic stamp`. Alembic is the tool that
#   applies database migrations; "stamp" marks a database as being at a given migration
#   without running it. The stamp should only add a row to the alembic_version table (the
#   table where Alembic records which migration the database is at). This script checks that
#   nothing else changed.
# - How it works: "capture" saves a fingerprint of every user table in a SQLite database file
#   (the row count and a SHA-256 hash of the contents) to a JSON file. After the stamp,
#   "compare" takes the fingerprints again and fails if a table disappeared or appeared, or
#   its row count or contents changed.
# - How it fits in: it stands alone and uses only the standard library. PRODUCTIZATION_LOG.md
#   describes the run on the live databases.

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path

# Not user data; it is the thing the stamp is supposed to add.
IGNORED_TABLES = {"alembic_version"}


# Returns {table name: {"rows": row count, "sha256": hash of all the rows}} for every user
# table in the SQLite file db_path. The hash is a fingerprint of the contents.
def digest(db_path: str) -> dict[str, dict[str, object]]:
    conn = sqlite3.connect(db_path)
    # Return text columns as raw bytes instead of decoded strings, so the hash covers exactly
    # what is stored and nothing is decoded or changed on the way in.
    conn.text_factory = bytes
    # Step 1: list the table names in alphabetical order. SQL: sqlite_master is SQLite's own
    # catalogue of what the file contains. Because of text_factory, the names arrive as bytes,
    # so they are decoded here.
    tables = [
        r[0].decode() if isinstance(r[0], bytes) else r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    out: dict[str, dict[str, object]] = {}
    # Step 2: for each user table, read all its rows and store the row count and a hash.
    # Tables that SQLite keeps for itself (names starting with sqlite_) and alembic_version are
    # skipped.
    for table in tables:
        if table.startswith("sqlite_") or table in IGNORED_TABLES:
            continue
        # SQL: every column of every row. The table name comes from the database's own list, and
        # the double quotes protect names with unusual characters.
        rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
        # sha256 is a hash function: it turns any amount of data into a fixed 64-character
        # fingerprint. If even one byte of the data changes, the fingerprint changes completely.
        hasher = hashlib.sha256()
        # rowid order is not guaranteed stable across a table rewrite, so sort
        # the serialised rows before hashing.
        for row in sorted(repr(r).encode() for r in rows):
            hasher.update(row)
        out[table] = {"rows": len(rows), "sha256": hasher.hexdigest()}
    conn.close()
    return out


# Two modes. capture: save the fingerprints of the database to a JSON file (run it before
# the stamp). compare: fingerprint the database again and check it against that file (run it
# after the stamp). Any difference stops the script with an error message.
def main() -> None:
    # Exactly 3 arguments are needed: mode, database path, state file path. Otherwise print the
    # usage text from the top of this file (__doc__) and stop.
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    mode, db_path, state_path = sys.argv[1], sys.argv[2], sys.argv[3]

    if not Path(db_path).exists():
        raise SystemExit(f"ABORT: database not found: {db_path}")

    # Fingerprint the database as it is now. Both modes need this.
    current = digest(db_path)

    # capture: write the fingerprints to the state file, say how many tables and rows were
    # covered, and finish.
    if mode == "capture":
        Path(state_path).write_text(json.dumps(current, indent=2), encoding="utf-8")
        total = sum(int(v["rows"]) for v in current.values())
        print(f"  captured {len(current)} tables, {total} rows -> {state_path}")
        return

    # Any mode other than capture or compare is a mistake.
    if mode != "compare":
        raise SystemExit(f"ABORT: unknown mode {mode!r}")

    # compare: load the fingerprints saved earlier, then look for differences table by table.
    # Each difference is added to `problems`.
    before = json.loads(Path(state_path).read_text(encoding="utf-8"))
    problems: list[str] = []

    # Go through every table name seen before or now (| joins the two sets of names). A table
    # in only one of them is a problem. For a table in both: a different row count is reported
    # first; if the count is the same but the hash differs, the contents were rewritten.
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
    # Any problem: print each one, then stop with an error (the program exits with code 1).
    # Otherwise print the success line below.
    if problems:
        for p in problems:
            print(f"  FAIL  {p}")
        raise SystemExit(f"ABORT: {len(problems)} data integrity problem(s) detected.")

    print(f"  OK  {len(current)} tables, {total} rows — every table byte-identical")


if __name__ == "__main__":
    main()
