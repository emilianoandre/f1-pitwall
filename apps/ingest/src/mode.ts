import { EventEmitter } from "node:events";
import type { IngestMode } from "@f1-dash/types";
import type { StateSource } from "./server.js";
import { StateEngine } from "./state/engine.js";
import { Player } from "./player/player.js";
import { connectLive } from "./feed/live.js";
import type { FeedHandle } from "./feed/source.js";

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

/** Owns the live feed engine + connection, started/stopped on demand. */
class LiveController {
  readonly engine = new StateEngine();
  private handle: FeedHandle | null = null;
  connected = false;

  constructor(private readonly log: (m: string) => void) {}

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
  }

  stop(): void {
    this.handle?.close();
    this.handle = null;
    this.connected = false;
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
