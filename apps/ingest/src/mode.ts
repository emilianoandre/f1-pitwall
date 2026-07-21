import { EventEmitter } from "node:events";
import newrelic from "newrelic";
import type { IngestMode } from "@f1-dash/types";
import type { StateSource } from "./server.js";
import { StateEngine } from "./state/engine.js";
import { Player } from "./player/player.js";
import { connectLive } from "./feed/live.js";
import type { FeedHandle } from "./feed/source.js";
import { hasOpenf1Credentials } from "./feed/openf1/auth.js";
import { connectOpenf1Live, type Openf1FeedHandle } from "./feed/openf1/client.js";
import { connectOpenf1Full } from "./feed/openf1/fullClient.js";
import { getDataSourceFlag } from "./launchdarkly.js";

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
  openf1Connected = false;

  constructor(private readonly log: (m: string) => void) {}

  // A SignalR resnapshot replaces the whole raw store, so CarData/Position
  // (only ever written by OpenF1, since our own feed doesn't get them) vanish
  // from it — the OpenF1 writers must re-bootstrap or their next patch would
  // target a now-nonexistent array. See feed/openf1/writer.ts.
  private readonly onEngineChanged = (topic?: string): void => {
    if (topic === undefined) this.openf1?.resetOnSnapshot();
  };

  private startSignalR(): void {
    this.handle = connectLive(
      {
        ...this.engine.callbacks,
        onConnected: (c) => {
          this.connected = c;
        },
      },
      { log: this.log },
    );
  }

  async start(): Promise<void> {
    if (this.handle || this.openf1) return;

    // Read once per switch into live mode, not hot-swapped under a running
    // connection — see launchdarkly.ts for the flag's three values.
    const dataSource = await getDataSourceFlag();
    if (this.handle || this.openf1) return; // start()/stop() raced while we awaited the flag
    newrelic.addCustomAttribute("dataSource", dataSource);

    if (dataSource === "openf1" && hasOpenf1Credentials()) {
      this.log("data-source-flag is 'openf1' — sourcing live data fully from OpenF1 instead of F1's own feed");
      this.openf1 = connectOpenf1Full(this.engine.callbacks, {
        log: this.log,
        onConnected: (c) => {
          this.connected = c;
          this.openf1Connected = c;
        },
      });
    } else if (dataSource === "openf1") {
      this.log("data-source-flag is 'openf1' but OPENF1_USERNAME/PASSWORD aren't set — falling back to F1's own feed only");
      this.startSignalR();
    } else if (dataSource === "f1") {
      this.log("data-source-flag is 'f1' — using only F1's own feed, no OpenF1 supplement");
      this.startSignalR();
    } else {
      // "mix": F1's own feed, plus the OpenF1 supplement for the topics it doesn't grant.
      this.startSignalR();
      if (hasOpenf1Credentials()) {
        this.openf1 = connectOpenf1Live(
          { onMessage: this.engine.callbacks.onMessage },
          { log: this.log, onConnected: (c) => { this.openf1Connected = c; } },
        );
      } else {
        this.log("openf1: OPENF1_USERNAME/OPENF1_PASSWORD not set — skipping supplementary feed");
      }
    }

    this.engine.on("changed", this.onEngineChanged);

    // Diagnostic: per-topic message counts, so a topic that's silently not
    // arriving (e.g. CarData/Position) shows up as zero instead of just
    // "the UI doesn't have it". Also reported to New Relic as custom metrics
    // on the same interval, so the same gap shows up in dashboards/alerts.
    this.topicCountTimer = setInterval(() => {
      const counts = this.engine.drainTopicCounts();
      if (Object.keys(counts).length > 0) {
        this.log(`feed: topic counts (last ${TOPIC_COUNT_LOG_INTERVAL_MS / 1000}s): ${JSON.stringify(counts)}`);
        for (const [topic, count] of Object.entries(counts)) {
          newrelic.recordMetric(`Custom/Ingest/Topic/${topic}`, count);
        }
      }
      newrelic.recordMetric("Custom/Ingest/Connected", this.connected ? 1 : 0);
      newrelic.recordMetric("Custom/Ingest/Openf1Connected", this.openf1Connected ? 1 : 0);
      const ageMs = this.engine.lastMessageAgeMs();
      if (ageMs !== null) newrelic.recordMetric("Custom/Ingest/LastMessageAgeMs", ageMs);
    }, TOPIC_COUNT_LOG_INTERVAL_MS);
  }

  stop(): void {
    this.handle?.close();
    this.handle = null;
    this.openf1?.close();
    this.openf1 = null;
    this.engine.off("changed", this.onEngineChanged);
    this.connected = false;
    this.openf1Connected = false;
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

  /** Whether the OpenF1 supplementary feed (CarData/Position) is connected — always false outside live mode. */
  get openf1Connected(): boolean {
    return this.currentMode === "live" ? this.live.openf1Connected : false;
  }

  lastMessageAgeMs(): number | null {
    return this.currentMode === "live" ? this.live.engine.lastMessageAgeMs() : null;
  }

  setMode(mode: IngestMode): void {
    if (mode === this.currentMode) return;
    this.log(`switching to ${mode} mode`);
    if (mode === "live") {
      this.player.pause();
      void this.live.start();
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
