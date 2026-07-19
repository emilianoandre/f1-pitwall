import WebSocket from "ws";
import { parseFrames, routeFrame } from "./parse.js";
import type { FeedCallbacks, FeedHandle } from "./source.js";

interface SidecarOptions {
  /** Base backoff in ms (default 1000). */
  baseBackoffMs?: number;
  /** Max backoff in ms (default 30000). */
  maxBackoffMs?: number;
  log?: (msg: string) => void;
}

/**
 * Connect to the apps/f1-sidecar relay (see F1_SIDECAR_URL) instead of F1's
 * feed directly. The sidecar already completed its own SignalR handshake and
 * Subscribe with F1 — every message it forwards here is a raw, post-handshake
 * frame (record-separated JSON, same wire format F1 itself uses), so we reuse
 * parseFrames/routeFrame unchanged, same as the direct connection in
 * feed/connect.ts.
 */
export function connectSidecar(url: string, cb: FeedCallbacks, opts: SidecarOptions = {}): FeedHandle {
  const base = opts.baseBackoffMs ?? 1000;
  const max = opts.maxBackoffMs ?? 30000;
  const log = opts.log ?? (() => {});

  let closed = false;
  let attempt = 0;
  let ws: WebSocket | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let disconnectHandled = false;

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    const backoff = Math.min(max, base * 2 ** (attempt - 1));
    const jitter = backoff * 0.25 * pseudoJitter(attempt);
    const delay = Math.round(backoff + jitter);
    log(`sidecar: reconnecting in ${delay}ms (attempt ${attempt})`);
    retryTimer = setTimeout(run, delay);
  };

  // ws can emit both "error" and "close" for one disconnect — dedupe so we
  // don't double-schedule (and double-increment backoff) per failure.
  const handleDisconnect = () => {
    if (disconnectHandled) return;
    disconnectHandled = true;
    ws = null;
    cb.onConnected?.(false);
    scheduleRetry();
  };

  const run = () => {
    if (closed) return;
    disconnectHandled = false;

    const socket = new WebSocket(url);
    ws = socket;

    socket.on("open", () => {
      attempt = 0;
      log("sidecar: connected");
      cb.onConnected?.(true);
    });

    socket.on("message", (buf: WebSocket.RawData) => {
      for (const frame of parseFrames(buf.toString())) {
        routeFrame(frame, cb.onMessage, cb.onSnapshot);
      }
    });

    socket.on("close", handleDisconnect);
    socket.on("error", (err: Error) => {
      log(`sidecar: connection error: ${err.message}`);
      handleDisconnect();
    });
  };

  run();

  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
    },
  };
}

// Deterministic jitter (matches feed/live.ts's own reconnect backoff).
function pseudoJitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
