"""Issue, verify and revoke API keys.

Replaces a single key read from the environment. That key still works -- the
running deployment authenticates with it, and breaking it would take the site
down -- but it is now one valid credential among several rather than the only
one the system can recognise.

The plaintext key exists for exactly as long as it takes to return it to the
caller. Only its hash is stored, so the database holds nothing that can be
replayed against the API.
"""

# WHAT THIS FILE IS FOR
# It creates, checks, lists and revokes API keys. A key is a secret string that a client
# sends in the X-API-Key header. Only a SHA-256 hash of each key is saved in the api_keys
# table, never the key itself, so a leaked database does not leak working keys.
# A key looks like ap_live_<12 hex characters>_<random text>. The 12 hex characters (the
# "prefix") are stored as plain text and used to find the row. Then the hashes are compared.
#
# HOW IT FITS IN
# middleware.py calls verify_key() when a protected request carries a key that is not the
# key from settings.
# The /v1/keys routes in routers/__init__.py call create_key, list_keys, revoke_key and
# redact. The table itself is the ApiKeyRecord class in models.py.

from __future__ import annotations

# hashlib makes the SHA-256 hash. hmac is used for compare_digest (see verify_key).
import hashlib
import hmac
import logging
# secrets = the standard library for random values that are safe to use as keys.
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
# 6 random bytes written as hex give 12 hex characters (see generate_key).
PREFIX_BYTES = 6

# 32 bytes of urlsafe randomness. There is nothing here to brute force, which is
# why the hash below is a single SHA-256 rather than a password KDF -- bcrypt
# would only add latency to a check that runs on every request.
SECRET_BYTES = 32


# The SHA-256 hash of a key, written as 64 hex characters. This is what gets stored and
# later compared.
def _hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


# Makes a brand new random key. In backend/app only create_key calls it.
def generate_key() -> tuple[str, str, str]:
    """Return (full_key, prefix, hash). The full key is never stored."""
    # Step 1: the public prefix: 6 random bytes written as 12 hex characters.
    prefix = secrets.token_hex(PREFIX_BYTES)
    # Step 2: the secret part: 32 random bytes written as URL-safe text. That text can
    # contain "-" and "_" (see _extract_prefix, which allows for extra "_" in a key).
    secret = secrets.token_urlsafe(SECRET_BYTES)
    # Step 3: join the pieces into the full key, and hash it for storage.
    full = f"{KEY_PREFIX}_{prefix}_{secret}"
    return full, prefix, _hash(full)


def _extract_prefix(presented: str) -> Optional[str]:
    """Pull the lookup prefix out of a presented key.

    Returns None for anything not shaped like one of ours, which is how the
    environment key and outright garbage both take the cheap path without
    touching the database.
    """
    # Split the text at every "_". A real key gives ["ap", "live", <prefix>, <secret...>].
    # The secret may hold more "_", so there can be more than 4 pieces, but never fewer.
    # The first two pieces joined with "_" must equal KEY_PREFIX ("ap_live").
    parts = presented.split("_")
    if len(parts) < 4 or f"{parts[0]}_{parts[1]}" != KEY_PREFIX:
        return None
    return parts[2]


# In: a database session and the key text a client sent. Out: the key's row if the key is
# valid and not revoked, otherwise None.
async def verify_key(session: AsyncSession, presented: str) -> Optional[ApiKeyRecord]:
    """Return the matching live key record, or None.

    Compares with `hmac.compare_digest` rather than `==`. The hashes are not
    secret, but a short-circuiting comparison leaks how much of a guess was
    correct, and there is no reason to accept that when the constant-time
    version costs nothing.
    """
    # Step 1: read the prefix out of the key. If the text does not look like one of our
    # keys, stop here without any database query.
    prefix = _extract_prefix(presented)
    if prefix is None:
        return None

    # Step 2: the query asks for the api_keys row whose key_prefix equals this prefix.
    # The prefix column is unique, so there is at most one row (scalar_one_or_none).
    row = (
        await session.execute(
            select(ApiKeyRecord).where(ApiKeyRecord.key_prefix == prefix)
        )
    ).scalar_one_or_none()

    # Step 3: reject an unknown prefix or a key that was revoked.
    if row is None or row.revoked_at is not None:
        return None
    # Step 4: hash the presented key and compare it with the stored hash. A matching
    # prefix alone is not enough. This does not update last_used_at.
    if not hmac.compare_digest(row.key_hash, _hash(presented)):
        return None
    return row


# In: a session, the owner's id and an optional label. Out: the full key text (shown to the
# user once) and the saved row.
async def create_key(
    session: AsyncSession,
    owner_id: str,
    label: str = "",
) -> tuple[str, ApiKeyRecord]:
    """Issue a key. The returned plaintext is the only copy that will exist."""
    # Step 1: make a key. The row gets the prefix and the hash, never the full key.
    # An empty label is saved as "unnamed".
    full, prefix, digest = generate_key()
    record = ApiKeyRecord(
        key_prefix=prefix,
        key_hash=digest,
        owner_id=owner_id,
        label=label or "unnamed",
    )
    # Step 2: save the row. refresh() reloads it from the database, which fills in the
    # new id.
    session.add(record)
    await session.commit()
    await session.refresh(record)
    # Only the prefix is logged, never the full key.
    logger.info("Issued API key %s… for owner %s (%s)", prefix, owner_id, record.label)
    return full, record


# Returns the full rows, newest first (highest id first). The rows still contain key_hash,
# so each row must go through redact() before it is sent to a client. The /v1/keys route
# does this.
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
    # Step 1: the query asks for the row with this id AND this owner. A key that belongs
    # to someone else gives the same answer as a key that does not exist.
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
    # Step 2: revoke by saving the current time. The row is kept, not deleted. If the key
    # was already revoked, nothing changes and the function still returns True.
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        await session.commit()
        logger.info("Revoked API key %s… for owner %s", row.key_prefix, owner_id)
    return True


# Turns a key row into a plain dict that is safe to send to a client: every field except
# key_hash. "prefix" is shown as ap_live_<12 hex characters> followed by an ellipsis so a
# person can recognise a key. "active" is True while revoked_at is empty. last_used_at is
# read here, but nothing in backend/app ever sets it, so it is always None today.
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
