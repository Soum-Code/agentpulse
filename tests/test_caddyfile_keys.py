"""The Caddyfile closes the API-key routes to readers (GET and HEAD) as well as writers.

In short: deploy/azure/check_caddy_paths.sh is the real test (it runs the file in the caddy image
and needs Docker). This is the part that needs no Docker: the Caddyfile still has the @keys
matcher, it uses the same user and hash as the writes, the pattern in it matches the spellings of
/v1/keys that matter and leaves ordinary reads alone, and the backend itself routes no spelling
that the pattern leaves alone. Caddy and the backend both compare the path with percent-escapes
decoded, so the test decodes before it matches.
"""

import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

CADDYFILE = (Path(__file__).resolve().parent.parent / "deploy" / "azure" / "Caddyfile").read_text(encoding="utf-8")


def _keys_pattern() -> re.Pattern:
    block = re.search(r"@keys \{\s*expression `\{http\.request\.uri\.path\}\.matches\('([^']+)'\)`\s*\}", CADDYFILE)
    assert block, "the @keys matcher is gone from the Caddyfile"
    return re.compile(block.group(1))


def test_the_keys_matcher_has_its_own_basic_auth_with_the_same_credentials():
    assert "basic_auth @keys bcrypt" in CADDYFILE
    credentials = "{$AGENTPULSE_WRITE_USER:writes-disabled} {$AGENTPULSE_WRITE_HASH:ZGlzYWJsZWQ=}"
    assert CADDYFILE.count(credentials) == 2, "@write and @keys must share one user and hash"


# Spellings that the backend would route to the keys router (/v1/keys, /v1/keys/<id>, with the
# trailing-slash redirect) or that Caddy's own `path` matcher would have folded back to it.
MATCHED = [
    "/v1/keys", "/v1/keys/", "/v1/keys/1", "/V1/keys", "/v1/Keys", "/v1/KEYS/1",
    "//v1/keys", "/v1//keys", "/v1/keys//", "/v1/./keys", "/v1/x/../keys", "/v1/%2e/keys",
    "/v1/x/%2e%2e/keys", "/v1/%6beys", "/v1/ke%79s", "/v1%2fkeys", "/v1/keys%2f",
    "/v1/keys/../traces",
]
# Not matched: ordinary reads, names that merely start with or contain the letters, and two
# spellings the backend answers with 404 (proved below).
NOT_MATCHED = [
    "/", "/v1/traces", "/v1/traces/abckeys", "/v1/agents", "/v1/agents/turkeys/health",
    "/v1/agents/keystone/health", "/v1/agents/monkey_agent/health", "/v1/alerts", "/v1/metrics",
    "/v1/health/ready", "/v1/simulate/abc", "/chat/stream", "/assets/keys-abc123.js",
    "/v1/keys;x", "/v1/keys.json",
]


@pytest.mark.parametrize("raw_path", MATCHED)
def test_every_spelling_of_the_key_routes_is_matched(raw_path):
    assert _keys_pattern().search(unquote(raw_path)), raw_path


@pytest.mark.parametrize("raw_path", NOT_MATCHED)
def test_ordinary_reads_are_not_matched(raw_path):
    assert not _keys_pattern().search(unquote(raw_path)), raw_path


# ── what the backend really routes ─────────────────────────────────────────────────────────


async def _status(app, path: str, key: str) -> int:
    """GET `path` exactly as written (no URL tidying), the way uvicorn hands it to the app."""
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET",
        "scheme": "http", "path": unquote(path), "raw_path": path.encode(), "root_path": "",
        "query_string": b"owner_id=someone", "headers": [(b"x-api-key", key.encode())],
        "client": ("127.0.0.1", 1234), "server": ("test", 80),
    }
    status = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            status.append(message["status"])

    await app(scope, receive, send)
    return status[0]


@pytest.mark.asyncio
async def test_the_backend_routes_the_matched_spellings_and_404s_the_unmatched_ones(monkeypatch):
    """The pattern need not match `/v1/keys;x`: with the server's own key the backend does not
    route it. It does route exactly the shapes the pattern is there to catch."""
    from app.config import settings
    from app.database import init_db
    from app.main import create_app

    key = "routing-test-key"
    monkeypatch.setattr(settings, "api_key", key)
    monkeypatch.setattr(settings, "local_dev_mode", False)
    await init_db()
    app = create_app()

    # Routed, and so matched by the pattern: the list route (200), its trailing-slash form (a 307
    # redirect to it) and the path of DELETE /v1/keys/{id} (405 for a GET: the path exists).
    expected = {"/v1/keys": 200, "/v1/keys/": 307, "/v1/keys/1": 405}
    for path, status in expected.items():
        assert await _status(app, path, key) == status, path
        assert _keys_pattern().search(path), path
    # Not routed (404): case, doubled slashes, dot segments, a suffix, an extension. Some of
    # these the pattern catches anyway; the last two it leaves alone because nothing answers them.
    for path in ("/V1/keys", "/v1/Keys", "//v1/keys", "/v1//keys", "/v1/./keys", "/v1/keys;x", "/v1/keys.json"):
        assert await _status(app, path, key) == 404, path
