import asyncio
import logging

from f1_sidecar import main as main_module
from f1_sidecar.main import LifecycleManager


class FakeUpstream:
    def __init__(self) -> None:
        self.start_calls = 0
        self.close_calls = 0

    def start(self) -> None:
        self.start_calls += 1

    async def close(self) -> None:
        self.close_calls += 1


def make_lifecycle() -> tuple[LifecycleManager, FakeUpstream]:
    upstream = FakeUpstream()
    return LifecycleManager(upstream, logging.getLogger("test")), upstream


async def test_starts_upstream_when_first_client_connects():
    lifecycle, upstream = make_lifecycle()
    lifecycle.on_client_count_changed(1)
    assert upstream.start_calls == 1


async def test_does_not_restart_on_additional_clients():
    lifecycle, upstream = make_lifecycle()
    lifecycle.on_client_count_changed(1)
    lifecycle.on_client_count_changed(2)
    assert upstream.start_calls == 1


async def test_stops_upstream_only_after_idle_grace_period(monkeypatch):
    monkeypatch.setattr(main_module, "IDLE_STOP_DELAY_S", 0.05)
    lifecycle, upstream = make_lifecycle()
    lifecycle.on_client_count_changed(1)
    lifecycle.on_client_count_changed(0)
    assert upstream.close_calls == 0  # still within the grace period
    await asyncio.sleep(0.15)
    assert upstream.close_calls == 1


async def test_reconnect_within_grace_period_cancels_pending_stop(monkeypatch):
    monkeypatch.setattr(main_module, "IDLE_STOP_DELAY_S", 0.05)
    lifecycle, upstream = make_lifecycle()
    lifecycle.on_client_count_changed(1)
    lifecycle.on_client_count_changed(0)
    lifecycle.on_client_count_changed(1)  # reconnects before the grace period elapses
    await asyncio.sleep(0.15)
    assert upstream.close_calls == 0
    assert upstream.start_calls == 1  # never had to restart — the pending stop was cancelled
