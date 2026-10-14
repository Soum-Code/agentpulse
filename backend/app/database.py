"""Database engine, session management, and table creation.

Uses async SQLite with WAL mode for concurrent read/write support.
"""

# WHAT THIS FILE IS FOR
# It builds the one database "engine" that the whole backend shares (an engine owns a
# pool of open connections to the database), a factory that makes sessions (a session =
# one unit of work: read rows, change rows, then commit or roll back), and helpers that
# create the tables and close everything. The database is SQLite (a whole database in
# one file) used through async code, so the server can do other work while it waits.
#
# HOW IT FITS IN
# main.py calls init_db at startup and close_db at shutdown. Routers, services,
# worker.py and retention_cli.py call get_session() whenever they need the database.
# The table classes come from models.py and the database address from config.py.

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# `event` lets us run our own function when SQLAlchemy does something (see below).
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
# SQLModel.metadata is the list of every table class that has been imported.
from sqlmodel import SQLModel

from app.config import settings

logger = logging.getLogger("agentpulse.database")

# Create async engine
# One engine for the whole process. The functions at the bottom of this file use it,
# so other files normally call those and never touch the engine directly.
engine = create_async_engine(
    settings.database_url,
    # echo=True prints every SQL statement; here that happens only at DEBUG level.
    echo=settings.log_level == "DEBUG",
    # False switches off the sqlite3 rule that a connection may only be used by the
    # thread that opened it.
    connect_args={"check_same_thread": False},  # SQLite specific
)


# In short: some SQLite options (PRAGMAs, such as busy_timeout) apply to one
# connection only. So the function below runs for EVERY new connection and sets three
# options: WAL journal, a 30 second wait on a locked database, and cheaper disk flushes.
# "connect" is an event SQLAlchemy raises each time the pool opens a real connection.
# engine.sync_engine is the plain (non-async) engine inside the async one.
# `PRAGMA busy_timeout` (and journal_mode) are per-connection SQLite settings,
# not database-level ones. Setting them once on a single connection at startup
# (the old approach) left every other pooled connection with the SQLite
# default busy_timeout=0 — any write lock contention under concurrent load
# raised "database is locked" immediately instead of waiting/retrying. This
# listener applies both pragmas to every physical connection the pool opens.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    """Set SQLite options on a newly opened connection (see the comments above).

    `dbapi_connection` is the low-level connection object from the database driver.
    `connection_record` is pool bookkeeping that we do not use.
    """
    cursor = dbapi_connection.cursor()
    # WAL = write-ahead log. Changes are written to a side file first, so a reader is
    # not blocked while another connection writes.
    cursor.execute("PRAGMA journal_mode=WAL")
    # If another connection holds the write lock, wait up to 30000 ms (30 seconds)
    # for it instead of failing at once with "database is locked".
    cursor.execute("PRAGMA busy_timeout=30000")
    # In short: synchronous=NORMAL = fewer flushes to disk per commit, so writes are
    # faster. The comment just below says what that costs.
    # WAL's default synchronous=FULL fsyncs on every commit, which on Windows
    # in particular adds tens of ms per write and dominates latency under
    # concurrent load. NORMAL is the standard pairing with WAL: still durable
    # against application crashes (only risks the last commit on an OS crash
    # or power loss), and is what SQLite's own docs recommend for WAL mode.
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Async session factory
# Calling async_session() gives a new AsyncSession. expire_on_commit=False keeps
# loaded objects readable after a commit. By default SQLAlchemy marks them stale after
# a commit, and in async code reading a stale value usually raises an error.
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Called once by main.py when the server starts.
async def init_db() -> None:
    """Create all tables. WAL mode and busy_timeout are applied per-connection
    by the `connect` event listener above."""
    # engine.begin() opens a connection inside a transaction that commits at the end.
    # create_all is a normal (blocking) function, so run_sync runs it on this async
    # connection. It creates every table that does not exist yet and leaves existing
    # tables as they are. It only knows the tables whose classes were imported;
    # main.py imports models.py, so that covers all of them.
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database initialized: %s", settings.database_url)


# Called once by main.py when the server stops.
async def close_db() -> None:
    """Close database connections."""
    # dispose() closes the idle connections that the pool is holding.
    await engine.dispose()
    logger.info("Database connections closed")


# Use it as `async with get_session() as session:`. When the block ends normally the
# session is committed (changes saved). If the block raises an error, the changes are
# rolled back (undone) and the error is raised again. The session is always closed.
@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    async with async_session() as session:
        try:
            # `yield` hands the session to the caller's block. The code after it runs
            # when that block finishes.
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
