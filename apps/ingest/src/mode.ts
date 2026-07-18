import { EventEmitter } from "node:events";
import type { IngestMode } from "@f1-dash/types";
import type { StateSource } from "./server.js";
import { StateEngine } from "./state/engine.js";
import { Player } from "./player/player.js";
import { connectLive } from "./feed/live.js";
import type { FeedHandle } from "./feed/source.js";
import { hasOpenf1Credentials } from "./feed/openf1/auth.js";
import { connectOpenf1Live, type Openf1FeedHandle } from "./feed/openf1/client.js";

/**
 * A StateSource that forwards from whichever underlying source is currently
 * active (live engine or recording player), so the SSE layer can stay bound to
 * one object while the mode switches underneath it.
 */
class ActiveSource extends EventEmitter implements StateSource {
  private active: StateSource | null = null;
  private readonly forward = (topic?: string) => this.emit("changed", topic);

  setActive(src: StateSource): void {
    if (this.active === src) return;
    this.active?.off("changed", this.forward);
    this.active = src;
    src.on("changed", this.forward);
    this.emit("changed");
  }

  getState() {
    if (!this.active) throw new Error("no active source");
    return this.active.getState();
  }
  hasData(): boolean {
    return this.active?.hasData() ?? false;
  }
}

const TOPIC_COUNT_LOG_INTERVAL_MS = 10_000;

/** Owns the live feed engine + connection, started/stopped on demand. */
class LiveController {
  readonly engine = new StateEngine();
  private handle: FeedHandle | null = null;
  private openf1: Openf1FeedHandle | null = null;
  private topicCountTimer: NodeJS.Timeout | null = null;
  connected = false;

  constructor(private readonly log: (m: string) => void) {}

  // A SignalR resnapshot replaces the whole raw store, so CarData/Position
  // (only ever written by OpenF1, since our own feed doesn't get them) vanish
  // from it — the OpenF1 writers must re-bootstrap or their next patch would
  // target a now-nonexistent array. See feed/openf1/writer.ts.
  private readonly onEngineChanged = (topic?: string): void => {
    if (topic === undefined) this.openf1?.resetOnSnapshot();
  };

  start(): void {
    if (this.handle) return;
    this.handle = connectLive(
      {
        ...this.engine.callbacks,
        onConnected: (c) => {
          this.connected = c;
        },
      },
      { log: this.log },
    );
    this.engine.on("changed", this.onEngineChanged);

    // Supplementary source for the topics our own feed doesn't get granted
    // (CarData/Position) — optional, and independent of the connection above.
    if (hasOpenf1Credentials()) {
      this.openf1 = connectOpenf1Live(
        { onMessage: this.engine.callbacks.onMessage },
        { log: this.log },
      );
    } else {
      this.log("openf1: OPENF1_USERNAME/OPENF1_PASSWORD not set — skipping supplementary feed");
    }

    // Diagnostic: per-topic message counts, so a topic that's silently not
    // arriving (e.g. CarData/Position) shows up as zero instead of just
    // "the UI doesn't have it".
    this.topicCountTimer = setInterval(() => {
      const counts = this.engine.drainTopicCounts();
      if (Object.keys(counts).length > 0) {
        this.log(`feed: topic counts (last ${TOPIC_COUNT_LOG_INTERVAL_MS / 1000}s): ${JSON.stringify(counts)}`);
      }
    }, TOPIC_COUNT_LOG_INTERVAL_MS);
  }

  stop(): void {
    this.handle?.close();
    this.handle = null;
    this.openf1?.close();
    this.openf1 = null;
    this.engine.off("changed", this.onEngineChanged);
    this.connected = false;
    if (this.topicCountTimer) clearInterval(this.topicCountTimer);
    this.topicCountTimer = null;
  }
}

/**
 * Orchestrates live/player modes at runtime. The server binds to `source`
 * (an ActiveSource) and reads `mode`/`connected` through this controller.
 */
export class ModeController {
  readonly source = new ActiveSource();
  readonly player = new Player();
  private readonly live: LiveController;
  private currentMode: IngestMode;

  constructor(
    initial: IngestMode,
    private readonly log: (m: string) => void = () => {},
  ) {
    this.live = new LiveController(log);
    this.currentMode = "player";
    this.source.setActive(this.player);
    if (initial === "live") this.setMode("live");
  }

  get mode(): IngestMode {
    return this.currentMode;
  }

  get connected(): boolean {
    return this.currentMode === "live" ? this.live.connected : true;
  }

  lastMessageAgeMs(): number | null {
    return this.currentMode === "live" ? this.live.engine.lastMessageAgeMs() : null;
  }

  setMode(mode: IngestMode): void {
    if (mode === this.currentMode) return;
    this.log(`switching to ${mode} mode`);
    if (mode === "live") {
      this.player.pause();
      this.live.start();
      this.source.setActive(this.live.engine);
    } else {
      this.live.stop();
      this.source.setActive(this.player);
    }
    this.currentMode = mode;
  }

  /** Ensure we're in player mode (used when a recording is loaded). */
  ensurePlayerMode(): void {
    this.setMode("player");
  }
}
