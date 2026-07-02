import { inflateZ, isCompressedTopic } from "./inflate.js";
import { normalizeTopic } from "./topics.js";
import type { FeedMessage, FeedSnapshot } from "./source.js";

/** A single feed update tuple from an `M` frame: [topic, data, utc]. */
type FeedTuple = [string, unknown, string];

interface SubscribeReply {
  R?: Record<string, unknown>;
  I?: string;
}

interface UpdateFrame {
  M?: Array<{ H?: string; M?: string; A?: unknown }>;
}

/**
 * Decode one raw websocket frame (already JSON.parsed) and route it.
 * Handles the three shapes: keepalive `{}`, subscribe reply `{R,I}`,
 * and update batch `{M:[...]}`. Inflates `.z` payloads and strips the suffix.
 */
export function routeFrame(
  frame: unknown,
  onMessage: FeedMessage,
  onSnapshot: FeedSnapshot,
): void {
  if (frame === null || typeof frame !== "object") return;

  // Subscribe reply → full snapshot of every subscribed topic.
  const reply = frame as SubscribeReply;
  if (reply.R && typeof reply.R === "object") {
    onSnapshot(decodeSnapshot(reply.R));
    return;
  }

  // Update batch.
  const upd = frame as UpdateFrame;
  if (Array.isArray(upd.M)) {
    for (const entry of upd.M) {
      if (!entry || entry.M !== "feed" || !Array.isArray(entry.A)) continue;
      const [topic, data, ts] = entry.A as FeedTuple;
      if (typeof topic !== "string") continue;
      const decoded = decodePayload(topic, data);
      onMessage(normalizeTopic(topic), decoded, typeof ts === "string" ? ts : "");
    }
    return;
  }

  // Anything else (keepalive `{}`, groups token, etc.) is ignored.
}

/** Inflate every compressed topic in a snapshot map and re-key by base name. */
function decodeSnapshot(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [topic, data] of Object.entries(r)) {
    out[normalizeTopic(topic)] = decodePayload(topic, data);
  }
  return out;
}

/** Inflate a payload if its topic is compressed; otherwise pass through. */
function decodePayload(topic: string, data: unknown): unknown {
  if (isCompressedTopic(topic) && typeof data === "string") {
    try {
      return inflateZ(data);
    } catch {
      // Corrupt/partial compressed frame — drop it rather than crash.
      return null;
    }
  }
  return data;
}

/** Parse a raw websocket text frame into a JS value, tolerant of garbage. */
export function parseFrame(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
