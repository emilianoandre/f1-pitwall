import { EventEmitter } from "node:events";
import type { SessionState } from "@f1-dash/types";
import { SessionStore } from "./store.js";
import { Deriver } from "./derived.js";
import { buildSessionState } from "./transform.js";
import type { FeedCallbacks } from "../feed/source.js";

/**
 * Owns the raw store + deriver and produces clean SessionState. Emits "changed"
 * after every applied message (throttling is the server's concern). Provides
 * FeedCallbacks so a live or replay source can drive it.
 */
export class StateEngine extends EventEmitter {
  private store = new SessionStore();
  private deriver = new Deriver();
  private lastMessageAt = 0;

  constructor() {
    super();
    const onChange = (topic?: string) => {
      this.deriver.observe(this.store.getRaw() as Record<string, unknown>);
      this.lastMessageAt = Date.now();
      this.emit("changed", topic);
    };
    this.store.on("snapshot", () => onChange(undefined));
    this.store.on("update", (topic: string) => onChange(topic));
  }

  get callbacks(): FeedCallbacks {
    return {
      onSnapshot: (state) => {
        this.deriver.reset();
        this.store.applySnapshot(state);
      },
      onMessage: (topic, data) => {
        this.store.applyUpdate(topic, data);
      },
    };
  }

  getState(): SessionState {
    return buildSessionState(
      this.store.getRaw() as Record<string, unknown>,
      this.deriver.snapshot(),
    );
  }

  hasData(): boolean {
    return this.store.hasData();
  }

  lastMessageAgeMs(): number | null {
    return this.lastMessageAt === 0 ? null : Date.now() - this.lastMessageAt;
  }
}
