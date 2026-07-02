import WebSocket from "ws";
import { request } from "undici";
import {
  BASE_URL,
  WS_URL,
  HUB,
  CLIENT_PROTOCOL,
  CONNECTION_DATA,
  USER_AGENT,
  TOPICS,
} from "./topics.js";
import { parseFrame, routeFrame } from "./parse.js";
import type { FeedCallbacks, FeedHandle } from "./source.js";

interface Negotiation {
  connectionToken: string;
  cookie: string;
}

/** Step 1: negotiate a connection token + session cookie over HTTP. */
export async function negotiate(): Promise<Negotiation> {
  const url =
    `${BASE_URL}/negotiate` +
    `?connectionData=${encodeURIComponent(CONNECTION_DATA)}` +
    `&clientProtocol=${CLIENT_PROTOCOL}`;

  const res = await request(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
  });

  if (res.statusCode !== 200) {
    throw new Error(`negotiate failed: HTTP ${res.statusCode}`);
  }

  const body = (await res.body.json()) as { ConnectionToken?: string };
  if (!body.ConnectionToken) {
    throw new Error("negotiate response missing ConnectionToken");
  }

  // Collect Set-Cookie header(s) to echo back on connect.
  const setCookie = res.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [])
    .map((c) => c.split(";")[0])
    .join("; ");

  return { connectionToken: body.ConnectionToken, cookie };
}

/** Step 2+3: open the websocket, subscribe, and route frames to callbacks. */
export function openSocket(neg: Negotiation, cb: FeedCallbacks): FeedHandle {
  const url =
    `${WS_URL}/connect` +
    `?transport=webSockets&clientProtocol=${CLIENT_PROTOCOL}` +
    `&connectionToken=${encodeURIComponent(neg.connectionToken)}` +
    `&connectionData=${encodeURIComponent(CONNECTION_DATA)}`;

  const ws = new WebSocket(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip,identity",
      Cookie: neg.cookie,
    },
  });

  ws.on("open", () => {
    const subscribe = {
      H: HUB,
      M: "Subscribe",
      A: [TOPICS],
      I: 1,
    };
    ws.send(JSON.stringify(subscribe));
    cb.onConnected?.(true);
  });

  ws.on("message", (buf: WebSocket.RawData) => {
    const frame = parseFrame(buf.toString());
    if (frame !== null) routeFrame(frame, cb.onMessage, cb.onSnapshot);
  });

  ws.on("close", () => cb.onConnected?.(false));
  ws.on("error", () => cb.onConnected?.(false));

  return {
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
