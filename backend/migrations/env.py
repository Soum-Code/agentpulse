"""Alembic migration environment for AgentPulse.

Three deviations from the stock async template, each load-bearing:

1. `target_metadata` is SQLModel's registry, populated by importing `app.models`.
   Without that import the metadata is empty and `--autogenerate` would emit a
   migration that drops every table.

2. The database URL comes from `app.config.settings`, not from `alembic.ini`.
   The application resolves `AGENTPULSE_DATABASE_URL` at runtime; hardcoding a
   URL in the ini file would let migrations run against a different database
   than the one the app uses. Note the default is a RELATIVE sqlite path, so the
   database that gets migrated depends on the working directory -- run alembic
   from `backend/` to target `backend/data/agentpulse.db`, or set the env var
   explicitly. This is pre-existing application behaviour, not introduced here.

3. `render_as_batch=True`. SQLite cannot ALTER most column properties; Alembic's
   batch mode emulates them by creating a new table, copying rows, and swapping.
   Without it, later migrations that alter a column would fail on SQLite at the
   point they are needed rather than at the point they are written.
"""

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# `app` lives one level up from migrations/. Added explicitly so alembic works
# regardless of how it was invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import SQLModel  # noqa: E402

import app.models  # noqa: E402,F401 - registers every table on SQLModel.metadata
from app.config import settings  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Single source of truth for the connection target: whatever the app would use.
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Emit SQL without connecting, for review or manual application."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        # Without this, a changed column type is silently not detected by
        # autogenerate and the migration looks like a no-op.
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
