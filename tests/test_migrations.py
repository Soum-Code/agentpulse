"""Tests for the Alembic migration baseline.

These guard the two properties the migration foundation is supposed to have,
both of which were verified manually when the baseline was created and would
otherwise silently rot:

1. Applying migrations to an empty database reproduces exactly the schema
   SQLModel's metadata describes. If a model changes without a matching
   migration, this fails -- which is the whole point of adopting migrations.
2. The baseline is reversible: upgrade -> downgrade -> upgrade returns to the
   same schema.

Also pins the current bootstrap limitation (see test_create_all_db_cannot_be_
upgraded) so that when `create_all()` is eventually replaced, the replacement
has to consciously update this test rather than quietly changing behaviour.

Every test runs against a throwaway database in tmp_path. Nothing here touches
data/agentpulse.db.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlmodel import SQLModel  # noqa: E402

import app.models  # noqa: E402,F401 - registers tables on SQLModel.metadata

BACKEND = Path(__file__).resolve().parent.parent / "backend"


def run_alembic(db_path: Path, *args: str) -> subprocess.CompletedProcess:
    """Invoke alembic as a subprocess against an isolated database.

    A subprocess rather than an in-process API call because migrations/env.py
    reads settings at import time and runs asyncio.run(); driving that inside a
    test event loop is fragile and would test the harness more than the
    migration.
    """
    env = dict(os.environ)
    env["AGENTPULSE_DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(BACKEND),
        env=env,
        capture_output=True,
        text=True,
    )


def schema_of(db_path: Path) -> dict[str, set[str]]:
    """Table -> column names, excluding alembic's own bookkeeping table."""
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    inspector = inspect(engine)
    schema = {
        table: {c["name"] for c in inspector.get_columns(table)}
        for table in inspector.get_table_names()
        if table != "alembic_version"
    }
    engine.dispose()
    return schema


def expected_schema() -> dict[str, set[str]]:
    return {
        name: {c.name for c in table.columns}
        for name, table in SQLModel.metadata.tables.items()
    }


class TestMigrationBaseline:
    def test_upgrade_reproduces_model_schema(self, tmp_path):
        """Migrating an empty DB must match what the models describe."""
        db = tmp_path / "upgrade.db"
        result = run_alembic(db, "upgrade", "head")
        assert result.returncode == 0, f"upgrade failed:\n{result.stderr}"

        migrated, expected = schema_of(db), expected_schema()
        assert set(migrated) == set(expected), (
            f"table mismatch: only in DB {set(migrated) - set(expected)}, "
            f"only in models {set(expected) - set(migrated)}"
        )
        for table in sorted(expected):
            assert migrated[table] == expected[table], (
                f"column mismatch in {table}: "
                f"only in DB {migrated[table] - expected[table]}, "
                f"only in models {expected[table] - migrated[table]}"
            )

    def test_baseline_is_reversible(self, tmp_path):
        """upgrade -> downgrade -> upgrade returns to the same schema."""
        db = tmp_path / "roundtrip.db"
        assert run_alembic(db, "upgrade", "head").returncode == 0
        before = schema_of(db)

        result = run_alembic(db, "downgrade", "base")
        assert result.returncode == 0, f"downgrade failed:\n{result.stderr}"
        assert schema_of(db) == {}, "downgrade left tables behind"

        assert run_alembic(db, "upgrade", "head").returncode == 0
        assert schema_of(db) == before, "re-upgrade did not restore the schema"

    def test_upgrade_is_idempotent(self, tmp_path):
        """Running upgrade twice is a no-op, not an error."""
        db = tmp_path / "idempotent.db"
        assert run_alembic(db, "upgrade", "head").returncode == 0
        first = schema_of(db)
        second_run = run_alembic(db, "upgrade", "head")
        assert second_run.returncode == 0, f"second upgrade failed:\n{second_run.stderr}"
        assert schema_of(db) == first

    def test_no_pending_model_changes(self, tmp_path):
        """Models and migrations agree -- autogenerate finds nothing to do.

        This is the regression guard: change a model without adding a migration
        and this fails.
        """
        db = tmp_path / "check.db"
        assert run_alembic(db, "upgrade", "head").returncode == 0
        result = run_alembic(db, "check")
        assert result.returncode == 0, (
            "models have drifted from migrations; generate a revision:\n"
            f"{result.stdout}\n{result.stderr}"
        )


class TestBootstrapLimitation:
    def test_create_all_db_cannot_be_upgraded(self, tmp_path):
        """A database bootstrapped by create_all() has no alembic_version, so
        `alembic upgrade head` tries to CREATE tables that already exist.

        This is the current, deliberate state: init_db() still calls
        create_all() and has not been replaced by the migration path. The
        replacement must make this test's expectation change consciously.
        """
        db = tmp_path / "bootstrap.db"
        engine = create_engine(f"sqlite:///{db.as_posix()}")
        SQLModel.metadata.create_all(engine)
        engine.dispose()

        result = run_alembic(db, "upgrade", "head")
        assert result.returncode != 0, (
            "upgrade unexpectedly succeeded on a create_all() database -- if "
            "the bootstrap path was fixed, update this test to match"
        )
        assert "already exists" in result.stderr

    def test_stamp_makes_a_create_all_db_migratable(self, tmp_path):
        """`alembic stamp head` is the documented remedy: it records the
        revision without re-running DDL, after which upgrade is a clean no-op.
        This is exactly what was done to the existing databases."""
        db = tmp_path / "stamped.db"
        engine = create_engine(f"sqlite:///{db.as_posix()}")
        SQLModel.metadata.create_all(engine)
        engine.dispose()
        before = schema_of(db)

        assert run_alembic(db, "stamp", "head").returncode == 0
        result = run_alembic(db, "upgrade", "head")
        assert result.returncode == 0, f"upgrade after stamp failed:\n{result.stderr}"
        assert schema_of(db) == before, "stamp+upgrade altered the schema"
