"""Entrypoint: wires Upstream (F1 connection) to RelayServer (what Node
connects to) and runs both forever.

The upstream F1 connection is on-demand, not always-on: it starts only once
at least one Node client is connected (i.e. apps/ingest switched to live
mode — which itself only happens while someone's on the live tab of the
site) and stops shortly after the last one disconnects. This keeps the
sidecar from holding a connection to F1 in the background around the clock.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from .auth import has_f1tv_credentials
from .server import RelayServer
from .upstream import Upstream

# Grace period before actually dropping the upstream F1 connection after the
# last Node client disconnects, so a brief reconnect blip in Node's own
# backoff loop doesn't thrash the F1 connection (rapid reconnects there are
# also more likely to look bot-like to F1's own bot detection).
IDLE_STOP_DELAY_S = 20


class LifecycleManager:
    def __init__(self, upstream: Upstream, log: logging.Logger) -> None:
        self._upstream = upstream
        self._log = log
        self._active = False
        self._stop_task: asyncio.Task | None = None

    def on_client_count_changed(self, count: int) -> None:
        if count > 0:
            self._cancel_pending_stop()
            if not self._active:
                self._active = True
                self._log.info("lifecycle: ingest client connected — starting upstream F1 connection")
                self._upstream.start()
        else:
            self._schedule_stop()

    def _cancel_pending_stop(self) -> None:
        if self._stop_task is not None:
            self._stop_task.cancel()
            self._stop_task = None

    def _schedule_stop(self) -> None:
        if self._stop_task is not None:
            return
        self._stop_task = asyncio.ensure_future(self._stop_after_delay())

    async def _stop_after_delay(self) -> None:
        try:
            await asyncio.sleep(IDLE_STOP_DELAY_S)
        except asyncio.CancelledError:
            return
        self._stop_task = None
        self._active = False
        self._log.info(
            "lifecycle: no ingest clients for %ds — stopping upstream F1 connection", IDLE_STOP_DELAY_S
        )
        await self._upstream.close()


def _configure_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "info").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )


async def _main() -> None:
    _configure_logging()
    log = logging.getLogger("f1_sidecar.main")

    if not has_f1tv_credentials():
        log.error(
            "F1_SUBSCRIPTION_TOKEN or F1_USERNAME/F1_PASSWORD must be set — "
            "the live timing feed requires an F1TV login"
        )
        sys.exit(1)

    port = int(os.environ.get("PORT", "8001"))
    relay = RelayServer()
    upstream = Upstream(on_frame=relay.on_upstream_frame, on_connected=relay.on_upstream_connected)
    lifecycle = LifecycleManager(upstream, log)
    relay.on_client_count_changed = lifecycle.on_client_count_changed

    log.info("f1-sidecar: relay server listening on port %d (upstream connects on demand)", port)
    try:
        await relay.serve_forever(port)
    finally:
        await upstream.close()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
