"""The F1 SignalR WebSocket client — a direct port of the proven-working
logic in apps/ingest/src/feed/connect.ts and feed/live.ts, using `requests`
+ `websockets` instead of Node's stack. This is the piece that, tested
directly against F1's feed tonight, receives CarData.z/Position.z where the
Node client doesn't (see the module docstring in apps/ingest's connect.ts
history / tonight's investigation for the byte-level comparison).

This module only knows about the SignalR wire protocol — it has no idea what
a "session" or "driver" is. Every post-handshake frame (completion or
invocation) is handed to `on_frame` verbatim, record-separator included, for
server.py to cache/broadcast to Node.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from typing import Callable
from urllib.parse import quote

from websockets.asyncio.client import ClientConnection, connect

from . import metrics
from .negotiate import negotiate
from .topics import ORIGIN, TOPICS, USER_AGENT, WS_URL

RECORD_SEPARATOR = "\x1e"
PING_INTERVAL_S = 15
BASE_BACKOFF_S = 1.0
MAX_BACKOFF_S = 30.0

log = logging.getLogger("f1_sidecar.upstream")


class Upstream:
    """Owns the F1 connection lifecycle: negotiate, handshake, two-step
    Subscribe, keepalive ping, and reconnect with exponential backoff
    (mirrors feed/live.ts's connectLive)."""

    def __init__(
        self,
        on_frame: Callable[[str], None],
        on_connected: Callable[[bool], None],
    ) -> None:
        self._on_frame = on_frame
        self._on_connected = on_connected
        self._closed = False
        self._attempt = 0
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        """Start (or restart) the connection loop. Idempotent while already
        running; safe to call again after close() to reconnect on demand."""
        if self._task is not None and not self._task.done():
            return
        self._closed = False
        self._attempt = 0
        self._task = asyncio.ensure_future(self._run_forever())

    async def close(self) -> None:
        self._closed = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._on_connected(False)
        metrics.gauge("sidecar.upstream.connected", 0)

    async def _run_forever(self) -> None:
        while not self._closed:
            try:
                await self._connect_once()
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 — reconnect on anything
                log.warning("upstream: connection error: %s", err)
            if self._closed:
                return
            self._on_connected(False)
            metrics.gauge("sidecar.upstream.connected", 0)
            metrics.count("sidecar.upstream.reconnect")
            self._attempt += 1
            delay = _backoff_delay(self._attempt)
            metrics.gauge("sidecar.upstream.backoff_delay_seconds", delay)
            log.info("upstream: reconnecting in %.1fs (attempt %d)", delay, self._attempt)
            await asyncio.sleep(delay)

    async def _connect_once(self) -> None:
        neg = negotiate()
        url = f"{WS_URL}?id={_q(neg.connection_token)}&authToken={_q(neg.access_token)}"
        headers = {"User-Agent": USER_AGENT, "Origin": ORIGIN}
        if neg.cookie:
            headers["Cookie"] = neg.cookie

        async with connect(url, additional_headers=headers) as ws:
            # Byte-exact match to a real browser's handshake frame (verified
            # from a raw packet capture) — note the two spaces, after "json",
            # and after "version":. See feed/connect.ts.
            await ws.send(f'{{"protocol":"json", "version": 1}}{RECORD_SEPARATOR}')

            handshake_done = False
            ping_task: asyncio.Task | None = None
            try:
                async for raw in ws:
                    for chunk in _split_frames(raw if isinstance(raw, str) else raw.decode("utf-8")):
                        if not handshake_done:
                            handshake_done = True
                            frame = _try_parse(chunk)
                            if isinstance(frame, dict) and "error" in frame:
                                raise RuntimeError(f"handshake rejected: {frame['error']}")
                            await self._subscribe(ws)
                            ping_task = asyncio.ensure_future(_ping_loop(ws))
                            self._attempt = 0
                            log.info("upstream: connected")
                            self._on_connected(True)
                            metrics.gauge("sidecar.upstream.connected", 1)
                            continue
                        self._on_frame(chunk + RECORD_SEPARATOR)
            finally:
                if ping_task is not None:
                    ping_task.cancel()

        raise ConnectionError("upstream websocket closed")

    async def _subscribe(self, ws: ClientConnection) -> None:
        # A real browser sends two Subscribe invocations, not one: first
        # SessionInfo alone, then everything else — verified from a raw
        # capture, matched here since that's part of the proven-working shape.
        await ws.send(
            json.dumps(
                {
                    "type": 1,
                    "invocationId": "1",
                    "nonblocking": False,
                    "target": "Subscribe",
                    "arguments": [["SessionInfo"]],
                }
            )
            + RECORD_SEPARATOR
        )
        await ws.send(
            json.dumps(
                {
                    "type": 1,
                    "invocationId": "2",
                    "nonblocking": False,
                    "target": "Subscribe",
                    "arguments": [TOPICS],
                }
            )
            + RECORD_SEPARATOR
        )


def _q(s: str) -> str:
    return quote(s, safe="")


def _split_frames(raw: str) -> list[str]:
    return [c for c in raw.split(RECORD_SEPARATOR) if c]


def _try_parse(chunk: str) -> object:
    try:
        return json.loads(chunk)
    except ValueError:
        return None


async def _ping_loop(ws: ClientConnection) -> None:
    while True:
        await asyncio.sleep(PING_INTERVAL_S)
        try:
            await ws.send(f'{{"type":6}}{RECORD_SEPARATOR}')
        except Exception:
            return


def _backoff_delay(attempt: int) -> float:
    backoff = min(MAX_BACKOFF_S, BASE_BACKOFF_S * (2 ** (attempt - 1)))
    jitter = backoff * 0.25 * _pseudo_jitter(attempt)
    return backoff + jitter


# Deterministic jitter (matches feed/live.ts's own reconnect backoff).
def _pseudo_jitter(n: int) -> float:
    x = math.sin(n * 12.9898) * 43758.5453
    return x - math.floor(x)


def is_completion_frame(chunk_with_rs: str) -> bool:
    """True if this forwarded chunk is the Subscribe completion (the full
    snapshot reply) rather than an incremental invocation."""
    chunk = chunk_with_rs.rstrip(RECORD_SEPARATOR)
    frame = _try_parse(chunk)
    return isinstance(frame, dict) and frame.get("type") == 3 and isinstance(frame.get("result"), dict)
