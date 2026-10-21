"""deploy/azure/schema_check.py adds a missing nullable column and stops on anything else.

The deploy runs it against a copy of the live database, whose schema comes from create_all
and never gains a column on its own (SESSION_HANDOFF.md 28.12).
"""

import importlib.util
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

_spec = importlib.util.spec_from_file_location("schema_check", ROOT / "deploy/azure/schema_check.py")
schema_check = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(schema_check)


def _db(tmp_path: Path) -> Path:
    path = tmp_path / "agentpulse.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    engine.dispose()
    return path


def test_a_matching_database_needs_nothing(tmp_path):
    assert schema_check.plan(sqlite3.connect(_db(tmp_path))) == ([], [])


def test_a_missing_nullable_column_is_added(tmp_path):
    path = _db(tmp_path)
    db = sqlite3.connect(path)
    db.execute("ALTER TABLE evaluations DROP COLUMN grounding_input_tokens")
    db.commit()
    db.close()

    assert schema_check.main(str(path)) == 0
    assert schema_check.plan(sqlite3.connect(path)) == ([], [])


def test_a_missing_not_null_column_stops_the_deploy(tmp_path):
    path = _db(tmp_path)
    db = sqlite3.connect(path)
    db.execute("ALTER TABLE worker_heartbeats DROP COLUMN jobs_processed")

    alters, problems = schema_check.plan(db)
    assert alters == []
    assert len(problems) == 1 and problems[0].startswith("worker_heartbeats.jobs_processed ")
    assert schema_check.main(str(path)) == 1
