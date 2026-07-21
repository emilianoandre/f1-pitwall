"""Pushes custom metrics to New Relic's Metric API directly, rather than
using the full New Relic Python agent — this service has no request/response
transactions of its own to trace (see main.py's module docstring for the
on-demand connection model): its only HTTP call is the one-off negotiate()
request, the rest is an indefinitely-running WS relay loop. Wrapping that in
synthetic APM transactions would recreate the "one absurdly long transaction"
problem a long-lived connection causes for request-tracing tools, for this
service's entire job rather than one endpoint among several. What's actually
worth watching here — connection state, reconnect attempts, client count,
idle-stop transitions — is gauge/counter-shaped, which the Metric API covers
directly with no agent, no extra dependency (requests is already used
elsewhere), and no background harvest overhead.

Every function here is a safe no-op when NEW_RELIC_LICENSE_KEY isn't set, so
call sites never need to check whether metrics are enabled.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass

import requests

log = logging.getLogger("f1_sidecar.metrics")

DEFAULT_METRIC_API_URL = "https://metric-api.newrelic.com/metric/v1"
# Matches apps/ingest's TOPIC_COUNT_LOG_INTERVAL_MS, for consistency across services.
FLUSH_INTERVAL_S = 10


@dataclass
class _Metric:
    name: str
    type: str  # "gauge" | "count"
    value: float
    attributes: dict[str, object]


_buffer: list[_Metric] = []
_flush_task: asyncio.Task | None = None
_warned_no_key = False


def _license_key() -> str | None:
    return os.environ.get("NEW_RELIC_LICENSE_KEY") or None


def _app_name() -> str:
    return os.environ.get("NEW_RELIC_APP_NAME", "f1-pitwall-sidecar")


def _api_url() -> str:
    return os.environ.get("NEW_RELIC_METRIC_API_URL", DEFAULT_METRIC_API_URL)


def _enabled() -> bool:
    global _warned_no_key
    if _license_key():
        return True
    if not _warned_no_key:
        _warned_no_key = True
        log.warning("metrics: NEW_RELIC_LICENSE_KEY not set — metrics are disabled")
    return False


def gauge(name: str, value: float, **attributes: object) -> None:
    if not _enabled():
        return
    _buffer.append(_Metric(name, "gauge", value, attributes))


def count(name: str, value: float = 1, **attributes: object) -> None:
    if not _enabled():
        return
    _buffer.append(_Metric(name, "count", value, attributes))


def _drain() -> list[_Metric]:
    global _buffer
    drained, _buffer = _buffer, []
    return drained


async def _flush_once() -> None:
    metrics = _drain()
    key = _license_key()
    if not metrics or not key:
        return

    ts_ms = int(time.time() * 1000)
    payload = [
        {
            "common": {"attributes": {"service.name": _app_name()}},
            "metrics": [
                {
                    "name": m.name,
                    "type": m.type,
                    "value": m.value,
                    "timestamp": ts_ms,
                    **({"attributes": m.attributes} if m.attributes else {}),
                }
                for m in metrics
            ],
        }
    ]
    try:
        resp = await asyncio.to_thread(
            requests.post,
            _api_url(),
            json=payload,
            headers={"Api-Key": key, "Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code >= 300:
            log.warning("metrics: flush failed: HTTP %d %s", resp.status_code, resp.text[:200])
    except Exception as err:  # noqa: BLE001 — a metrics failure must never affect the relay
        log.warning("metrics: flush error: %s", err)


async def _flush_loop() -> None:
    while True:
        await asyncio.sleep(FLUSH_INTERVAL_S)
        await _flush_once()


def start() -> None:
    """Idempotent — safe to call even if metrics are disabled or already started."""
    global _flush_task
    if _flush_task is not None:
        return
    _flush_task = asyncio.ensure_future(_flush_loop())


async def stop() -> None:
    global _flush_task
    if _flush_task is not None:
        _flush_task.cancel()
        try:
            await _flush_task
        except asyncio.CancelledError:
            pass
        _flush_task = None
    await _flush_once()  # flush anything buffered since the last interval


def reset_for_tests() -> None:
    global _buffer, _flush_task, _warned_no_key
    _buffer = []
    _flush_task = None
    _warned_no_key = False
