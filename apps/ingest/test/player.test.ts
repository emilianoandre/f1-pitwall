import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Player } from "../src/player/player.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "spanish-2024-qualifying.jsonl");

describe("Player seek", () => {
  let player: Player;
  beforeAll(async () => {
    player = new Player();
    await player.load(FIXTURE, "spanish-quali", "Spanish 2024 Qualifying");
  });

  it("loads with a valid timeline", () => {
    const s = player.status();
    expect(s.loaded).toBe(true);
    expect(s.endMs).toBeGreaterThan(s.startMs);
    expect(s.playheadMs).toBe(s.startMs); // rewound after load
  });

  it("seeking to the end yields the final classification (NOR pole)", () => {
    const st = player.status();
    player.seek(st.endMs);
    const s = player.getState();
    expect(s.order.slice(0, 3).map((n) => s.drivers[n]!.tla)).toEqual(["NOR", "VER", "HAM"]);
  });

  it("seeking to the start yields an early, sparse state", () => {
    const st = player.status();
    player.seek(st.startMs);
    const s = player.getState();
    // At the very start almost no best laps are set.
    const withBest = Object.values(s.drivers).filter((d) => d.bestLap.ms !== null).length;
    expect(withBest).toBeLessThan(5);
  });

  it("seeking backward then forward is consistent (matches a fresh forward seek)", () => {
    const st = player.status();
    const mid = st.startMs + (st.endMs - st.startMs) * 0.5;

    // Forward-only reference: fresh seek from start to mid.
    player.seek(st.startMs);
    player.seek(mid);
    const forwardOrder = player.getState().order.join(",");

    // Now overshoot to the end, then seek BACKWARD to mid.
    player.seek(st.endMs);
    player.seek(mid);
    const backwardOrder = player.getState().order.join(",");

    expect(backwardOrder).toBe(forwardOrder);
  });

  it("monotonic lap history: earlier playhead has <= laps than later", () => {
    const st = player.status();
    player.seekFraction(0.3);
    const early = totalLaps(player.getState().lapHistory);
    player.seekFraction(0.9);
    const late = totalLaps(player.getState().lapHistory);
    expect(late).toBeGreaterThanOrEqual(early);
  });
});

function totalLaps(lh: Record<string, { lap: number }[]>): number {
  return Object.values(lh).reduce((a, arr) => a + arr.length, 0);
}
