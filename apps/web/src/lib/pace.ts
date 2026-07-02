// Pace analytics derived client-side from lapHistory: current-stint tyre
// degradation and recent pace (for the head-to-head catch-up forecast).
import type { LapHistoryPoint } from "@f1-dash/types";

/** Laps of the current (last) stint: trailing run of same-compound laps. */
export function currentStintLaps(history: LapHistoryPoint[]): LapHistoryPoint[] {
  if (history.length === 0) return [];
  const compound = history[history.length - 1]!.compound;
  const out: LapHistoryPoint[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.compound !== compound) break;
    out.unshift(history[i]!);
  }
  return out;
}

/** Drop in/out/SC laps: keep laps within `pct` of the stint median. */
function representative(laps: LapHistoryPoint[], pct = 1.07): LapHistoryPoint[] {
  if (laps.length === 0) return [];
  const sorted = [...laps].map((l) => l.timeMs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return laps.filter((l) => l.timeMs <= median * pct);
}

/**
 * Tyre degradation for the current stint: linear-regression slope of lap time
 * over lap number, in seconds/lap. Positive = getting slower. Returns null
 * with fewer than 4 representative laps (not enough signal).
 */
export function stintDegradationSPerLap(history: LapHistoryPoint[]): number | null {
  const laps = representative(currentStintLaps(history));
  if (laps.length < 4) return null;
  const n = laps.length;
  const meanX = laps.reduce((a, l) => a + l.lap, 0) / n;
  const meanY = laps.reduce((a, l) => a + l.timeMs, 0) / n;
  let num = 0;
  let den = 0;
  for (const l of laps) {
    num += (l.lap - meanX) * (l.timeMs - meanY);
    den += (l.lap - meanX) ** 2;
  }
  if (den === 0) return null;
  return num / den / 1000; // ms/lap → s/lap
}

/** Average of the last `n` representative laps, in ms. Null if none. */
export function recentPaceMs(history: LapHistoryPoint[], n = 3): number | null {
  const laps = representative(history.slice(-(n + 2))).slice(-n);
  if (laps.length === 0) return null;
  return laps.reduce((a, l) => a + l.timeMs, 0) / laps.length;
}

export interface CatchForecast {
  /** Positive = chaser closing on the car ahead, s/lap. */
  ratePerLapS: number;
  /** Laps until inside DRS range (<1.0s); null if not closing or already there. */
  lapsToDrs: number | null;
  alreadyInDrs: boolean;
}

/**
 * Forecast whether `chaser` is catching the car ahead, from each car's recent
 * pace and the current interval between them.
 */
export function catchForecast(
  chaserHistory: LapHistoryPoint[],
  aheadHistory: LapHistoryPoint[],
  intervalMs: number | null,
): CatchForecast | null {
  const chaser = recentPaceMs(chaserHistory);
  const ahead = recentPaceMs(aheadHistory);
  if (chaser === null || ahead === null) return null;
  const ratePerLapS = (ahead - chaser) / 1000; // ahead slower → positive → closing
  const alreadyInDrs = intervalMs !== null && intervalMs < 1000;
  let lapsToDrs: number | null = null;
  if (!alreadyInDrs && intervalMs !== null && ratePerLapS > 0.05) {
    lapsToDrs = Math.ceil((intervalMs / 1000 - 1.0) / ratePerLapS);
  }
  return { ratePerLapS, lapsToDrs, alreadyInDrs };
}
