"""Tests for multi-key authentication.

The backend recognised exactly one credential before this: a string from the
environment, compared with `==`. Nothing could be revoked, nothing attributed,
and giving one caller access meant giving everybody the same secret.

The property that matters most here is not that issued keys work -- it is that
the environment key keeps working. A deployment authenticates with it, so a
change that quietly invalidated it would take a running site down.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from app.services.api_keys import (
    KEY_PREFIX,
    _extract_prefix,
    _hash,
    generate_key,
    redact,
)
from app.models import ApiKeyRecord


class TestKeyGeneration:
    def test_a_key_is_recognisable_and_unguessable(self):
        full, prefix, digest = generate_key()
        assert full.startswith(f"{KEY_PREFIX}_")
        assert prefix in full
        # The random half is what makes it a credential; a short key would be
        # guessable however good the rest of this is.
        assert len(full) > 50

    def test_keys_do_not_repeat(self):
        keys = {generate_key()[0] for _ in range(200)}
        assert len(keys) == 200

    def test_the_stored_hash_is_not_the_key(self):
        """The database must not hold anything replayable against the API."""
        full, _, digest = generate_key()
        assert full not in digest
        assert digest == _hash(full)
        assert len(digest) == 64  # sha256 hex


class TestPrefixExtraction:
    def test_our_keys_yield_their_lookup_prefix(self):
        full, prefix, _ = generate_key()
        assert _extract_prefix(full) == prefix

    def test_anything_else_yields_nothing(self):
        """This is what keeps unrelated traffic off the database.

        The environment key and outright garbage both take the cheap path: no
        prefix means no query.
        """
        for junk in ("", "change-me-to-a-secure-key", "Bearer abc",
                     "ap_live", "ap_live_only", "sk-1234567890"):
            assert _extract_prefix(junk) is None


class TestRedaction:
    def test_the_hash_never_leaves_the_process(self):
        record = ApiKeyRecord(
            id=1, key_prefix="abc123", key_hash="a" * 64,
            owner_id="user-1", label="laptop",
        )
        out = redact(record)
        assert "a" * 64 not in str(out)
        assert "key_hash" not in out

    def test_a_revoked_key_reports_itself_as_inactive(self):
        from datetime import datetime, timezone

        record = ApiKeyRecord(
            id=1, key_prefix="abc123", key_hash="x" * 64,
            owner_id="user-1", revoked_at=datetime.now(timezone.utc),
        )
        assert redact(record)["active"] is False


class TestAuthenticationFlow:
    """End to end through the app, which is where a regression would land.

    These share the default database, like every other test in this suite.
    `app.database` builds its engine at import time, so pointing a fixture at a
    temporary database does not work -- by the time any test runs the engine is
    already bound, and an earlier attempt to redirect it kept silently writing to
    the default one anyway. Each test therefore mints its own owner id so it
    cannot see another's rows.
    """

    ENV = {"X-API-Key": "env-key-under-test"}

    @pytest.fixture
    def client(self, monkeypatch):
        """`settings` is a module-level singleton.

        The two values below are set with monkeypatch rather than assigned.
        Assigning them leaked into every test that ran afterwards -- twelve of
        them, each passing alone and failing in the suite.
        """
        from app.config import settings

        monkeypatch.setattr(settings, "api_key", "env-key-under-test")
        monkeypatch.setattr(settings, "local_dev_mode", False)

        from fastapi.testclient import TestClient
        from app.main import app

        with TestClient(app) as c:
            yield c

    @staticmethod
    def _owner(tag: str = "owner") -> str:
        import uuid

        return f"{tag}-{uuid.uuid4().hex[:10]}"

    def _issue(self, client, owner: str, label: str = "") -> dict:
        r = client.post(
            "/v1/keys", json={"owner_id": owner, "label": label}, headers=self.ENV
        )
        assert r.status_code == 201, r.text
        return r.json()

    # ── the load-bearing one ─────────────────────────────────────────────────

    def test_the_environment_key_still_works(self, client):
        """A running deployment authenticates with this.

        Everything else here is new capability; this is the one that would take
        a live site down if it regressed.
        """
        assert client.get("/v1/metrics", headers=self.ENV).status_code == 200

    def test_no_key_is_rejected(self, client):
        assert client.get("/v1/metrics").status_code == 401

    # ── issued keys ──────────────────────────────────────────────────────────

    def test_an_issued_key_authenticates(self, client):
        issued = self._issue(client, self._owner(), "laptop")["key"]
        assert client.get("/v1/metrics", headers={"X-API-Key": issued}).status_code == 200

    def test_the_plaintext_is_returned_once_and_never_listed(self, client):
        owner = self._owner()
        issued = self._issue(client, owner)["key"]

        listed = client.get(f"/v1/keys?owner_id={owner}", headers=self.ENV).json()
        assert issued not in str(listed), "the full key must not be recoverable"
        assert listed["keys"][0]["prefix"].startswith(KEY_PREFIX)

    def test_a_forged_key_is_rejected(self, client):
        """Right shape, right prefix, wrong secret."""
        created = self._issue(client, self._owner())
        prefix = created["prefix"].rstrip("\u2026").replace(f"{KEY_PREFIX}_", "")
        forged = f"{KEY_PREFIX}_{prefix}_not-the-real-secret"
        assert client.get("/v1/metrics", headers={"X-API-Key": forged}).status_code == 401

    # ── revocation ───────────────────────────────────────────────────────────

    def test_a_revoked_key_stops_working(self, client):
        owner = self._owner()
        created = self._issue(client, owner)
        issued, key_id = created["key"], created["id"]
        assert client.get("/v1/metrics", headers={"X-API-Key": issued}).status_code == 200

        client.delete(f"/v1/keys/{key_id}?owner_id={owner}", headers=self.ENV)
        assert client.get("/v1/metrics", headers={"X-API-Key": issued}).status_code == 401

    def test_one_owner_cannot_revoke_another_s_key(self, client):
        """Otherwise any authenticated caller could revoke by guessing an id."""
        created = self._issue(client, self._owner("a"))
        r = client.delete(
            f"/v1/keys/{created['id']}?owner_id={self._owner('b')}", headers=self.ENV
        )
        assert r.status_code == 404
        # And it still works, because nothing was revoked.
        assert client.get(
            "/v1/metrics", headers={"X-API-Key": created["key"]}
        ).status_code == 200

    # ── scoping ──────────────────────────────────────────────────────────────

    def test_listing_is_scoped_to_its_owner(self, client):
        a, b = self._owner("a"), self._owner("b")
        self._issue(client, a)
        self._issue(client, b)

        listed = client.get(f"/v1/keys?owner_id={a}", headers=self.ENV).json()
        assert listed["total"] == 1
        assert all(k["owner_id"] == a for k in listed["keys"])
        assert b not in str(listed)

    def test_minting_a_key_requires_a_key(self, client):
        """The endpoint that issues credentials cannot itself be open."""
        assert client.post("/v1/keys", json={"owner_id": "anyone"}).status_code == 401
