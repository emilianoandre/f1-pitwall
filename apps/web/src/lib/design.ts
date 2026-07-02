// "Trackside Broadcast" design tokens + helpers shared across components.
import type { Compound, TimedValue } from "@f1-dash/types";

export const F1 = {
  bg: "#101215",
  bg2: "#08090B",
  panel: "#16181C",
  panel2: "#0D0E11",
  elev: "#26282E",
  border: "#2A2D33",
  border2: "#3A3E46",
  text: "#FFFFFF",
  muted: "#A6ABB2",
  muted2: "#6B7178",
  accent: "#E10600",
  accent2: "#FF3B30",
  green: "#34D058",
  amber: "#FFC400",
  red: "#E10600",
  purple: "#C46BFF",
  cyan: "#2BE0E0",
} as const;

/** Team livery hex → "#RRGGBB". Feed gives 6-hex without '#'. */
export function teamHex(colour: string | undefined): string {
  const c = (colour ?? "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(c) ? `#${c}` : "#8A9099";
}

/** Readable text color over a team-color block (per design handoff). */
export function contrastText(hex: string): string {
  const c = hex.replace(/^#/, "");
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0A0F1C" : "#fff";
}

export interface CompoundStyle {
  col: string;
  letter: string;
  text: string;
}

export const COMPOUND: Record<Compound, CompoundStyle> = {
  SOFT: { col: "#E8384F", letter: "S", text: "#fff" },
  MEDIUM: { col: "#F5B301", letter: "M", text: "#1a1206" },
  HARD: { col: "#D8DEE9", letter: "H", text: "#12181f" },
  INTERMEDIATE: { col: "#34D058", letter: "I", text: "#0A0F1C" },
  WET: { col: "#2BE0E0", letter: "W", text: "#0A0F1C" },
  UNKNOWN: { col: "#3A3E46", letter: "–", text: "#A6ABB2" },
};

/** Timing color convention: purple = overall best, green = personal best. */
export function timingColor(v: TimedValue, stale = false): string {
  if (v.overallBest) return F1.purple;
  if (v.personalBest) return F1.green;
  if (stale) return F1.muted2;
  return F1.text;
}

/** mm:ss race-clock formatting for a seconds value. */
export function raceClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function orDash(v: string | null | undefined): string {
  return v && v.length ? v : "–";
}
