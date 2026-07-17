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
    // Diagnostic: which topics the server actually included in the Subscribe
    // reply, so we can tell "never granted" apart from "granted but the
    // ongoing stream never arrives".
    // eslint-disable-next-line no-console
    console.log(`[feed] Subscribe reply topics: ${Object.keys(completion.result).join(", ")}`);
    onSnapshot(decodeSnapshot(completion.result));
    return;
  }

  const invocation = frame as InvocationFrame;
  if (invocation.type === 1 && Array.isArray(invocation.arguments)) {
    const tuples = extractTuples(invocation.arguments);
    if (tuples.length === 0 && invocation.arguments.length > 0) {
      // Diagnostic: an invocation arrived but didn't match the [topic, data,
      // utc] shape we expect — would otherwise vanish silently.
      warnOnceRaw(
        `unrecognized invocation shape (target=${invocation.target ?? "?"}): ` +
          JSON.stringify(invocation.arguments).slice(0, 200),
      );
    }
    for (const [topic, data, ts] of tuples) {
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

// Diagnostic only, logged once per topic so a systematic decode failure
// doesn't spam the log at feed rate (CarData.z arrives multiple times/sec).
const warnedTopics = new Set<string>();
function warnOnce(topic: string, msg: string): void {
  if (warnedTopics.has(topic)) return;
  warnedTopics.add(topic);
  // eslint-disable-next-line no-console
  console.warn(`[feed] ${topic}: ${msg}`);
}

const warnedRaw = new Set<string>();
function warnOnceRaw(msg: string): void {
  if (warnedRaw.has(msg)) return;
  warnedRaw.add(msg);
  // eslint-disable-next-line no-console
  console.warn(`[feed] ${msg}`);
}

/** Inflate a payload if its topic is compressed; otherwise pass through. */
function decodePayload(topic: string, data: unknown): unknown {
  if (isCompressedTopic(topic)) {
    if (typeof data !== "string") {
      warnOnce(topic, `expected a compressed string payload, got ${typeof data}`);
      return data;
    }
    try {
      return inflateZ(data);
    } catch (err) {
      warnOnce(topic, `inflate failed: ${(err as Error).message}`);
      return null;
    }
  }
  return data;
}
