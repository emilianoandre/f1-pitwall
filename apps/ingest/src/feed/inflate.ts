import { inflateRawSync, deflateRawSync } from "node:zlib";

/**
 * Inflate a ".z" topic payload: base64-encoded, raw-deflate-compressed JSON.
 * Returns the parsed object. Throws if decoding/parsing fails.
 */
export function inflateZ(payload: string): unknown {
  const raw = inflateRawSync(Buffer.from(payload, "base64")).toString("utf8");
  return JSON.parse(raw);
}

/** Inverse of inflateZ — used only in tests/fixtures. */
export function deflateZ(obj: unknown): string {
  const json = JSON.stringify(obj);
  return deflateRawSync(Buffer.from(json, "utf8")).toString("base64");
}

/** True for topic names delivered compressed (e.g. "CarData.z"). */
export function isCompressedTopic(topic: string): boolean {
  return topic.endsWith(".z");
}
