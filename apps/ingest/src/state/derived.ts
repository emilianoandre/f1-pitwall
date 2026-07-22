import type { LapHistoryPoint, GapHistoryPoint, Compound, PitStop } from "@f1-dash/types";
import { parseLapTime, parseGap, parseCompound, parseBoolLike } from "./parse.js";

/** [S1, S2, S3] ms, or [S1, S2, S3] freshness flags. */
type SectorTriple<T> = [T, T, T];

export interface DerivedData {
  lapHistory: Record<string, LapHistoryPoint[]>;
  gapHistory: Record<string, GapHistoryPoint[]>;
  pitStops: PitStop[];
  freshSectors: Record<string, SectorTriple<boolean>>;
  bestLapSectors: Record<string, SectorTriple<number | null>>;
}

/** Full internal deriver state, for keyframe save/restore. */
export interface DerivedInternal {
  lapHistory: Record<string, LapHistoryPoint[]>;
  gapHistory: Record<string, GapHistoryPoint[]>;
  pitStops: PitStop[];
  lastLapSeen: Record<string, number>;
  lastGapLap: number;
  lastSectorMs: Record<string, SectorTriple<number | null>>;
  freshSectors: Record<string, SectorTriple<boolean>>;
  bestLapSectors: Record<string, SectorTriple<number | null>>;
}

type Any = Record<string, unknown>;

function obj(v: unknown): Any {
  return v && typeof v === "object" ? (v as Any) : {};
}

/**
 * Accumulates per-lap history and per-lap gap snapshots by observing the merged
 * raw state after each update. Kept separate from the pure transform because it
 * needs memory across updates.
 */
export class Deriver {
  private lapHistory: Record<string, LapHistoryPoint[]> = {};
  private gapHistory: Record<string, GapHistoryPoint[]> = {};
  /** Completed pit stops — accumulated because PitTimes entries are ephemeral
   * (the feed shows a stop briefly, then `_deleted`s it). Keyed for dedupe. */
  private pitStops: PitStop[] = [];
  private pitSeen = new Set<string>();
  /** Last lap count we recorded per driver, to detect lap completion. */
  private lastLapSeen: Record<string, number> = {};
  /** Last leader lap for which we snapshotted gaps. */
  private lastGapLap = 0;
  /** Last-seen sector ms per driver, to detect when one changes (see freshSectors). */
  private lastSectorMs: Record<string, SectorTriple<number | null>> = {};
  /** Whether each sector belongs to the lap currently being timed for that
   * driver, vs. a stale value left over from before it started. Reset to
   * all-false the instant a lap completes; flips true index-by-index as the
   * next lap's own splits land. */
  private freshSectors: Record<string, SectorTriple<boolean>> = {};
  /** The three sector times from the one lap that stands as each driver's
   * personal-best lap — set wholesale, only on a genuine new personal best,
   * so a faster sector from a different (slower) lap can never leak in. */
  private bestLapSectors: Record<string, SectorTriple<number | null>> = {};

  reset(): void {
    this.lapHistory = {};
    this.gapHistory = {};
    this.pitStops = [];
    this.pitSeen = new Set();
    this.lastLapSeen = {};
    this.lastGapLap = 0;
    this.lastSectorMs = {};
    this.freshSectors = {};
    this.bestLapSectors = {};
  }

  /** Deep clone of internal state — for keyframing a seekable player. */
  serialize(): DerivedInternal {
    return structuredClone({
      lapHistory: this.lapHistory,
      gapHistory: this.gapHistory,
      pitStops: this.pitStops,
      lastLapSeen: this.lastLapSeen,
      lastGapLap: this.lastGapLap,
      lastSectorMs: this.lastSectorMs,
      freshSectors: this.freshSectors,
      bestLapSectors: this.bestLapSectors,
    });
  }

  /** Restore internal state from a keyframe clone. */
  restore(state: DerivedInternal): void {
    const c = structuredClone(state);
    this.lapHistory = c.lapHistory;
    this.gapHistory = c.gapHistory;
    this.pitStops = c.pitStops;
    this.pitSeen = new Set(c.pitStops.map((p) => `${p.racingNumber}-${p.lap}`));
    this.lastLapSeen = c.lastLapSeen;
    this.lastGapLap = c.lastGapLap;
    this.lastSectorMs = c.lastSectorMs ?? {};
    this.freshSectors = c.freshSectors ?? {};
    this.bestLapSectors = c.bestLapSectors ?? {};
  }

  /** Call after each store apply with the current merged raw state. */
  observe(raw: Any): void {
    const timingLines = obj(obj(raw.TimingData).Lines);
    const appLines = obj(obj(raw.TimingAppData).Lines);

    let leaderLap = 0;

    for (const [num, lineRaw] of Object.entries(timingLines)) {
      if (!/^\d+$/.test(num)) continue;
      const line = obj(lineRaw);
      const laps = numberOr(line.NumberOfLaps, -1);
      if (laps > leaderLap) leaderLap = laps;

      // Step 1: mark any sector index whose value just changed as "fresh"
      // (belongs to the lap currently being timed). Must run before the
      // lap-completion reset below, so S3's freshness is captured for the
      // lap that's completing before immediately clearing for the next one.
      const sectorsRaw = Array.isArray(line.Sectors) ? line.Sectors : [];
      const currentSectorMs = sectorTriple((i) => parseLapTime(obj(sectorsRaw[i]).Value));
      const lastMs = this.lastSectorMs[num] ?? ([null, null, null] as SectorTriple<number | null>);
      const fresh = this.freshSectors[num] ?? ([false, false, false] as SectorTriple<boolean>);
      for (let i = 0; i < 3; i++) {
        const ms = currentSectorMs[i];
        if (typeof ms === "number" && ms !== lastMs[i]) {
          fresh[i] = true;
          lastMs[i] = ms;
        }
      }
      this.lastSectorMs[num] = lastMs;
      this.freshSectors[num] = fresh;

      const prev = this.lastLapSeen[num] ?? -1;
      if (laps > prev && laps > 0) {
        this.lastLapSeen[num] = laps;
        const timeMs = parseLapTime(obj(line.LastLapTime).Value);
        if (timeMs !== null) {
          (this.lapHistory[num] ??= []).push({
            lap: laps,
            timeMs,
            compound: currentCompound(appLines[num]),
          });
        }

        // Step 2: on a genuine new personal-best lap, capture all three
        // sector times together, wholesale — never index-by-index — so a
        // faster individual sector from a different (slower) lap can never
        // replace one entry of a still-better lap's triplet.
        if (parseBoolLike(obj(line.LastLapTime).PersonalFastest)) {
          this.bestLapSectors[num] = [...currentSectorMs] as SectorTriple<number | null>;
        }
        // The next lap hasn't reported anything yet.
        this.freshSectors[num] = [false, false, false];
      }
    }

    // Snapshot gaps once per new leader lap (race view).
    if (leaderLap > this.lastGapLap) {
      this.lastGapLap = leaderLap;
      for (const [num, lineRaw] of Object.entries(timingLines)) {
        if (!/^\d+$/.test(num)) continue;
        const line = obj(lineRaw);
        const g = parseGap(line.GapToLeader);
        if (g.ms !== null || g.lapped) {
          (this.gapHistory[num] ??= []).push({
            lap: leaderLap,
            gapMs: g.ms ?? 0,
            lapped: g.lapped,
          });
        }
      }
    }

    // Pit stops: PitTimes entries are transient, so record each once as it
    // appears (Duration may refine while shown — last write wins).
    const pitTimes = obj(obj(raw.PitLaneTimeCollection).PitTimes);
    for (const [num, entryRaw] of Object.entries(pitTimes)) {
      if (!/^\d+$/.test(num)) continue;
      const e = obj(entryRaw);
      const lap = numberOr(e.Lap, 0);
      // Duration is usually "22.0" (seconds); long stops may use "1:02.5".
      const durRaw = typeof e.Duration === "string" ? e.Duration : "";
      const durationS = durRaw.includes(":")
        ? (parseLapTime(durRaw) ?? 0) / 1000
        : numberOr(e.Duration, 0);
      if (lap <= 0 || durationS <= 0) continue;
      const key = `${num}-${lap}`;
      if (this.pitSeen.has(key)) {
        const existing = this.pitStops.find((p) => p.racingNumber === num && p.lap === lap);
        if (existing) existing.durationS = durationS;
      } else {
        this.pitSeen.add(key);
        this.pitStops.push({ racingNumber: num, lap, durationS });
      }
    }
  }

  snapshot(): DerivedData {
    return {
      lapHistory: this.lapHistory,
      gapHistory: this.gapHistory,
      pitStops: this.pitStops,
      freshSectors: this.freshSectors,
      bestLapSectors: this.bestLapSectors,
    };
  }
}

function sectorTriple<T>(fn: (i: number) => T): SectorTriple<T> {
  return [fn(0), fn(1), fn(2)];
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return fallback;
}

function currentCompound(appLine: unknown): Compound {
  const stintsRaw = obj(appLine).Stints;
  const entries = Array.isArray(stintsRaw)
    ? stintsRaw
    : Object.entries(obj(stintsRaw))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, v]) => v);
  const last = entries[entries.length - 1];
  return last ? parseCompound(obj(last).Compound) : "UNKNOWN";
}
