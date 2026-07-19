import WebSocket from "ws";
import { request } from "undici";
import { NEGOTIATE_URL, WS_URL, USER_AGENT, ORIGIN, REFERER, TOPICS } from "./topics.js";
import { RECORD_SEPARATOR, parseFrames, routeFrame } from "./parse.js";
import { getAccessToken } from "./auth.js";
import type { FeedCallbacks, FeedHandle } from "./source.js";

const PING_INTERVAL_MS = 15_000;

interface Negotiation {
  connectionToken: string;
  cookie: string | null;
  accessToken: string;
}

/** Step 1: get an F1TV access token, then negotiate a connection over HTTP. */
export async function negotiate(): Promise<Negotiation> {
  const accessToken = await getAccessToken();

  // AWS ALB session-stickiness cookie, so negotiate and the websocket that
  // follows land on the same backend node.
  const pre = await request(NEGOTIATE_URL, {
    method: "OPTIONS",
    headers: { "User-Agent": USER_AGENT, Origin: ORIGIN, Referer: REFERER },
  });
  const cookie = extractCookie(pre.headers["set-cookie"], "AWSALBCORS");

  // A real browser's negotiate call carries no Authorization header and no
  // ?negotiateVersion= query param at all — it authenticates via cookies from
  // an actual formula1.com login session (entitlement_token, login-session,
  // etc.) that we don't have. We keep sending our own bearer token here since
  // it's the only auth we have and negotiate already succeeds with it; only
  // the query param is dropped to match the real trace.
  const res = await request(NEGOTIATE_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Origin: ORIGIN,
      Referer: REFERER,
      Authorization: `Bearer ${accessToken}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  const rawText = await res.body.text();
  if (res.statusCode !== 200) {
    const detail = rawText.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`negotiate failed: HTTP ${res.statusCode}${detail ? ` — ${detail}` : ""}`);
  }

  const body = JSON.parse(rawText) as {
    connectionId?: string;
    connectionToken?: string;
  };
  const connectionToken = body.connectionToken ?? body.connectionId;
  if (!connectionToken) {
    throw new Error("negotiate response missing connection token");
  }

  return { connectionToken, cookie, accessToken };
}

/**
 * Step 2+3: open the websocket, complete the SignalR handshake, subscribe to
 * TOPICS, and route every subsequent frame to callbacks.
 */
export function openSocket(neg: Negotiation, cb: FeedCallbacks): FeedHandle {
  // A real browser session's own websocket connects with the token as an
  // "authToken" query param (not "access_token", and not an Authorization
  // header on the handshake) — captured directly from formula1.com's own
  // live-timing widget network trace.
  const url =
    `${WS_URL}?id=${encodeURIComponent(neg.connectionToken)}` +
    `&authToken=${encodeURIComponent(neg.accessToken)}`;

  const ws = new WebSocket(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Origin: ORIGIN,
      ...(neg.cookie ? { Cookie: neg.cookie } : {}),
    },
  });

  // The JSON hub protocol requires a handshake message before anything else;
  // the first frame we get back acks (or rejects) it.
  let handshakeDone = false;
  let pingTimer: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  };

  ws.on("open", () => {
    ws.send(`{"protocol":"json","version":1}${RECORD_SEPARATOR}`);
  });

  ws.on("message", (buf: WebSocket.RawData) => {
    for (const frame of parseFrames(buf.toString())) {
      if (!handshakeDone) {
        handshakeDone = true;
        if (frame && typeof frame === "object" && "error" in (frame as Record<string, unknown>)) {
          cb.onConnected?.(false);
          ws.close();
          return;
        }
        const subscribe = { type: 1, target: "Subscribe", arguments: [TOPICS], invocationId: "0" };
        ws.send(JSON.stringify(subscribe) + RECORD_SEPARATOR);
        pingTimer = setInterval(() => {
          try {
            ws.send(`{"type":6}${RECORD_SEPARATOR}`);
          } catch {
            /* socket already closing */
          }
        }, PING_INTERVAL_MS);
        cb.onConnected?.(true);
        continue;
      }
      routeFrame(frame, cb.onMessage, cb.onSnapshot);
    }
  });

  ws.on("close", () => {
    cleanup();
    cb.onConnected?.(false);
  });
  ws.on("error", () => {
    cleanup();
    cb.onConnected?.(false);
  });

  return {
    close() {
      cleanup();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

function extractCookie(setCookie: string | string[] | undefined, name: string): string | null {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    const pair = c.split(";")[0];
    if (pair?.startsWith(`${name}=`)) return pair;
  }
  return null;
}
