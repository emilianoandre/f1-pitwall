import { describe, it, expect } from "vitest";
import { buildSessionState } from "../src/state/transform.js";
import { Deriver } from "../src/state/derived.js";

const emptyDerived = () => new Deriver().snapshot();

/** Minimal raw state: three drivers with a Line order that disagrees with best-lap order. */
function rawState(sessionName: string) {
  return {
    SessionInfo: { Name: sessionName, Meeting: {}, ArchiveStatus: {} },
    DriverList: {
      "1": { Tla: "AAA", FullName: "Driver A", TeamName: "Team", TeamColour: "111111" },
      "2": { Tla: "BBB", FullName: "Driver B", TeamName: "Team", TeamColour: "222222" },
      "3": { Tla: "CCC", FullName: "Driver C", TeamName: "Team", TeamColour: "333333" },
    },
    TimingData: {
      Lines: {
        // Line order: A, B, C -- but C actually has the fastest lap.
        "1": { Line: 1, Position: 1, BestLapTime: { Value: "1:20.000" } },
        "2": { Line: 2, Position: 2, BestLapTime: { Value: "1:19.000" } },
        "3": { Line: 3, Position: 3, BestLapTime: { Value: "1:18.000" } },
      },
    },
  };
}

/** Same shape as rawState(), plus TimingData.SessionPart for quali segment tests. */
function rawStateWithPart(sessionName: string, sessionPart: number) {
  const s = rawState(sessionName);
  return { ...s, TimingData: { ...s.TimingData, SessionPart: sessionPart } };
}

describe("session.partLabel", () => {
  it("labels regular Qualifying as Q1/Q2/Q3", () => {
    const s = buildSessionState(rawStateWithPart("Qualifying", 2), emptyDerived());
    expect(s.session.partLabel).toBe("Q2");
  });

  it("labels Sprint Qualifying as SQ1/SQ2/SQ3", () => {
    const s = buildSessionState(rawStateWithPart("Sprint Qualifying", 3), emptyDerived());
    expect(s.session.partLabel).toBe("SQ3");
  });

  it("is null outside Qualifying", () => {
    const s = buildSessionState(rawStateWithPart("Race", 1), emptyDerived());
    expect(s.session.partLabel).toBeNull();
  });

  it("is null when no segment is set", () => {
    const s = buildSessionState(rawState("Qualifying"), emptyDerived());
    expect(s.session.partLabel).toBeNull();
  });
});

describe("buildSessionState order", () => {
  it("ranks Practice by fastest lap, ignoring the feed's Line order", () => {
    const s = buildSessionState(rawState("Practice 1"), emptyDerived());
    expect(s.order.map((n) => s.drivers[n]!.tla)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("keeps the feed's Line order for Qualifying (segment cutoffs aren't just raw lap time)", () => {
    const s = buildSessionState(rawState("Qualifying"), emptyDerived());
    expect(s.order.map((n) => s.drivers[n]!.tla)).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("keeps the feed's Line order for Race", () => {
    const s = buildSessionState(rawState("Race"), emptyDerived());
    expect(s.order.map((n) => s.drivers[n]!.tla)).toEqual(["AAA", "BBB", "CCC"]);
  });
});
