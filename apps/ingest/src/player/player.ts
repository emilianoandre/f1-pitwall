import { EventEmitter } from "node:events";
import type { SessionState } from "@f1-dash/types";
import { SessionStore } from "../state/store.js";
import { Deriver, type DerivedInternal } from "../state/derived.js";
import { buildSessionState } from "../state/transform.js";
import { readRecordingAll } from "../recording/reader.js";
import type { RecordingLine } from "../recording/format.js";

type RawTopics = Record<string, unknown>;

interface Keyframe {
  ts: number;
  /** Index of the next event to apply after this keyframe. */
  nextIndex: number;
  raw: RawTopics;
  derived: DerivedInternal;
}

export interface PlayerStatus {
  loaded: boolean;
  recordingId: string | null;
  recordingName: string | null;
  startMs: number;
  endMs: number;
  playheadMs: number;
  playing: boolean;
  speed: number;
}

const TARGET_KEYFRAMES = 40;

/**
 * A seekable recording player: loads a JSONL recording, builds periodic
 * keyframes so it can jump backward/forward instantly, and plays through it at
 * a variable speed. Emits "changed" whenever the visible state moves.
 */
export class Player extends EventEmitter {
  private store = new SessionStore();
  private deriver = new Deriver();
  private events: RecordingLine[] = [];
  private keyframes: Keyframe[] = [];

  private recordingId: string | null = null;
  private recordingName: string | null = null;
  private startMs = 0;
  private endMs = 0;
  private playheadMs = 0;
  private currentIndex = 0;
  private playing = false;
  private speed = 1;

  private loopTimer: NodeJS.Timeout | null = null;
  private lastTickAt = 0;

  get loaded(): boolean {
    return this.events.length > 0;
  }

  async load(file: string, id: string, name: string): Promise<void> {
    this.pause();
    this.events = await readRecordingAll(file);
    this.recordingId = id;
    this.recordingName = name;

    if (this.events.length === 0) {
      this.startMs = this.endMs = this.playheadMs = 0;
      return;
    }

    this.startMs = this.events[0]!.ts;
    this.endMs = this.events[this.events.length - 1]!.ts;

    // Forward pass building keyframes at a fixed stride.
    this.store = new SessionStore();
    this.deriver = new Deriver();
    this.keyframes = [];
    const stride = Math.max(1, Math.floor(this.events.length / TARGET_KEYFRAMES));

    for (let i = 0; i < this.events.length; i++) {
      this.applyEvent(this.events[i]!);
      if (i % stride === 0) {
        this.keyframes.push({
          ts: this.events[i]!.ts,
          nextIndex: i + 1,
          raw: this.store.snapshotRaw(),
          derived: this.deriver.serialize(),
        });
      }
    }

    // Rewind to the start.
    this.playheadMs = this.startMs;
    this.restoreToKeyframe(this.keyframes[0]!);
    this.emit("changed");
  }

  private applyEvent(e: RecordingLine): void {
    if (e.kind === "snapshot") {
      this.deriver.reset();
      this.store.applySnapshot(e.state as RawTopics);
    } else {
      this.store.applyUpdate(e.topic, e.data);
    }
    this.deriver.observe(this.store.getRaw() as RawTopics);
  }

  private restoreToKeyframe(kf: Keyframe): void {
    this.store.restoreRaw(kf.raw);
    this.deriver.restore(kf.derived);
    this.currentIndex = kf.nextIndex;
  }

  private bestKeyframe(targetMs: number): Keyframe {
    // Latest keyframe whose ts <= target.
    let best = this.keyframes[0]!;
    for (const kf of this.keyframes) {
      if (kf.ts <= targetMs) best = kf;
      else break;
    }
    return best;
  }

  private applyForwardTo(targetMs: number): void {
    while (
      this.currentIndex < this.events.length &&
      this.events[this.currentIndex]!.ts <= targetMs
    ) {
      this.applyEvent(this.events[this.currentIndex]!);
      this.currentIndex++;
    }
    this.playheadMs = targetMs;
  }

  /** Jump to an absolute playhead time (ms epoch of the recording timeline). */
  seek(targetMs: number): void {
    if (!this.loaded) return;
    const target = Math.min(this.endMs, Math.max(this.startMs, targetMs));
    if (target < this.playheadMs) {
      this.restoreToKeyframe(this.bestKeyframe(target));
    }
    this.applyForwardTo(target);
    this.emit("changed");
  }

  /** Seek by a fraction (0..1) of the timeline. */
  seekFraction(frac: number): void {
    if (!this.loaded) return;
    this.seek(this.startMs + (this.endMs - this.startMs) * frac);
  }

  play(): void {
    if (!this.loaded || this.playing) return;
    if (this.playheadMs >= this.endMs) this.seek(this.startMs);
    this.playing = true;
    this.lastTickAt = Date.now();
    this.loopTimer = setInterval(() => this.tick(), 100);
    this.emit("changed");
  }

  pause(): void {
    this.playing = false;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    this.emit("changed");
  }

  setSpeed(speed: number): void {
    this.speed = Math.min(200, Math.max(0.1, speed));
    this.emit("changed");
  }

  private tick(): void {
    if (!this.playing) return;
    const now = Date.now();
    const realDelta = now - this.lastTickAt;
    this.lastTickAt = now;
    let target = this.playheadMs + realDelta * this.speed;
    if (target >= this.endMs) {
      target = this.endMs;
      this.applyForwardTo(target);
      this.pause();
      return;
    }
    this.applyForwardTo(target);
    this.emit("changed");
  }

  getState(): SessionState {
    return buildSessionState(
      this.store.getRaw() as RawTopics,
      this.deriver.snapshot(),
    );
  }

  status(): PlayerStatus {
    return {
      loaded: this.loaded,
      recordingId: this.recordingId,
      recordingName: this.recordingName,
      startMs: this.startMs,
      endMs: this.endMs,
      playheadMs: this.playheadMs,
      playing: this.playing,
      speed: this.speed,
    };
  }

  hasData(): boolean {
    return this.store.hasData();
  }
}
