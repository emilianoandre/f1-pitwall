import { describe, it, expect } from "vitest";
import {
  formatLapTime,
  driverPatch,
  lapPatch,
  raceControlEntry,
  raceControlToTrackStatusCode,
  weatherPatch,
  pitTimesPatch,
  intervalPatch,
  stintPatch,
  teamRadioEntry,
} from "../src/feed/openf1/map.js";
import { StateEngine } from "../src/state/engine.js";
import type {
  Openf1Driver,
  Openf1Lap,
  Openf1RaceControl,
  Openf1Weather,
  Openf1Pit,
  Openf1Interval,
  Openf1Stint,
  Openf1TeamRadio,
} from "../src/feed/openf1/types.js";

describe("formatLapTime", () => {
  it("formats sub-minute values without a minutes prefix", () => {
    expect(formatLapTime(23.456)).toBe("23.456");
  });

  it("formats over-a-minute values with zero-padded seconds", () => {
    expect(formatLapTime(71.383)).toBe("1:11.383");
    expect(formatLapTime(65)).toBe("1:05.000");
  });

  it("returns empty string for non-finite or negative input", () => {
    expect(formatLapTime(NaN)).toBe("");
    expect(formatLapTime(-1)).toBe("");
  });
});

describe("driverPatch", () => {
  it("only includes fields OpenF1 actually sent", () => {
    const r: Openf1Driver = { driver_number: 55, name_acronym: "SAI", team_name: "Ferrari" };
    expect(driverPatch(r)).toEqual({ Tla: "SAI", TeamName: "Ferrari" });
  });
});

describe("lapPatch", () => {
  it("maps lap duration, sectors, and lap number", () => {
    const r: Openf1Lap = {
      driver_number: 55,
      lap_number: 12,
      lap_duration: 71.383,
      duration_sector_1: 23.1,
      duration_sector_2: 28.2,
      duration_sector_3: 20.083,
    };
    expect(lapPatch(r)).toEqual({
      NumberOfLaps: 12,
      LastLapTime: { Value: "1:11.383" },
      Sectors: [{ Value: "23.100" }, { Value: "28.200" }, { Value: "20.083" }],
    });
  });

  it("omits LastLapTime/Sectors when OpenF1 didn't send them", () => {
    expect(lapPatch({ driver_number: 55, lap_number: 1 })).toEqual({ NumberOfLaps: 1 });
  });
});

describe("raceControlEntry", () => {
  it("maps a flag message to F1's raw field names", () => {
    const r: Openf1RaceControl = {
      date: "2026-07-18T14:00:00Z",
      driver_number: null,
      lap_number: 5,
      category: "Flag",
      flag: "YELLOW",
      scope: "Track",
      sector: null,
      qualifying_phase: null,
      message: "YELLOW FLAG",
    };
    expect(raceControlEntry(r)).toEqual({
      Utc: "2026-07-18T14:00:00Z",
      Category: "Flag",
      Message: "YELLOW FLAG",
      Flag: "YELLOW",
      Scope: "Track",
      Lap: 5,
    });
  });
});

describe("raceControlToTrackStatusCode", () => {
  const base: Openf1RaceControl = {
    date: "t",
    driver_number: null,
    lap_number: null,
    category: null,
    flag: null,
    scope: null,
    sector: null,
    qualifying_phase: null,
    message: null,
  };

  it("maps track flags to the matching status code", () => {
    expect(raceControlToTrackStatusCode({ ...base, category: "Flag", scope: "Track", flag: "GREEN" })).toBe(1);
    expect(raceControlToTrackStatusCode({ ...base, category: "Flag", scope: "Track", flag: "YELLOW" })).toBe(2);
    expect(raceControlToTrackStatusCode({ ...base, category: "Flag", scope: "Track", flag: "DOUBLE YELLOW" })).toBe(2);
    expect(raceControlToTrackStatusCode({ ...base, category: "Flag", scope: "Track", flag: "RED" })).toBe(5);
  });

  it("maps safety car messages by text since OpenF1 has no dedicated status topic", () => {
    expect(
      raceControlToTrackStatusCode({ ...base, category: "SafetyCar", message: "SAFETY CAR DEPLOYED" }),
    ).toBe(4);
    expect(
      raceControlToTrackStatusCode({ ...base, category: "SafetyCar", message: "VIRTUAL SAFETY CAR DEPLOYED" }),
    ).toBe(6);
    expect(
      raceControlToTrackStatusCode({ ...base, category: "SafetyCar", message: "VIRTUAL SAFETY CAR ENDING" }),
    ).toBe(7);
  });

  it("returns null for messages that don't signal a status change", () => {
    expect(raceControlToTrackStatusCode({ ...base, category: "Drs", message: "DRS ENABLED" })).toBeNull();
    expect(raceControlToTrackStatusCode({ ...base, category: "Flag", scope: "Sector", flag: "YELLOW" })).toBeNull();
  });
});

describe("weatherPatch", () => {
  it("maps every field 1:1", () => {
    const r: Openf1Weather = {
      date: "t",
      air_temperature: 24.5,
      humidity: 60,
      pressure: 1013.2,
      rainfall: 0,
      track_temperature: 32.1,
      wind_direction: 180,
      wind_speed: 1.2,
    };
    expect(weatherPatch(r)).toEqual({
      AirTemp: 24.5,
      Humidity: 60,
      Pressure: 1013.2,
      Rainfall: 0,
      TrackTemp: 32.1,
      WindDirection: 180,
      WindSpeed: 1.2,
    });
  });
});

describe("pitTimesPatch", () => {
  it("prefers lane_duration over the deprecated pit_duration", () => {
    const r: Openf1Pit = { driver_number: 1, lap_number: 20, lane_duration: 22.4, pit_duration: 21.9 };
    expect(pitTimesPatch(r)).toEqual({ Lap: 20, Duration: "22.4" });
  });
});

describe("intervalPatch", () => {
  it("formats a numeric gap with the F1 '+' convention", () => {
    const r: Openf1Interval = { driver_number: 1, gap_to_leader: 6.924, interval: 1.2, date: "t" };
    expect(intervalPatch(r)).toEqual({
      GapToLeader: "+6.924",
      IntervalToPositionAhead: { Value: "+1.200" },
    });
  });

  it("treats a zero gap (the leader) as empty and passes strings through", () => {
    const r: Openf1Interval = { driver_number: 1, gap_to_leader: 0, interval: "+1 LAP", date: "t" };
    expect(intervalPatch(r)).toEqual({
      GapToLeader: "",
      IntervalToPositionAhead: { Value: "+1 LAP" },
    });
  });
});

describe("stintPatch", () => {
  it("maps compound and derives current tyre age from the lap range", () => {
    const r: Openf1Stint = {
      driver_number: 1,
      stint_number: 2,
      lap_start: 15,
      lap_end: 20,
      compound: "medium",
      tyre_age_at_start: 3,
    };
    expect(stintPatch(r)).toEqual({
      key: "2",
      value: { Compound: "MEDIUM", New: false, TotalLaps: 6, StartLaps: 3 },
    });
  });
});

describe("teamRadioEntry", () => {
  it("passes the already-absolute recording_url through as Path", () => {
    const r: Openf1TeamRadio = { driver_number: 55, date: "t", recording_url: "https://example.com/clip.mp3" };
    expect(teamRadioEntry(r)).toEqual({ Utc: "t", RacingNumber: "55", Path: "https://example.com/clip.mp3" });
  });
});

describe("full-switch pipeline through the real StateEngine", () => {
  it("assembles a coherent SessionState from OpenF1-shaped patches alone", () => {
    const engine = new StateEngine();
    const cb = engine.callbacks;

    // Session bootstrap (normally a one-time REST fetch in fullClient.ts).
    cb.onSnapshot({
      SessionInfo: {
        Type: "Qualifying",
        Name: "Qualifying",
        StartDate: "2026-07-18T14:00:00Z",
        Path: "",
        Meeting: {
          Name: "Belgian Grand Prix",
          OfficialName: "FORMULA 1 BELGIAN GRAND PRIX",
          Circuit: { Key: 7, ShortName: "Spa-Francorchamps" },
          Country: { Name: "Belgium" },
        },
      },
    });

    cb.onMessage("DriverList", { "55": driverPatch({ driver_number: 55, name_acronym: "SAI", full_name: "Carlos Sainz", team_name: "Williams", team_colour: "00A0DE" }) }, "t1");

    const lap: Openf1Lap = {
      driver_number: 55,
      lap_number: 3,
      lap_duration: 71.383,
      duration_sector_1: 23.1,
      duration_sector_2: 28.2,
      duration_sector_3: 20.083,
    };
    cb.onMessage("TimingData", { Lines: { "55": lapPatch(lap) } }, "t2");
    cb.onMessage("LapCount", { CurrentLap: lap.lap_number }, "t2");

    const rc: Openf1RaceControl = {
      date: "t3", driver_number: null, lap_number: null, category: "Flag", scope: "Track",
      flag: "YELLOW", sector: 2, qualifying_phase: 2, message: "YELLOW IN SECTOR 2",
    };
    cb.onMessage("RaceControlMessages", { Messages: [raceControlEntry(rc)] }, "t3");
    cb.onMessage("TimingData", { SessionPart: rc.qualifying_phase }, "t3");
    const statusCode = raceControlToTrackStatusCode(rc);
    if (statusCode !== null) cb.onMessage("TrackStatus", { Status: statusCode }, "t3");

    cb.onMessage("WeatherData", weatherPatch({
      date: "t4", air_temperature: 22, humidity: 55, pressure: 1010, rainfall: 0,
      track_temperature: 30, wind_direction: 90, wind_speed: 2,
    }), "t4");

    cb.onMessage("PitLaneTimeCollection", {
      PitTimes: { "55": pitTimesPatch({ driver_number: 55, lap_number: 3, lane_duration: 22.4 }) },
    }, "t5");

    cb.onMessage("TimingData", {
      Lines: { "55": intervalPatch({ driver_number: 55, gap_to_leader: 3.2, interval: 3.2, date: "t6" }) },
    }, "t6");

    const stint = stintPatch({ driver_number: 55, stint_number: 1, lap_start: 1, lap_end: 3, compound: "soft", tyre_age_at_start: 0 });
    cb.onMessage("TimingAppData", { Lines: { "55": { Stints: { [stint.key]: stint.value } } } }, "t7");

    cb.onMessage("TeamRadio", {
      Captures: [teamRadioEntry({ driver_number: 55, date: "t8", recording_url: "https://example.com/clip.mp3" })],
    }, "t8");

    const state = engine.getState();

    expect(state.session.meetingName).toBe("Belgian Grand Prix");
    expect(state.session.circuitName).toBe("Spa-Francorchamps");
    expect(state.session.part).toBe(2);
    expect(state.session.partLabel).toBe("Q2");

    const sai = state.drivers["55"];
    expect(sai?.tla).toBe("SAI");
    expect(sai?.teamName).toBe("Williams");
    expect(sai?.lastLap.value).toBe("1:11.383");
    expect(sai?.sectors[1]?.value).toBe("28.200");
    expect(sai?.numberOfLaps).toBe(3);
    expect(sai?.gapToLeaderMs).toBe(3200);
    expect(sai?.currentCompound).toBe("SOFT");
    expect(sai?.stints).toHaveLength(1);

    expect(state.clock.currentLap).toBe(3);
    expect(state.trackStatus).toBe("Yellow");
    expect(state.weather.trackTemp).toBe(30);
    expect(state.raceControl).toHaveLength(1);
    expect(state.raceControl[0]?.message).toBe("YELLOW IN SECTOR 2");
    expect(state.teamRadio).toHaveLength(1);
    expect(state.teamRadio[0]?.audioUrl).toBe("https://example.com/clip.mp3");
    expect(state.pitStops).toHaveLength(1);
    expect(state.pitStops[0]?.durationS).toBe(22.4);
  });
});
