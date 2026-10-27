"""Limits on the live WebSocket /v1/ws/live: connections (all visitors, and per visitor) and the
size of a message a client sends.

In short: anybody can open this socket (no key is needed), so a visitor cannot hold more than
ws_max_connections_per_ip of them, the process cannot hold more than ws_max_connections, and a
client message over ws_max_message_bytes closes the connection with code 1009. The limits are in
backend/app/config.py, with AGENTPULSE_WS_MAX_* environment variables; 0 switches one off.
"""

import os
import sys

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.config import settings
from app.main import create_app
from app.routers import websocket as ws_module
from app.routers.websocket import CLOSE_MESSAGE_TOO_BIG, CLOSE_TRY_AGAIN_LATER, WebSocketManager

URL = "/v1/ws/live"
# The address of the dashboard's nginx inside Docker: inside the trusted proxy ranges, so the
# X-Forwarded-For header it forwards is believed.
TRUSTED_PEER = ("172.18.0.5", 50000)
UNTRUSTED_PEER = ("8.8.8.8", 50000)


@pytest.fixture
def manager(monkeypatch):
    """A manager of its own, so connections left open by other tests do not count here."""
    fresh = WebSocketManager()
    monkeypatch.setattr(ws_module, "ws_manager", fresh)
    return fresh


def _client(app, peer=("testclient", 50000)):
    return TestClient(app, client=peer)


def _refused(client, headers=None) -> int:
    """Try to connect, expect to be turned away, and return the close code."""
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect(URL, headers=headers or {}):
            pass
    return refused.value.code


# ── what worked before still works ──────────────────────────────────────────────────────


def test_ping_is_answered_with_pong(manager):
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        assert manager.connection_count == 1
    assert manager.connection_count == 0


def test_another_message_is_read_and_ignored(manager):
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text('{"subscribe": "all"}')
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_a_new_span_is_broadcast_to_a_connected_client(manager):
    """Ingest broadcasts through app.state.ws_manager; the limits did not change that."""
    app = create_app()
    with _client(app) as client:
        app.state.ws_manager = manager
        with client.websocket_connect(URL) as ws:
            reply = client.post(
                "/v1/ingest",
                json={"spans": [{"trace_id": "w" * 32, "span_id": "ws-limit-span-1", "agent_id": "ws-tester"}]},
                headers={"X-API-Key": settings.api_key},
            )
            assert reply.status_code == 202
            message = ws.receive_json()
            assert message["type"] == "new_span" and message["span_id"] == "ws-limit-span-1"


# ── message size ────────────────────────────────────────────────────────────────────────


def test_a_text_message_over_the_limit_closes_the_connection_with_1009(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_message_bytes", 100)
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text("x" * 101)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_text()
        assert closed.value.code == CLOSE_MESSAGE_TOO_BIG
    assert manager.connection_count == 0


def test_the_limit_counts_bytes_not_characters(manager, monkeypatch):
    """Four-byte characters: 30 of them are 120 bytes, over a limit of 100."""
    monkeypatch.setattr(settings, "ws_max_message_bytes", 100)
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text("\U0001F600" * 30)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_text()
        assert closed.value.code == CLOSE_MESSAGE_TOO_BIG


def test_a_message_exactly_at_the_limit_is_fine(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_message_bytes", 100)
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text("y" * 100)
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


def test_a_binary_frame_over_the_limit_closes_it_and_a_small_one_is_ignored(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_message_bytes", 100)
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_bytes(b"\x00" * 10)  # used to raise inside the handler; now ignored
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        ws.send_bytes(b"\x00" * 101)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_text()
        assert closed.value.code == CLOSE_MESSAGE_TOO_BIG


def test_zero_switches_the_message_limit_off(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_message_bytes", 0)
    with _client(create_app()) as client, client.websocket_connect(URL) as ws:
        ws.send_text("z" * 100_000)
        ws.send_text("ping")
        assert ws.receive_text() == "pong"


# ── connections in total ────────────────────────────────────────────────────────────────


def test_connections_over_the_total_limit_are_refused_and_a_freed_slot_is_reused(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_connections", 2)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 0)
    with _client(create_app()) as client:
        with client.websocket_connect(URL) as first, client.websocket_connect(URL):
            assert manager.connection_count == 2
            assert _refused(client) == CLOSE_TRY_AGAIN_LATER
            assert manager.connection_count == 2, "a refused connection is not counted"
            first.send_text("ping")
            assert first.receive_text() == "pong"
        assert manager.connection_count == 0
        with client.websocket_connect(URL) as again:
            again.send_text("ping")
            assert again.receive_text() == "pong"


# ── connections per visitor ─────────────────────────────────────────────────────────────


def test_one_visitor_cannot_hold_more_than_the_per_visitor_limit(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_connections", 0)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 2)
    with _client(create_app()) as client:
        with client.websocket_connect(URL), client.websocket_connect(URL):
            assert _refused(client) == CLOSE_TRY_AGAIN_LATER
        # both closed: the visitor can connect again
        with client.websocket_connect(URL):
            pass


def test_behind_the_proxy_each_visitor_is_counted_by_x_forwarded_for(manager, monkeypatch):
    """The TCP peer is always the proxy; the visitor is the address Caddy put in the header."""
    monkeypatch.setattr(settings, "ws_max_connections", 0)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 1)
    with _client(create_app(), TRUSTED_PEER) as client:
        first = {"x-forwarded-for": "203.0.113.7"}
        other = {"x-forwarded-for": "203.0.113.8"}
        with client.websocket_connect(URL, headers=first):
            assert _refused(client, first) == CLOSE_TRY_AGAIN_LATER, "same visitor, second connection"
            with client.websocket_connect(URL, headers=other):
                assert manager.connection_count == 2, "a different visitor has its own allowance"


def test_an_ipv6_visitor_is_counted_by_its_slash_64(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_connections", 0)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 1)
    with _client(create_app(), TRUSTED_PEER) as client:
        with client.websocket_connect(URL, headers={"x-forwarded-for": "2001:db8:1:2::1"}):
            # another address of the same /64 is the same visitor
            assert _refused(client, {"x-forwarded-for": "2001:db8:1:2::ffff"}) == CLOSE_TRY_AGAIN_LATER


def test_x_forwarded_for_from_an_untrusted_peer_is_ignored(manager, monkeypatch):
    """A visitor who reaches the backend directly cannot pick a new identity per connection."""
    monkeypatch.setattr(settings, "ws_max_connections", 0)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 1)
    with _client(create_app(), UNTRUSTED_PEER) as client:
        with client.websocket_connect(URL, headers={"x-forwarded-for": "203.0.113.7"}):
            assert _refused(client, {"x-forwarded-for": "203.0.113.99"}) == CLOSE_TRY_AGAIN_LATER


def test_zero_switches_both_connection_limits_off(manager, monkeypatch):
    monkeypatch.setattr(settings, "ws_max_connections", 0)
    monkeypatch.setattr(settings, "ws_max_connections_per_ip", 0)
    with _client(create_app()) as client:
        sockets = [client.websocket_connect(URL) for _ in range(5)]
        opened = [s.__enter__() for s in sockets]
        try:
            assert manager.connection_count == 5
        finally:
            for s in reversed(sockets):
                s.__exit__(None, None, None)
        assert opened and manager.connection_count == 0
