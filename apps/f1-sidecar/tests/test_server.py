import asyncio

import pytest
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from f1_sidecar.server import RelayServer

COMPLETION = '{"type":3,"result":{"Heartbeat":{},"CarData.z":"..."}}\x1e'
UPDATE = '{"type":1,"target":"feed","arguments":[["Heartbeat",{},"t"]]}\x1e'


@pytest.fixture
async def running_server():
    relay = RelayServer()
    server = await serve(relay._handler, "localhost", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        yield relay, port
    finally:
        server.close()
        await server.wait_closed()


async def test_new_client_receives_cached_snapshot_immediately(running_server):
    relay, port = running_server
    relay.on_upstream_frame(COMPLETION)

    async with connect(f"ws://localhost:{port}") as ws:
        received = await asyncio.wait_for(ws.recv(), timeout=2)
        assert received == COMPLETION


async def test_client_receives_live_broadcast_after_connecting(running_server):
    relay, port = running_server

    async with connect(f"ws://localhost:{port}") as ws:
        await asyncio.sleep(0.05)  # let the server register the client
        relay.on_upstream_frame(UPDATE)
        received = await asyncio.wait_for(ws.recv(), timeout=2)
        assert received == UPDATE


async def test_client_with_no_snapshot_yet_gets_nothing_until_a_frame_arrives(running_server):
    relay, port = running_server

    async with connect(f"ws://localhost:{port}") as ws:
        await asyncio.sleep(0.05)
        relay.on_upstream_frame(UPDATE)
        received = await asyncio.wait_for(ws.recv(), timeout=2)
        assert received == UPDATE


async def test_upstream_disconnect_closes_client_connections(running_server):
    relay, port = running_server
    relay.on_upstream_frame(COMPLETION)

    async with connect(f"ws://localhost:{port}") as ws:
        await asyncio.wait_for(ws.recv(), timeout=2)  # the replayed snapshot
        relay.on_upstream_connected(False)
        with pytest.raises(Exception):
            await asyncio.wait_for(ws.recv(), timeout=2)

    # snapshot cache is cleared, so a fresh client gets nothing replayed
    assert relay._last_snapshot is None
