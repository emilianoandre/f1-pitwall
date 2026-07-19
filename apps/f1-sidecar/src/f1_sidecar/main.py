"""Entrypoint: wires Upstream (F1 connection) to RelayServer (what Node
connects to) and runs both forever."""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from .auth import has_f1tv_credentials
from .server import RelayServer
from .upstream import Upstream


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

    log.info("f1-sidecar: starting upstream connection and relay server on port %d", port)
    upstream.start()
    try:
        await relay.serve_forever(port)
    finally:
        await upstream.close()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
