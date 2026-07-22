import { describe, it, expect } from "vitest";
import { Deriver } from "../src/state/derived.js";

/** Minimal raw TimingData shape for one driver at one point in time.
 * NumberOfLaps only increments once a lap actually completes — matching the
 * real feed's own semantics, not just "current lap number". */
function raw(
  num: string,
  numberOfLaps: number,
  sectors: [string, string, string],
  lastLap?: { Value: string; PersonalFastest?: boolean },
) {
  return {
    TimingData: {
      Lines: {
        [num]: {
          NumberOfLaps: numberOfLaps,
          Sectors: sectors.map((v) => ({ Value: v })),
          ...(lastLap ? { LastLapTime: lastLap } : {}),
        },
      },
    },
    TimingAppData: { Lines: {} },
  };
}

describe("Deriver sector freshness", () => {
  it("marks a sector fresh the instant its value changes, one at a time", () => {
    const d = new Deriver();
    d.observe(raw("44", 0, ["", "", ""]));
    expect(d.snapshot().freshSectors["44"]).toEqual([false, false, false]);

    d.observe(raw("44", 0, ["21.500", "", ""]));
    expect(d.snapshot().freshSectors["44"]).toEqual([true, false, false]);

    d.observe(raw("44", 0, ["21.500", "26.800", ""]));
    expect(d.snapshot().freshSectors["44"]).toEqual([true, true, false]);
  });

  it("resets freshness to all-false the instant a lap completes", () => {
    const d = new Deriver();
    d.observe(raw("44", 0, ["21.500", "26.800", ""]));
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], { Value: "1:12.400" }));
    expect(d.snapshot().freshSectors["44"]).toEqual([false, false, false]);
  });
});

describe("Deriver bestLapSectors", () => {
  it("captures all three sector times wholesale on a genuine personal-best lap", () => {
    const d = new Deriver();
    d.observe(
      raw("44", 1, ["21.500", "26.800", "24.100"], { Value: "1:12.400", PersonalFastest: true }),
    );
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });

  it("never touches bestLapSectors on a lap that isn't a new personal best", () => {
    const d = new Deriver();
    d.observe(
      raw("44", 1, ["21.500", "26.800", "24.100"], { Value: "1:12.400", PersonalFastest: true }),
    );

    // Lap 2: a brilliant S2 (24.000s, faster than lap 1's 26.800s!) but the
    // overall lap is worse than lap 1 -- not a personal best.
    d.observe(raw("44", 1, ["23.000", "24.000", ""]));
    d.observe(
      raw("44", 2, ["23.000", "24.000", "26.000"], { Value: "1:13.000", PersonalFastest: false }),
    );

    // Must remain lap 1's own triplet untouched -- the faster S2 from lap 2
    // must never leak into one slot of a still-better lap's reference.
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });

  it("overwrites bestLapSectors wholesale when a new personal best is set", () => {
    const d = new Deriver();
    d.observe(
      raw("44", 1, ["21.500", "26.800", "24.100"], { Value: "1:12.400", PersonalFastest: true }),
    );
    d.observe(
      raw("44", 2, ["21.000", "26.500", "23.900"], { Value: "1:11.400", PersonalFastest: true }),
    );
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21000, 26500, 23900]);
  });
});

describe("Deriver keyframe round-trip", () => {
  it("serialize/restore preserves freshSectors, bestLapSectors, and sector-change detection", () => {
    const d = new Deriver();
    d.observe(raw("44", 0, ["21.500", "", ""]));
    d.observe(
      raw("44", 1, ["21.500", "26.800", "24.100"], { Value: "1:12.400", PersonalFastest: true }),
    );
    const keyframe = d.serialize();

    const restored = new Deriver();
    restored.restore(keyframe);
    expect(restored.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
    expect(restored.snapshot().freshSectors["44"]).toEqual([false, false, false]);

    // lastSectorMs must have round-tripped too -- repeating the same S1
    // value shouldn't be (re-)detected as a fresh change.
    restored.observe(raw("44", 1, ["21.500", "26.800", "24.100"]));
    expect(restored.snapshot().freshSectors["44"]).toEqual([false, false, false]);
  });
});
