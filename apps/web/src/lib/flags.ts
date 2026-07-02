import type { RaceControlMessage } from "@f1-dash/types";

/**
 * Determine which marshal sectors currently have a yellow flag, by replaying
 * race-control messages chronologically. YELLOW/DOUBLE YELLOW set a sector;
 * CLEAR/GREEN on a sector clear it; a track-wide GREEN clears everything.
 */
export function activeYellowSectors(messages: RaceControlMessage[]): Set<number> {
  const active = new Set<number>();
  // raceControl is stored oldest→newest already.
  for (const m of messages) {
    const flag = (m.flag ?? "").toUpperCase();
    if (m.scope === "Track" && flag === "GREEN") {
      active.clear();
      continue;
    }
    if (m.scope !== "Sector" || m.sector === undefined) continue;
    if (flag === "YELLOW" || flag === "DOUBLE YELLOW") active.add(m.sector);
    else if (flag === "CLEAR" || flag === "GREEN") active.delete(m.sector);
  }
  return active;
}
