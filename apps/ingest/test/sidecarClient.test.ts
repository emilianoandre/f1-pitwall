import { describe, it, expect, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import { connectSidecar } from "../src/feed/sidecarClient.js";
import type { FeedHandle } from "../src/feed/source.js";

const RECORD_SEPARATOR = "\x1e";

describe("connectSidecar", () => {
  let wss: WebSocketServer | null = null;
  let handle: FeedHandle | null = null;

  afterEach(async () => {
    handle?.close();
    handle = null;
    await new Promise<void>((resolve) => {
      if (!wss) return resolve();
      wss.close(() => resolve());
    });
    wss = null;
  });

  function startServer(onConnection: (ws: import("ws").WebSocket) => void): Promise<number> {
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port: 0 });
      wss.on("connection", onConnection);
      wss.on("listening", () => {
        const addr = wss!.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  }

  it("routes a replayed snapshot frame from the sidecar into onSnapshot", async () => {
    const port = await startServer((ws) => {
      const completion = { type: 3, result: { Heartbeat: {}, TimingData: { Lines: {} } } };
      ws.send(JSON.stringify(completion) + RECORD_SEPARATOR);
    });

    const snapshots: Array<Record<string, unknown>> = [];
    await new Promise<void>((resolve) => {
      handle = connectSidecar(
        `ws://localhost:${port}`,
        {
          onMessage: () => {},
          onSnapshot: (s) => {
            snapshots.push(s);
            resolve();
          },
        },
        { baseBackoffMs: 5 },
      );
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.Heartbeat).toEqual({});
  });

  it("routes a broadcast invocation frame into onMessage", async () => {
    const port = await startServer((ws) => {
      const update = {
        type: 1,
        target: "feed",
        arguments: ["TrackStatus", { Status: "2" }, "2024-01-01T00:00:00Z"],
      };
      ws.send(JSON.stringify(update) + RECORD_SEPARATOR);
    });

    const received: Array<{ topic: string; data: unknown }> = [];
    await new Promise<void>((resolve) => {
      handle = connectSidecar(
        `ws://localhost:${port}`,
        {
          onMessage: (topic, data) => {
            received.push({ topic, data });
            resolve();
          },
          onSnapshot: () => {},
        },
        { baseBackoffMs: 5 },
      );
    });

    expect(received).toEqual([{ topic: "TrackStatus", data: { Status: "2" } }]);
  });

  it("calls onConnected(true) on open and onConnected(false) after the server closes it", async () => {
    const events: boolean[] = [];
    const port = await startServer((ws) => {
      setTimeout(() => ws.close(), 10);
    });

    await new Promise<void>((resolve) => {
      handle = connectSidecar(
        `ws://localhost:${port}`,
        {
          onMessage: () => {},
          onSnapshot: () => {},
          onConnected: (connected) => {
            events.push(connected);
            if (events.length >= 2) resolve();
          },
        },
        { baseBackoffMs: 5, log: () => {} },
      );
    });

    expect(events.slice(0, 2)).toEqual([true, false]);
  });

  it("reconnects with backoff after the server closes the connection", async () => {
    let connectionCount = 0;
    const port = await startServer((ws) => {
      connectionCount += 1;
      if (connectionCount === 1) {
        ws.close();
      } else {
        ws.send(JSON.stringify({ type: 3, result: { Heartbeat: {} } }) + RECORD_SEPARATOR);
      }
    });

    const snapshots: Array<Record<string, unknown>> = [];
    await new Promise<void>((resolve) => {
      handle = connectSidecar(
        `ws://localhost:${port}`,
        {
          onMessage: () => {},
          onSnapshot: (s) => {
            snapshots.push(s);
            resolve();
          },
        },
        { baseBackoffMs: 5, maxBackoffMs: 20 },
      );
    });

    expect(connectionCount).toBeGreaterThanOrEqual(2);
    expect(snapshots).toHaveLength(1);
  });
});
