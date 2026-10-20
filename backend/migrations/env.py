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

# ---- What this file is for ---------------------------------------------------
# Alembic is the tool that changes the database layout (tables and columns) step by
# step. Each step is a "migration" file in migrations/versions/. This file, env.py, is
# the setup code that Alembic loads first whenever a command has to work with the
# database, such as `alembic upgrade head`. It tells Alembic which database to open and
# which tables the app expects, and then it runs the migration files in order.
#
# How it fits in: it reads the database address from app/config.py and the table
# definitions from app/models.py. The migration files in versions/ are run by the code
# at the bottom of this file. backend/alembic.ini holds the other Alembic settings.
# ------------------------------------------------------------------------------

import asyncio
import sys
# fileConfig sets up Python logging from the logging sections of alembic.ini.
from logging.config import fileConfig
from pathlib import Path

# pool is used to pick the connection-pool type (see run_async_migrations).
from sqlalchemy import pool
from sqlalchemy.engine import Connection
# Builds an async database engine from the settings in alembic.ini.
from sqlalchemy.ext.asyncio import async_engine_from_config

# `context` is Alembic's handle on the current run (offline or online, which database).
from alembic import context

# `app` lives one level up from migrations/. Added explicitly so alembic works
# regardless of how it was invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import SQLModel  # noqa: E402

import app.models  # noqa: E402,F401 - registers every table on SQLModel.metadata
from app.config import settings  # noqa: E402

# The settings Alembic read from alembic.ini.
config = context.config

# Turn on logging as alembic.ini describes it (skipped if there is no ini file).
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Single source of truth for the connection target: whatever the app would use.
config.set_main_option("sqlalchemy.url", settings.database_url)

# In short: the list of tables the app expects. `alembic revision --autogenerate` compares
# it with the real database to work out what a new migration must change.
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Emit SQL without connecting, for review or manual application."""
    # In short: configure Alembic with only a URL (no live connection), so it prints SQL.
    # literal_binds=True writes the values straight into the SQL text instead of as
    # placeholders. paramstyle "named" is the placeholder style Alembic should assume.
    # render_as_batch is explained in the module docstring above. compare_type=True makes
    # autogenerate notice a column whose type has changed.
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )

    # Work out which migration files are due and "run" them. Offline, this writes their
    # SQL out as text instead of sending it to a database.
    with context.begin_transaction():
        context.run_migrations()


# Runs the migrations on an open database connection. run_async_migrations hands it the
# connection through run_sync (Alembic's own code is not async).
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        # Without this, a changed column type is silently not detected by
        # autogenerate and the migration looks like a no-op.
        compare_type=True,
    )

    # Run the migration files that are due (each one's upgrade or downgrade function).
    with context.begin_transaction():
        context.run_migrations()


# Opens an async connection to the real database and runs the migrations on it.
async def run_async_migrations() -> None:
    # Step 1: build the database engine from the [alembic] section of alembic.ini (only
    # the keys that start with "sqlalchemy."; the url was set above). NullPool = keep no
    # pool of open connections, which suits a short command that runs once and exits.
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    # Step 2: connect, and run the migrations through run_sync (see do_run_migrations).
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    # Step 3: close the engine.
    await connectable.dispose()


# "Online" = connected to the database. asyncio.run starts an event loop for the async
# function above and waits for it to finish.
def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# This is the part that actually runs when Alembic loads this file. Offline mode (the
# `--sql` option) prints the SQL. Otherwise the migrations are applied to the database.
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
