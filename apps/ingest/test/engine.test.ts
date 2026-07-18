import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readRecording } from "../src/recording/reader.js";
import { StateEngine } from "../src/state/engine.js";
import type { SessionState } from "@f1-dash/types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "spanish-2024-qualifying.jsonl");

async function replayFixture(): Promise<SessionState> {
  const engine = new StateEngine();
  const cb = engine.callbacks;
  for await (const line of readRecording(FIXTURE)) {
    if (line.kind === "snapshot") cb.onSnapshot(line.state);
    else cb.onMessage(line.topic, line.data, "");
  }
  return engine.getState();
}

describe("StateEngine over real Spanish 2024 qualifying", () => {
  it("identifies the session and circuit", async () => {
    const s = await replayFixture();
    expect(s.session.type).toBe("Qualifying");
    expect(s.session.meetingName).toBe("Spanish Grand Prix");
    expect(s.session.circuitName).toBe("Catalunya");
    expect(s.session.part).toBe(3); // ended in Q3
    expect(s.session.partLabel).toBe("Q3"); // regular Qualifying, not Sprint
  });

  it("produces the correct final classification (top 10 by TLA)", async () => {
    const s = await replayFixture();
    const top10 = s.order.slice(0, 10).map((n) => s.drivers[n]!.tla);
    // Real result, 2024 Spanish GP Qualifying.
    expect(top10).toEqual([
      "NOR", "VER", "HAM", "RUS", "LEC", "SAI", "GAS", "PER", "OCO", "PIA",
    ]);
  });

  it("parses pole lap time to milliseconds", async () => {
    const s = await replayFixture();
    const pole = s.drivers[s.order[0]!]!;
    expect(pole.tla).toBe("NOR");
    expect(pole.bestLap.value).toBe("1:11.383");
    expect(pole.bestLap.ms).toBe(71_383);
  });

  it("populates all 20 drivers with team colours", async () => {
    const s = await replayFixture();
    const nums = Object.keys(s.drivers);
    expect(nums.length).toBe(20);
    for (const d of Object.values(s.drivers)) {
      expect(d.teamColour).toMatch(/^[0-9A-Fa-f]{6}$/);
      expect(d.tla).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("accumulates lap history", async () => {
    const s = await replayFixture();
    const poleLaps = s.lapHistory[s.order[0]!] ?? [];
    expect(poleLaps.length).toBeGreaterThan(3);
    for (const lap of poleLaps) {
      expect(lap.timeMs).toBeGreaterThan(60_000);
      expect(lap.lap).toBeGreaterThan(0);
    }
  });

  it("reports no qualifying cutoff in the final segment (Q3)", async () => {
    const s = await replayFixture();
    expect(s.session.part).toBe(3);
    expect(s.qualifyingCutoff).toBeNull();
  });

  it("accumulates pit stops from ephemeral PitTimes entries", async () => {
    const s = await replayFixture();
    // Quali has plenty of pit-lane visits; entries are _deleted from raw state
    // moments after appearing, so a populated list proves accumulation works.
    expect(s.pitStops.length).toBeGreaterThan(5);
    for (const p of s.pitStops) {
      expect(p.durationS).toBeGreaterThan(0);
      expect(p.lap).toBeGreaterThan(0);
      expect(p.racingNumber).toMatch(/^\d+$/);
    }
  });

  it("does not throw on any message and keeps order stable length", async () => {
    const s = await replayFixture();
    expect(s.order.length).toBe(20);
    expect(new Set(s.order).size).toBe(20); // no duplicates
  });
});
