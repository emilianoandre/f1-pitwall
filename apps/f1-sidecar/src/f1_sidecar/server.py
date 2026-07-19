"""Local WebSocket server that apps/ingest connects to (see
apps/ingest/src/feed/sidecarClient.ts) — broadcasts every frame received
from Upstream to all connected Node clients, replaying the cached Subscribe
completion (the full snapshot) to each newly-connected client so Node's
existing "every (re)connect gets a fresh snapshot" handling keeps working
unmodified.
"""

from __future__ import annotations

import asyncio
import logging

from websockets.asyncio.server import ServerConnection, broadcast, serve

from .upstream import is_completion_frame

log = logging.getLogger("f1_sidecar.server")


class RelayServer:
    def __init__(self) -> None:
        self._clients: set[ServerConnection] = set()
        self._last_snapshot: str | None = None

    def on_upstream_frame(self, chunk_with_rs: str) -> None:
        if is_completion_frame(chunk_with_rs):
            self._last_snapshot = chunk_with_rs
        if self._clients:
            broadcast(self._clients, chunk_with_rs)

    def on_upstream_connected(self, connected: bool) -> None:
        if not connected:
            # The upstream F1 connection dropped — close every Node client
            # rather than go quiet, so Node's own reconnect loop notices and
            # gets a fresh snapshot once we've reconnected upstream.
            self._last_snapshot = None
            for client in list(self._clients):
                asyncio.ensure_future(client.close())

    async def _handler(self, ws: ServerConnection) -> None:
        self._clients.add(ws)
        log.info("server: ingest client connected (%d total)", len(self._clients))
        try:
            if self._last_snapshot is not None:
                await ws.send(self._last_snapshot)
            async for _ in ws:
                pass  # Node never sends anything meaningful on this connection
        finally:
            self._clients.discard(ws)
            log.info("server: ingest client disconnected (%d total)", len(self._clients))

    async def serve_forever(self, port: int) -> None:
        async with serve(self._handler, "0.0.0.0", port):
            await asyncio.Future()  # run until cancelled
