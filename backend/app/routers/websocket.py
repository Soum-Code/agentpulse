"""WebSocket manager for real-time dashboard updates."""

# WHAT THIS FILE IS FOR
# Live updates. A client (for example a browser) opens a WebSocket, which is a long-lived
# two-way connection, unlike a normal request that ends after one reply. The URL is
# /v1/ws/live. This file keeps the list of open connections and can send one message to all
# of them (a "broadcast"). The only code that broadcasts is routers/ingest.py, which sends a
# small "new_span" message per span, but only for requests that saved at least one span.
#
# HOW IT FITS IN
# main.py includes `router` and puts `ws_manager` on app.state so ingest.py can reach it.
# No API key is needed: middleware.py lists "/v1/ws/" as public, and Starlette's
# BaseHTTPMiddleware lets WebSocket connections pass without running its checks anyway.
# Because anybody can connect, three limits from config.py keep one visitor from using up the
# server: open connections in total (ws_max_connections), open connections per visitor
# (ws_max_connections_per_ip) and the size of a message a client sends (ws_max_message_bytes).
# Note: the dashboard only has a helper that builds this URL (websocketUrlFor in
# dashboard/src/lib/api.ts); no code in the repo calls `new WebSocket`.

from __future__ import annotations

import json
import logging
from typing import Any

# FastAPI's WebSocket object is one open connection: it can accept, send text and receive
# text. WebSocketDisconnect is the error raised when the client closes the connection.
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
# client_ip() turns the TCP peer plus X-Forwarded-For into the visitor's address, the same way
# the Telemetry Lab limit does; the trusted proxy ranges are the ones set for that limit.
from app.services.simulate_guard import SimulateSettings, client_ip

logger = logging.getLogger("agentpulse.websocket")
router = APIRouter(tags=["websocket"])

# The WebSocket close codes (RFC 6455): "your message is too big", and "try again later",
# which is what a refused connection gets.
CLOSE_MESSAGE_TOO_BIG = 1009
CLOSE_TRY_AGAIN_LATER = 1013


# Keeps the list of connected clients and sends messages to all of them. The list lives in
# this process's memory only, so it is empty after a restart and is not shared if several
# API processes run.
class WebSocketManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self) -> None:
        # The open connections, in the order they connected.
        self._connections: list[WebSocket] = []
        # Whose each open connection is: the visitor key from client_ip(). The number of
        # connections one visitor has is how many entries hold their key.
        self._visitor_of: dict[WebSocket, str] = {}
        # The proxy ranges whose X-Forwarded-For is believed. Read from the environment the
        # first time a connection arrives (the same setting as the Telemetry Lab limit).
        self._trusted_proxies = None

    # In short: who this connection is, as a key to count connections under. In the public
    # deployment the TCP peer is the dashboard's nginx, so the visitor comes from the
    # X-Forwarded-For header that Caddy set; a header from anyone else is ignored.
    def visitor_key(self, websocket: WebSocket) -> str:
        if self._trusted_proxies is None:
            self._trusted_proxies = SimulateSettings.from_env().trusted_proxies
        peer = websocket.client.host if websocket.client else None
        forwarded = ", ".join(websocket.headers.getlist("x-forwarded-for")) or None
        return client_ip(peer, forwarded, self._trusted_proxies)

    # In short: None when this connection may be accepted, otherwise a short reason for the
    # log. A limit of 0 is off.
    def refusal_reason(self, websocket: WebSocket) -> str | None:
        total_limit = settings.ws_max_connections
        if total_limit > 0 and len(self._connections) >= total_limit:
            return f"{len(self._connections)} connections are open (limit {total_limit})"
        per_visitor = settings.ws_max_connections_per_ip
        if per_visitor > 0:
            key = self.visitor_key(websocket)
            open_now = sum(1 for k in self._visitor_of.values() if k == key)
            if open_now >= per_visitor:
                return f"{key} already has {open_now} connections open (limit {per_visitor})"
        return None

    # Called when a client connects: accept() finishes the WebSocket handshake (the opening
    # exchange that turns a normal HTTP request into a WebSocket), then remember the client.
    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        self._visitor_of[websocket] = self.visitor_key(websocket)
        logger.info("WebSocket client connected (%d total)", len(self._connections))

    # Forget a client. The `in` check makes it safe to call more than once for the same one.
    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)
        self._visitor_of.pop(websocket, None)
        logger.info("WebSocket client disconnected (%d total)", len(self._connections))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send data to all connected WebSocket clients."""
        # Step 1: if nobody is connected there is nothing to do.
        if not self._connections:
            return

        # Step 2: turn the dict into JSON text once, and reuse it for every client.
        # default=str makes values JSON cannot handle (like a datetime) turn into their text.
        message = json.dumps(data, default=str)
        disconnected = []

        # Step 3: send to each client, one after another. If a send raises an error, the
        # client is treated as gone. It is only noted here, because removing items from a
        # list while looping over it would skip some.
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)

        # Step 4: now drop the clients whose send failed.
        for ws in disconnected:
            self.disconnect(ws)

    # How many clients are connected right now. (Nothing else in the repo uses this.)
    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Global manager instance
# One shared instance for the whole process. main.py stores it on app.state.ws_manager.
ws_manager = WebSocketManager()


# WS /v1/ws/live -> one handler call per connected client. It runs until that client leaves.
@router.websocket("/v1/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    # Step 0: too many connections already (in total, or from this visitor) -> turn this one
    # away before the handshake is finished. The client sees a refused connection (HTTP 403),
    # and the reason goes to the log.
    reason = ws_manager.refusal_reason(websocket)
    if reason is not None:
        logger.warning("WebSocket connection refused: %s", reason)
        await websocket.close(code=CLOSE_TRY_AGAIN_LATER)
        return

    # Step 1: accept the client and add it to the manager's list.
    await ws_manager.connect(websocket)
    try:
        # Step 2: loop for as long as the client stays connected.
        while True:
            # Keep connection alive, listen for client messages
            # receive() waits for the next frame and returns the raw message, so a binary
            # frame or a disconnect does not raise by surprise the way receive_text() did.
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            data = message.get("text")
            # Step 3: a message bigger than the limit closes the connection (code 1009). The
            # size is counted in bytes, as sent. (uvicorn has its own, larger, ceiling for one
            # frame as well: --ws-max-size in backend/Dockerfile.)
            size = len(data.encode("utf-8")) if data is not None else len(message.get("bytes") or b"")
            limit = settings.ws_max_message_bytes
            if limit > 0 and size > limit:
                logger.warning("WebSocket message of %d bytes refused (limit %d)", size, limit)
                await websocket.close(code=CLOSE_MESSAGE_TOO_BIG)
                break
            # Client can send ping/pong or subscription messages
            # In the code only "ping" is handled (the server answers "pong", a keep-alive
            # check). Any other message is read and ignored. There is no subscription logic:
            # every connected client gets every broadcast.
            if data == "ping":
                await websocket.send_text("pong")
    # Step 4: when the client closes the connection, send_text() raises WebSocketDisconnect;
    # either way (that, or we left the loop above) the client is removed from the list.
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket)
