import { negotiate, openSocket } from "./connect.js";
import { connectSidecar } from "./sidecarClient.js";
import type { FeedCallbacks, FeedHandle } from "./source.js";

interface LiveOptions {
  /** Base backoff in ms (default 1000). */
  baseBackoffMs?: number;
  /** Max backoff in ms (default 30000). */
  maxBackoffMs?: number;
  log?: (msg: string) => void;
}

/**
 * Connect to the live F1 feed with automatic reconnect + exponential backoff.
 * On every (re)connect the feed sends a fresh `R` snapshot, so downstream state
 * resets cleanly via onSnapshot.
 *
 * If F1_SIDECAR_URL is set, connect through apps/f1-sidecar instead of F1
 * directly — see that service's README for why: a Node WebSocket client
 * never receives CarData.z/Position.z from F1 regardless of protocol-level
 * tuning (verified exhaustively), while a Python client with the same token
 * does. Falls back to the direct connection (degraded, no CarData/Position)
 * if the sidecar isn't configured.
 */
export function connectLive(cb: FeedCallbacks, opts: LiveOptions = {}): FeedHandle {
  const base = opts.baseBackoffMs ?? 1000;
  const max = opts.maxBackoffMs ?? 30000;
  const log = opts.log ?? (() => {});

  const sidecarUrl = process.env.F1_SIDECAR_URL;
  if (sidecarUrl) {
    log(`feed: using sidecar relay at ${sidecarUrl}`);
    return connectSidecar(sidecarUrl, cb, { baseBackoffMs: base, maxBackoffMs: max, log });
  }

  let closed = false;
  let attempt = 0;
  let current: FeedHandle | null = null;
  let retryTimer: NodeJS.Timeout | null = null;

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    const backoff = Math.min(max, base * 2 ** (attempt - 1));
    const jitter = backoff * 0.25 * pseudoJitter(attempt);
    const delay = Math.round(backoff + jitter);
    log(`feed: reconnecting in ${delay}ms (attempt ${attempt})`);
    retryTimer = setTimeout(run, delay);
  };

  const run = async () => {
    if (closed) return;
    try {
      const neg = await negotiate();
      current = openSocket(neg, {
        onMessage: cb.onMessage,
        onSnapshot: cb.onSnapshot,
        onConnected: (connected) => {
          cb.onConnected?.(connected);
          if (connected) {
            attempt = 0;
            log("feed: connected");
          } else {
            current = null;
            scheduleRetry();
          }
        },
      });
    } catch (err) {
      log(`feed: connect error: ${(err as Error).message}`);
      cb.onConnected?.(false);
      scheduleRetry();
    }
  };

  void run();

  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      current?.close();
    },
  };
}

// Deterministic jitter (Math.random is unavailable in some harness contexts and
// we don't need cryptographic randomness — just avoid thundering-herd sync).
function pseudoJitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
