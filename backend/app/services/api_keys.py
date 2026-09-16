"""Issue, verify and revoke API keys.

Replaces a single key read from the environment. That key still works -- the
running deployment authenticates with it, and breaking it would take the site
down -- but it is now one valid credential among several rather than the only
one the system can recognise.

The plaintext key exists for exactly as long as it takes to return it to the
caller. Only its hash is stored, so the database holds nothing that can be
replayed against the API.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import ApiKeyRecord

logger = logging.getLogger("agentpulse.api_keys")

# Chosen so a key is recognisable in a log or a paste without being guessable.
KEY_PREFIX = "ap_live"

# The public half, used to find the row. Long enough that collisions are not a
# practical concern, short enough to stay readable.
PREFIX_BYTES = 6

# 32 bytes of urlsafe randomness. There is nothing here to brute force, which is
# why the hash below is a single SHA-256 rather than a password KDF -- bcrypt
# would only add latency to a check that runs on every request.
SECRET_BYTES = 32


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_key() -> tuple[str, str, str]:
    """Return (full_key, prefix, hash). The full key is never stored."""
    prefix = secrets.token_hex(PREFIX_BYTES)
    secret = secrets.token_urlsafe(SECRET_BYTES)
    full = f"{KEY_PREFIX}_{prefix}_{secret}"
    return full, prefix, _hash(full)


def _extract_prefix(presented: str) -> Optional[str]:
    """Pull the lookup prefix out of a presented key.

    Returns None for anything not shaped like one of ours, which is how the
    environment key and outright garbage both take the cheap path without
    touching the database.
    """
    parts = presented.split("_")
    if len(parts) < 4 or f"{parts[0]}_{parts[1]}" != KEY_PREFIX:
        return None
    return parts[2]


async def verify_key(session: AsyncSession, presented: str) -> Optional[ApiKeyRecord]:
    """Return the matching live key record, or None.

    Compares with `hmac.compare_digest` rather than `==`. The hashes are not
    secret, but a short-circuiting comparison leaks how much of a guess was
    correct, and there is no reason to accept that when the constant-time
    version costs nothing.
    """
    prefix = _extract_prefix(presented)
    if prefix is None:
        return None

    row = (
        await session.execute(
            select(ApiKeyRecord).where(ApiKeyRecord.key_prefix == prefix)
        )
    ).scalar_one_or_none()

    if row is None or row.revoked_at is not None:
        return None
    if not hmac.compare_digest(row.key_hash, _hash(presented)):
        return None
    return row


async def create_key(
    session: AsyncSession,
    owner_id: str,
    label: str = "",
) -> tuple[str, ApiKeyRecord]:
    """Issue a key. The returned plaintext is the only copy that will exist."""
    full, prefix, digest = generate_key()
    record = ApiKeyRecord(
        key_prefix=prefix,
        key_hash=digest,
        owner_id=owner_id,
        label=label or "unnamed",
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    logger.info("Issued API key %s… for owner %s (%s)", prefix, owner_id, record.label)
    return full, record


async def list_keys(session: AsyncSession, owner_id: str) -> list[ApiKeyRecord]:
    """Keys belonging to one owner. Hashes are not returned to callers."""
    rows = await session.execute(
        select(ApiKeyRecord)
        .where(ApiKeyRecord.owner_id == owner_id)
        .order_by(ApiKeyRecord.id.desc())
    )
    return list(rows.scalars().all())


async def revoke_key(session: AsyncSession, owner_id: str, key_id: int) -> bool:
    """Revoke one of this owner's keys. Returns False if it is not theirs.

    Scoped by owner deliberately: an authenticated caller must not be able to
    revoke a key by guessing its id.
    """
    row = (
        await session.execute(
            select(ApiKeyRecord).where(
                ApiKeyRecord.id == key_id,
                ApiKeyRecord.owner_id == owner_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        await session.commit()
        logger.info("Revoked API key %s… for owner %s", row.key_prefix, owner_id)
    return True


def redact(record: ApiKeyRecord) -> dict:
    """The safe shape to hand back: everything except the hash."""
    return {
        "id": record.id,
        "prefix": f"{KEY_PREFIX}_{record.key_prefix}…",
        "label": record.label,
        "owner_id": record.owner_id,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "revoked_at": record.revoked_at.isoformat() if record.revoked_at else None,
        "last_used_at": record.last_used_at.isoformat() if record.last_used_at else None,
        "active": record.revoked_at is None,
    }
