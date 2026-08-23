"""Database engine, session management, and table creation.

Uses async SQLite with WAL mode for concurrent read/write support.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from app.config import settings

logger = logging.getLogger("agentpulse.database")

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.log_level == "DEBUG",
    connect_args={"check_same_thread": False},  # SQLite specific
)


# `PRAGMA busy_timeout` (and journal_mode) are per-connection SQLite settings,
# not database-level ones. Setting them once on a single connection at startup
# (the old approach) left every other pooled connection with the SQLite
# default busy_timeout=0 — any write lock contention under concurrent load
# raised "database is locked" immediately instead of waiting/retrying. This
# listener applies both pragmas to every physical connection the pool opens.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    # WAL's default synchronous=FULL fsyncs on every commit, which on Windows
    # in particular adds tens of ms per write and dominates latency under
    # concurrent load. NORMAL is the standard pairing with WAL: still durable
    # against application crashes (only risks the last commit on an OS crash
    # or power loss), and is what SQLite's own docs recommend for WAL mode.
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Async session factory
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    """Create all tables. WAL mode and busy_timeout are applied per-connection
    by the `connect` event listener above."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database initialized: %s", settings.database_url)


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
