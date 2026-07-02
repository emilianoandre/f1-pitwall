import type { Compound, SegmentStatus, TrackStatus, SessionType } from "@f1-dash/types";

/** Parse a lap/sector time string to milliseconds. Handles "1:23.456", "23.456", "", null. */
export function parseLapTime(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const s = v.trim();
  const m = /^(?:(\d+):)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  const frac = m[3] ? Number((m[3] + "000").slice(0, 3)) : 0;
  return min * 60_000 + sec * 1000 + frac;
}

/**
 * Parse a gap/interval string to ms. Handles "+12.345", "12.345", "+1.2s",
 * "1 L" / "+1 LAP" (lapped → null with lapped flag returned separately by caller),
 * "", "LAP 1", leader's own "".
 */
export function parseGap(v: unknown): { ms: number | null; lapped: boolean } {
  if (typeof v !== "string" || v.trim() === "") return { ms: null, lapped: false };
  const s = v.trim();
  if (/L(AP)?/i.test(s) && /\d/.test(s)) return { ms: null, lapped: true };
  const m = /^\+?\s*(\d+):?(\d+)?\.?(\d+)?/.exec(s.replace(/s$/i, ""));
  if (!m) return { ms: null, lapped: false };
  // If it contains a colon it's mm:ss.mmm; else it's seconds.mmm.
  if (s.includes(":")) {
    const ms = parseLapTime(s.replace(/^\+/, ""));
    return { ms, lapped: false };
  }
  const num = Number(s.replace(/^\+/, ""));
  return { ms: Number.isFinite(num) ? Math.round(num * 1000) : null, lapped: false };
}

export function parseCompound(v: unknown): Compound {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  switch (s) {
    case "SOFT":
    case "MEDIUM":
    case "HARD":
    case "INTERMEDIATE":
    case "WET":
      return s;
    default:
      return "UNKNOWN";
  }
}

export function parseNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parseBoolLike(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

/**
 * Map a mini-sector segment status code to a color.
 * Verified against real data: 0 = not set, 2048 = base/yellow-ish,
 * 2049 = personal best (green), 2051 = overall best (purple),
 * 2064 = in pit, 2052/2068 = pit/stopped variants. Unknowns default to "yellow".
 */
export function segmentStatus(code: unknown): SegmentStatus {
  switch (Number(code)) {
    case 0:
      return "none";
    case 2048:
      return "yellow";
    case 2049:
    case 2050:
      return "green";
    case 2051:
      return "purple";
    case 2064:
      return "pit";
    case 2052:
    case 2068:
      return "stopped";
    default:
      return "yellow";
  }
}

export function trackStatus(code: unknown): TrackStatus {
  switch (String(code)) {
    case "1":
      return "AllClear";
    case "2":
      return "Yellow";
    case "4":
      return "SCDeployed";
    case "5":
      return "Red";
    case "6":
      return "VSC";
    case "7":
      return "VSCEnding";
    default:
      return "Unknown";
  }
}

export function sessionType(v: unknown): SessionType {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.includes("practice")) return "Practice";
  if (s.includes("sprint") && s.includes("qual")) return "Qualifying"; // sprint shootout
  if (s.includes("sprint")) return "Sprint";
  if (s.includes("qual")) return "Qualifying";
  if (s.includes("race")) return "Race";
  return "Unknown";
}

/** DRS channel (45) values 10/12/14 = open, 8 = eligible, else closed. */
export function drsOpen(code: unknown): boolean {
  const n = Number(code);
  return n === 10 || n === 12 || n === 14;
}
