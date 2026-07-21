import asyncio

import pytest
import responses

from f1_sidecar import metrics


@pytest.fixture(autouse=True)
def _reset():
    metrics.reset_for_tests()
    yield
    metrics.reset_for_tests()


def test_gauge_and_count_are_noop_without_a_license_key(monkeypatch):
    monkeypatch.delenv("NEW_RELIC_LICENSE_KEY", raising=False)
    metrics.gauge("sidecar.upstream.connected", 1)
    metrics.count("sidecar.upstream.reconnect")
    assert metrics._buffer == []


def test_gauge_and_count_buffer_when_enabled(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    metrics.gauge("sidecar.upstream.connected", 1)
    metrics.count("sidecar.upstream.reconnect", 2)
    assert len(metrics._buffer) == 2
    assert metrics._buffer[0].name == "sidecar.upstream.connected"
    assert metrics._buffer[0].type == "gauge"
    assert metrics._buffer[1].value == 2
    assert metrics._buffer[1].type == "count"


@responses.activate
async def test_flush_posts_buffered_metrics_and_drains_buffer(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    monkeypatch.setenv("NEW_RELIC_APP_NAME", "f1-pitwall-sidecar-test")
    captured = {}

    def handler(request):
        captured["headers"] = dict(request.headers)
        captured["body"] = request.body
        return (200, {}, "")

    responses.add_callback(
        responses.POST,
        metrics.DEFAULT_METRIC_API_URL,
        callback=handler,
        content_type="application/json",
    )

    metrics.gauge("sidecar.upstream.connected", 1)
    metrics.count("sidecar.upstream.reconnect")
    await metrics._flush_once()

    assert metrics._buffer == []
    assert captured["headers"]["Api-Key"] == "test-key"
    import json

    body = json.loads(captured["body"])
    assert body[0]["common"]["attributes"]["service.name"] == "f1-pitwall-sidecar-test"
    names = [m["name"] for m in body[0]["metrics"]]
    assert "sidecar.upstream.connected" in names
    assert "sidecar.upstream.reconnect" in names


@responses.activate
async def test_flush_with_no_buffered_metrics_does_not_post(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    responses.add(responses.POST, metrics.DEFAULT_METRIC_API_URL, status=200)
    await metrics._flush_once()
    assert len(responses.calls) == 0


@responses.activate
async def test_flush_failure_does_not_raise(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    responses.add(responses.POST, metrics.DEFAULT_METRIC_API_URL, status=500, body="server error")
    metrics.gauge("sidecar.upstream.connected", 1)
    await metrics._flush_once()  # must not raise
    assert metrics._buffer == []


async def test_start_stop_lifecycle_flushes_on_stop(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    with responses.RequestsMock() as rsps:
        rsps.add(responses.POST, metrics.DEFAULT_METRIC_API_URL, status=200)
        metrics.start()
        metrics.gauge("sidecar.upstream.connected", 1)
        await metrics.stop()
        assert len(rsps.calls) == 1
    assert metrics._buffer == []


async def test_start_is_idempotent(monkeypatch):
    monkeypatch.setenv("NEW_RELIC_LICENSE_KEY", "test-key")
    metrics.start()
    task = metrics._flush_task
    metrics.start()
    assert metrics._flush_task is task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
