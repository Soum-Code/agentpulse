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
# Note: the dashboard only has a helper that builds this URL (websocketUrlFor in
# dashboard/src/lib/api.ts); no code in the repo calls `new WebSocket`.

from __future__ import annotations

import json
import logging
from typing import Any

# FastAPI's WebSocket object is one open connection: it can accept, send text and receive
# text. WebSocketDisconnect is the error raised when the client closes the connection.
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("agentpulse.websocket")
router = APIRouter(tags=["websocket"])


# Keeps the list of connected clients and sends messages to all of them. The list lives in
# this process's memory only, so it is empty after a restart and is not shared if several
# API processes run.
class WebSocketManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self) -> None:
        # The open connections, in the order they connected.
        self._connections: list[WebSocket] = []

    # Called when a client connects: accept() finishes the WebSocket handshake (the opening
    # exchange that turns a normal HTTP request into a WebSocket), then remember the client.
    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("WebSocket client connected (%d total)", len(self._connections))

    # Forget a client. The `in` check makes it safe to call more than once for the same one.
    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)
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
    # Step 1: accept the client and add it to the manager's list.
    await ws_manager.connect(websocket)
    try:
        # Step 2: loop for as long as the client stays connected.
        while True:
            # Keep connection alive, listen for client messages
            # receive_text() waits until the client sends a text message.
            data = await websocket.receive_text()
            # Client can send ping/pong or subscription messages
            # In the code only "ping" is handled (the server answers "pong", a keep-alive
            # check). Any other message is read and ignored. There is no subscription logic:
            # every connected client gets every broadcast.
            if data == "ping":
                await websocket.send_text("pong")
    # Step 3: when the client closes the connection, receive_text() raises
    # WebSocketDisconnect, and we remove the client from the list.
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
