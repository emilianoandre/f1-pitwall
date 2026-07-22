import { describe, it, expect } from "vitest";
import { Deriver } from "../src/state/derived.js";

/** Minimal raw TimingData shape for one driver at one point in time.
 * NumberOfLaps only increments once a lap actually completes — matching the
 * real feed's own semantics, not just "current lap number". */
function raw(
  num: string,
  numberOfLaps: number,
  sectors: [string, string, string],
  lastLapValue?: string,
  sessionPart?: number,
) {
  return {
    TimingData: {
      Lines: {
        [num]: {
          NumberOfLaps: numberOfLaps,
          Sectors: sectors.map((v) => ({ Value: v })),
          ...(lastLapValue !== undefined ? { LastLapTime: { Value: lastLapValue } } : {}),
        },
      },
      ...(sessionPart !== undefined ? { SessionPart: sessionPart } : {}),
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
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));
    expect(d.snapshot().freshSectors["44"]).toEqual([false, false, false]);
  });
});

describe("Deriver bestLapSectors", () => {
  it("captures all three sector times wholesale on the first completed lap", () => {
    const d = new Deriver();
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });

  it("never touches bestLapSectors on a lap that isn't a new best", () => {
    const d = new Deriver();
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));

    // Lap 2: a brilliant S2 (24.000s, faster than lap 1's 26.800s!) but the
    // overall lap is worse than lap 1 -- not a new best.
    d.observe(raw("44", 1, ["23.000", "24.000", ""]));
    d.observe(raw("44", 2, ["23.000", "24.000", "26.000"], "1:13.000"));

    // Must remain lap 1's own triplet untouched -- the faster S2 from lap 2
    // must never leak into one slot of a still-better lap's reference.
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });

  it("overwrites bestLapSectors wholesale when a new best is set", () => {
    const d = new Deriver();
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));
    d.observe(raw("44", 2, ["21.000", "26.500", "23.900"], "1:11.400"));
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21000, 26500, 23900]);
  });
});

describe("Deriver bestLapSectors segment scoping", () => {
  it("discards the previous segment's best lap when the qualifying part changes", () => {
    const d = new Deriver();
    // Q1: a very fast lap.
    d.observe(raw("44", 1, ["20.000", "25.000", "23.000"], "1:08.000", 1));
    expect(d.snapshot().bestLapSectors["44"]).toEqual([20000, 25000, 23000]);

    // Q2 begins -- even though this first Q2 lap is slower than the Q1 best,
    // it must become the new (only) reference for Q2, not be ignored in
    // favor of the stale Q1 time.
    d.observe(raw("44", 2, ["21.000", "26.000", "24.000"], "1:11.000", 2));
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21000, 26000, 24000]);
  });

  it("keeps accumulating normally within Practice, which has no segments", () => {
    const d = new Deriver();
    // Practice sessions never set SessionPart.
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));
    d.observe(raw("44", 2, ["23.000", "27.000", "25.000"], "1:15.000"));
    // Second (slower) lap must not overwrite the first, absent any segment change.
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });

  it("does not reset on the very first observation, even mid-segment", () => {
    const d = new Deriver();
    // First-ever observe() call already in Q2 -- must not spuriously wipe
    // anything (there's nothing to wipe, but confirms no off-by-one reset).
    d.observe(raw("44", 1, ["21.000", "26.000", "24.000"], "1:11.000", 2));
    expect(d.snapshot().bestLapSectors["44"]).toEqual([21000, 26000, 24000]);
  });
});

describe("Deriver keyframe round-trip", () => {
  it("serialize/restore preserves freshSectors, bestLapSectors, and sector-change detection", () => {
    const d = new Deriver();
    d.observe(raw("44", 0, ["21.500", "", ""]));
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400"));
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

  it("round-trips segment scoping -- restored state doesn't reset on the next observation", () => {
    const d = new Deriver();
    d.observe(raw("44", 1, ["21.500", "26.800", "24.100"], "1:12.400", 1));
    const keyframe = d.serialize();

    const restored = new Deriver();
    restored.restore(keyframe);
    // Same segment (1) again -- must not be treated as a change.
    restored.observe(raw("44", 2, ["23.000", "27.000", "25.000"], "1:15.000", 1));
    expect(restored.snapshot().bestLapSectors["44"]).toEqual([21500, 26800, 24100]);
  });
});
