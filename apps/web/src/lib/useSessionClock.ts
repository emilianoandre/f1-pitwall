"use client";

import { useEffect, useState } from "react";
import { useLiveStore } from "./liveStore";

function parseClock(remaining: string): number {
  const m = /(\d+):(\d{2}):(\d{2})/.exec(remaining);
  if (!m) return 0;
  return Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000;
}

function fmt(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const mnt = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(mnt).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Extrapolate the remaining-time countdown between server updates. When the
 * session clock is "extrapolating" we tick locally; otherwise we show the last
 * server value verbatim. Also formats the race lap counter.
 */
export function useSessionClock(): {
  remaining: string;
  lapText: string | null;
  currentLap: number | null;
  totalLaps: number | null;
} {
  const clock = useLiveStore((s) => s.state?.clock);
  const [, force] = useState(0);

  useEffect(() => {
    if (!clock?.extrapolating) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [clock?.extrapolating]);

  if (!clock) return { remaining: "—", lapText: null, currentLap: null, totalLaps: null };

  const baseMs = parseClock(clock.remaining);
  let remainingMs = baseMs;
  if (clock.extrapolating && clock.utc) {
    const sampledAt = Date.parse(clock.utc);
    if (!Number.isNaN(sampledAt)) {
      remainingMs = Math.max(0, baseMs - (Date.now() - sampledAt));
    }
  }

  const lapText =
    clock.currentLap && clock.totalLaps
      ? `LAP ${clock.currentLap} / ${clock.totalLaps}`
      : null;

  return {
    remaining: clock.remaining ? fmt(remainingMs) : "—",
    lapText,
    currentLap: clock.currentLap,
    totalLaps: clock.totalLaps,
  };
}
