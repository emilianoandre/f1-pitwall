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
