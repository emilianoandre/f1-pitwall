import { EventEmitter } from "node:events";
import { deepMerge } from "./merge.js";

type RawTopics = Record<string, unknown>;

/**
 * Holds the merged raw feed state (per topic) and applies snapshots + updates.
 * Emits "update" (with the changed topic) and "snapshot" after each apply, so
 * downstream transform/broadcast can react.
 */
export class SessionStore extends EventEmitter {
  private raw: RawTopics = {};

  /** Replace all topics from a full snapshot. */
  applySnapshot(state: RawTopics): void {
    // Clone so the store owns its state independent of the caller's object.
    this.raw = structuredClone(state);
    this.emit("snapshot");
  }

  /** Merge an incremental patch into a single topic. */
  applyUpdate(topic: string, patch: unknown): void {
    if (this.raw[topic] === undefined) {
      this.raw[topic] = deepMerge(undefined, patch);
    } else {
      this.raw[topic] = deepMerge(this.raw[topic], patch);
    }
    this.emit("update", topic);
  }

  getTopic<T = unknown>(topic: string): T | undefined {
    return this.raw[topic] as T | undefined;
  }

  getRaw(): Readonly<RawTopics> {
    return this.raw;
  }

  /** Deep clone of the current raw state — for keyframing a seekable player. */
  snapshotRaw(): RawTopics {
    return structuredClone(this.raw);
  }

  /** Restore raw state from a keyframe clone (does not emit). */
  restoreRaw(clone: RawTopics): void {
    this.raw = structuredClone(clone);
  }

  hasData(): boolean {
    return Object.keys(this.raw).length > 0;
  }
}
