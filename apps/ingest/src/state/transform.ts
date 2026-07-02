import type {
  SessionState,
  DriverState,
  Sector,
  Stint,
  TimedValue,
  Weather,
  RaceControlMessage,
  SessionInfo,
  SessionClock,
  Battle,
  CarData,
  TrackPosition,
} from "@f1-dash/types";
import {
  parseLapTime,
  parseGap,
  parseCompound,
  parseNumber,
  parseBoolLike,
  segmentStatus,
  trackStatus,
  sessionType,
  drsOpen,
} from "./parse.js";
import type { DerivedData } from "./derived.js";
import { STATIC_URL } from "../feed/topics.js";

type Any = Record<string, unknown>;

function obj(v: unknown): Any {
  return v && typeof v === "object" ? (v as Any) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function timedValue(v: unknown): TimedValue {
  const o = obj(v);
  const value = str(o.Value);
  return {
    value,
    ms: parseLapTime(value),
    personalBest: parseBoolLike(o.PersonalFastest),
    overallBest: parseBoolLike(o.OverallFastest),
  };
}

function sector(v: unknown): Sector {
  const o = obj(v);
  const segmentsRaw = Array.isArray(o.Segments) ? o.Segments : [];
  return {
    value: str(o.Value),
    ms: parseLapTime(o.Value),
    personalBest: parseBoolLike(o.PersonalFastest),
    overallBest: parseBoolLike(o.OverallFastest),
    segments: segmentsRaw.map((s) => segmentStatus(obj(s).Status)),
  };
}

function emptySector(): Sector {
  return { value: "", ms: null, personalBest: false, overallBest: false, segments: [] };
}

function stints(v: unknown): Stint[] {
  // Stints arrive as either an array or a numeric-keyed object.
  const entries = Array.isArray(v)
    ? v
    : Object.entries(obj(v))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, val]) => val);
  return entries.map((s) => {
    const o = obj(s);
    return {
      compound: parseCompound(o.Compound),
      isNew: parseBoolLike(o.New),
      age: parseNumber(o.TotalLaps),
      startLaps: parseNumber(o.StartLaps),
    };
  });
}

function carData(cars: Any, num: string): CarData | undefined {
  const car = obj(cars[num]);
  const ch = obj(car.Channels);
  if (Object.keys(ch).length === 0) return undefined;
  return {
    rpm: parseNumber(ch["0"]),
    speed: parseNumber(ch["2"]),
    gear: parseNumber(ch["3"]),
    throttle: parseNumber(ch["4"]),
    brake: parseNumber(ch["5"]),
    drs: drsOpen(ch["45"]),
    utc: "",
  };
}

function trackPosition(entries: Any, num: string): TrackPosition | undefined {
  const e = obj(entries[num]);
  if (e.X === undefined && e.Y === undefined) return undefined;
  return {
    x: parseNumber(e.X),
    y: parseNumber(e.Y),
    z: parseNumber(e.Z),
    status: str(e.Status) || "OnTrack",
  };
}

function buildSession(raw: Any): SessionInfo {
  const si = obj(raw.SessionInfo);
  const meeting = obj(si.Meeting);
  const circuit = obj(meeting.Circuit);
  const country = obj(meeting.Country);
  const type = sessionType(si.Type ?? si.Name);
  return {
    type,
    name: str(si.Name),
    meetingName: str(meeting.Name),
    officialName: str(meeting.OfficialName),
    circuitKey: circuit.Key !== undefined ? parseNumber(circuit.Key) : null,
    circuitName: str(circuit.ShortName),
    countryName: str(country.Name),
    startDate: str(si.StartDate),
    path: str(si.Path),
    started: Object.keys(obj(obj(raw.TimingData).Lines)).length > 0,
    part: obj(raw.TimingData).SessionPart !== undefined
      ? parseNumber(obj(raw.TimingData).SessionPart)
      : null,
  };
}

function buildClock(raw: Any): SessionClock {
  const ec = obj(raw.ExtrapolatedClock);
  const lc = obj(raw.LapCount);
  return {
    remaining: str(ec.Remaining),
    extrapolating: parseBoolLike(ec.Extrapolating),
    utc: str(ec.Utc),
    currentLap: lc.CurrentLap !== undefined ? parseNumber(lc.CurrentLap) : null,
    totalLaps: lc.TotalLaps !== undefined ? parseNumber(lc.TotalLaps) : null,
  };
}

function buildWeather(raw: Any): Weather {
  const w = obj(raw.WeatherData);
  return {
    airTemp: parseNumber(w.AirTemp),
    trackTemp: parseNumber(w.TrackTemp),
    humidity: parseNumber(w.Humidity),
    pressure: parseNumber(w.Pressure),
    windSpeed: parseNumber(w.WindSpeed),
    windDirection: parseNumber(w.WindDirection),
    rainfall: parseBoolLike(w.Rainfall),
  };
}

function buildRaceControl(raw: Any): RaceControlMessage[] {
  const rc = obj(raw.RaceControlMessages);
  const msgs = rc.Messages;
  const list = Array.isArray(msgs)
    ? msgs
    : Object.entries(obj(msgs))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, v]) => v);
  return list.map((m) => {
    const o = obj(m);
    return {
      utc: str(o.Utc),
      category: str(o.Category),
      message: str(o.Message),
      flag: o.Flag !== undefined ? str(o.Flag) : undefined,
      scope: o.Scope !== undefined ? str(o.Scope) : undefined,
      sector: o.Sector !== undefined ? parseNumber(o.Sector) : undefined,
      lap: o.Lap !== undefined ? parseNumber(o.Lap) : undefined,
    };
  });
}

function buildTeamRadio(raw: Any, driverList: Any, session: SessionInfo): SessionState["teamRadio"] {
  const capturesRaw = obj(raw.TeamRadio).Captures;
  const list = Array.isArray(capturesRaw)
    ? capturesRaw
    : Object.entries(obj(capturesRaw))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, v]) => v);
  const base = session.path ? `${STATIC_URL}/${session.path}` : "";
  return list
    .map((c) => {
      const o = obj(c);
      const num = str(o.RacingNumber);
      const path = str(o.Path);
      const d = obj(driverList[num]);
      return {
        utc: str(o.Utc),
        racingNumber: num,
        tla: str(d.Tla) || num,
        teamName: str(d.TeamName),
        teamColour: str(d.TeamColour) || "808080",
        audioUrl: base && path ? `${base}${path}` : "",
      };
    })
    .filter((c) => c.audioUrl !== "");
}

/** Build the full clean SessionState from the merged raw topics + derived data. */
export function buildSessionState(rawState: Any, derived: DerivedData): SessionState {
  const raw = rawState;
  const driverList = obj(raw.DriverList);
  const timingLines = obj(obj(raw.TimingData).Lines);
  const appLines = obj(obj(raw.TimingAppData).Lines);
  const carEntries = obj(raw.CarData);
  const carsLatest = obj(latestCarCars(carEntries));
  const posLatest = obj(latestPositionEntries(raw.Position));

  const drivers: Record<string, DriverState> = {};

  for (const [num, dRaw] of Object.entries(driverList)) {
    if (!/^\d+$/.test(num)) continue;
    const d = obj(dRaw);
    const t = obj(timingLines[num]);
    const app = obj(appLines[num]);
    const st = stints(app.Stints);
    const current = st[st.length - 1];

    const gapRaw = gapString(t);
    const gap = parseGap(gapRaw);
    const intervalRaw = str(obj(t.IntervalToPositionAhead).Value) || quali(t, "TimeDifftoPositionAhead");
    const interval = parseGap(intervalRaw);

    const sectorsRaw = Array.isArray(t.Sectors) ? t.Sectors : [];
    const sectors: [Sector, Sector, Sector] = [
      sectorsRaw[0] ? sector(sectorsRaw[0]) : emptySector(),
      sectorsRaw[1] ? sector(sectorsRaw[1]) : emptySector(),
      sectorsRaw[2] ? sector(sectorsRaw[2]) : emptySector(),
    ];

    drivers[num] = {
      racingNumber: num,
      tla: str(d.Tla),
      fullName: str(d.FullName),
      teamName: str(d.TeamName),
      teamColour: str(d.TeamColour) || "808080",
      headshotUrl: d.HeadshotUrl !== undefined ? str(d.HeadshotUrl) : undefined,
      line: parseNumber(t.Line ?? d.Line ?? 99),
      position: parseNumber(t.Position ?? 99),
      gapToLeader: gapRaw,
      gapToLeaderMs: gap.ms,
      lapped: gap.lapped,
      interval: intervalRaw,
      intervalMs: interval.ms,
      lastLap: timedValue(t.LastLapTime),
      bestLap: timedValue(t.BestLapTime),
      sectors,
      numberOfLaps: parseNumber(t.NumberOfLaps),
      stints: st,
      currentCompound: current ? current.compound : "UNKNOWN",
      tyreAge: current ? current.age : 0,
      inPit: parseBoolLike(t.InPit),
      pitOut: parseBoolLike(t.PitOut),
      numberOfPitStops: parseNumber(t.NumberOfPitStops),
      retired: parseBoolLike(t.Retired),
      stopped: parseBoolLike(t.Stopped),
      knockedOut: parseBoolLike(t.KnockedOut),
      carData: carData(carsLatest, num),
      trackPosition: trackPosition(posLatest, num),
    };
  }

  const order = Object.values(drivers)
    .sort((a, b) => (a.line || 99) - (b.line || 99))
    .map((d) => d.racingNumber);

  const session = buildSession(raw);
  const battles = session.type === "Race" ? computeBattles(drivers, order) : [];
  const qualifyingCutoff = computeQualifyingCutoff(session, obj(raw.TimingData));

  return {
    session,
    clock: buildClock(raw),
    qualifyingCutoff,
    trackStatus: trackStatus(obj(raw.TrackStatus).Status),
    weather: buildWeather(raw),
    drivers,
    order,
    raceControl: buildRaceControl(raw),
    teamRadio: buildTeamRadio(raw, driverList, session),
    battles,
    lapHistory: derived.lapHistory,
    gapHistory: derived.gapHistory,
    pitStops: derived.pitStops,
  };
}

/**
 * Number of drivers advancing from the current qualifying segment.
 * TimingData.NoEntries is [Q1size, Q2size, Q3size]; advancing from segment `part`
 * is the size of the next segment. null outside quali or in the final segment.
 */
function computeQualifyingCutoff(
  session: SessionInfo,
  timingData: Any,
): number | null {
  if (session.type !== "Qualifying" && session.type !== "Sprint") return null;
  const part = session.part;
  if (part === null || part < 1) return null;
  const noEntries = timingData.NoEntries;
  const list = Array.isArray(noEntries)
    ? noEntries.map((n) => parseNumber(n))
    : Object.entries(obj(noEntries))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, v]) => parseNumber(v));
  // Advancing count = size of the next segment (index = part, since part is 1-based).
  const next = list[part];
  return next && next > 0 ? next : null;
}

/** Gap string: race uses GapToLeader; quali uses Stats[part].TimeDiffToFastest. */
function gapString(t: Any): string {
  const g = str(t.GapToLeader);
  if (g) return g;
  return quali(t, "TimeDiffToFastest");
}

/** Read the deepest non-empty quali Stats value for a field across segments. */
function quali(t: Any, field: string): string {
  const stats = Array.isArray(t.Stats) ? t.Stats : [];
  for (let i = stats.length - 1; i >= 0; i--) {
    const v = str(obj(stats[i])[field]);
    if (v) return v;
  }
  return "";
}

function computeBattles(drivers: Record<string, DriverState>, order: string[]): Battle[] {
  const battles: Battle[] = [];
  for (let i = 1; i < order.length; i++) {
    const chaserNum = order[i]!;
    const leaderNum = order[i - 1]!;
    const chaser = drivers[chaserNum]!;
    if (chaser.intervalMs !== null && chaser.intervalMs > 0 && chaser.intervalMs < 1000) {
      battles.push({
        chaser: chaserNum,
        leader: leaderNum,
        gapMs: chaser.intervalMs,
        drs: chaser.carData?.drs ?? false,
      });
    }
  }
  return battles;
}

/** CarData batches: take the Cars map from the most recent entry. */
function latestCarCars(carData: Any): Any {
  const entries = Array.isArray(carData.Entries) ? carData.Entries : [];
  const last = entries[entries.length - 1];
  return last ? obj(obj(last).Cars) : {};
}

/** Position batches: take the Entries map from the most recent sample. */
function latestPositionEntries(position: unknown): Any {
  const p = obj(position);
  const arr = Array.isArray(p.Position) ? p.Position : [];
  const last = arr[arr.length - 1];
  return last ? obj(obj(last).Entries) : {};
}
