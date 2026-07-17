import { inflateZ, isCompressedTopic } from "./inflate.js";
import { normalizeTopic } from "./topics.js";
import type { FeedMessage, FeedSnapshot } from "./source.js";

/** SignalR's JSON hub protocol terminates every frame with this byte. */
export const RECORD_SEPARATOR = "\x1e";

/** A single feed update tuple: [topic, data, utc]. */
type FeedTuple = [string, unknown, string];

interface CompletionFrame {
  type: 3;
  result?: Record<string, unknown>;
}

interface InvocationFrame {
  type: 1;
  target?: string;
  arguments?: unknown[];
}

/**
 * Split one raw websocket text message into its constituent JSON frames.
 * The JSON hub protocol record-separates (`\x1e`) frames, and a single
 * websocket message may carry more than one.
 */
export function parseFrames(raw: string): unknown[] {
  const frames: unknown[] = [];
  for (const chunk of raw.split(RECORD_SEPARATOR)) {
    if (chunk.length === 0) continue;
    try {
      frames.push(JSON.parse(chunk));
    } catch {
      // Corrupt/partial frame — drop it rather than crash.
    }
  }
  return frames;
}

/**
 * Route one decoded SignalR hub-protocol frame. Handles the two shapes we
 * care about: a completion carrying a `result` map (the reply to our
 * Subscribe call — a full snapshot of every subscribed topic) and an
 * invocation carrying one or more `[topic, data, utc]` feed update tuples.
 * Everything else (handshake ack, pings, unrelated invocations) is ignored.
 */
export function routeFrame(
  frame: unknown,
  onMessage: FeedMessage,
  onSnapshot: FeedSnapshot,
): void {
  if (frame === null || typeof frame !== "object") return;

  const completion = frame as CompletionFrame;
  if (completion.type === 3 && completion.result && typeof completion.result === "object") {
    onSnapshot(decodeSnapshot(completion.result));
    return;
  }

  const invocation = frame as InvocationFrame;
  if (invocation.type === 1 && Array.isArray(invocation.arguments)) {
    for (const [topic, data, ts] of extractTuples(invocation.arguments)) {
      onMessage(normalizeTopic(topic), decodePayload(topic, data), ts);
    }
  }
}

/**
 * The server may send a single [topic, data, utc] tuple as `arguments`, or a
 * batch of such tuples nested one level deeper — accept either shape.
 */
function extractTuples(args: unknown[]): FeedTuple[] {
  if (isFeedTuple(args)) return [args];
  return args.filter(isFeedTuple);
}

function isFeedTuple(v: unknown): v is FeedTuple {
  return Array.isArray(v) && v.length === 3 && typeof v[0] === "string" && typeof v[2] === "string";
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
