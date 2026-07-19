import type {
  Openf1CarData,
  Openf1Location,
  Openf1Driver,
  Openf1Lap,
  Openf1RaceControl,
  Openf1Weather,
  Openf1Pit,
  Openf1Interval,
  Openf1Stint,
  Openf1TeamRadio,
} from "./types.js";

/**
 * Map an OpenF1 car_data record to the same {Channels} shape F1's own
 * CarData.z carries, so transform.ts's carData() reads it unchanged.
 * Channel keys: 0=rpm, 2=speed, 3=gear, 4=throttle, 5=brake, 45=drs.
 */
export function carDataChannels(r: Openf1CarData): { Channels: Record<string, number> } {
  return {
    Channels: {
      "0": r.rpm,
      "2": r.speed,
      "3": r.n_gear,
      "4": r.throttle,
      "5": r.brake,
      "45": r.drs,
    },
  };
}

/**
 * Map an OpenF1 location record to the same {X,Y,Z,Status} shape F1's own
 * Position.z carries. OpenF1 has no status field; "OnTrack" matches
 * transform.ts's trackPosition() fallback for a missing Status.
 */
export function positionEntry(r: Openf1Location): { X: number; Y: number; Z: number; Status: string } {
  return { X: r.x, Y: r.y, Z: r.z, Status: "OnTrack" };
}

// ---- Full-switch mode (openf1-source flag) ----
// The mappers below translate the rest of OpenF1's live collections into the
// same raw shapes F1's own SignalR topics carry, so transform.ts needs no
// changes for full-switch mode either. See feed/openf1/fullClient.ts for how
// these plug into the raw store, and PROGRESS/plan notes for known gaps
// (qualifyingCutoff, TotalLaps, retired/stopped/knockedOut have no OpenF1
// source and stay unavailable in full-switch mode).

/** Format seconds (OpenF1's unit) as F1's own lap/sector time string ("1:11.383" or "23.456"). */
export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const msStr = String(ms).padStart(3, "0");
  const sStr = String(s).padStart(m > 0 ? 2 : 1, "0");
  return m > 0 ? `${m}:${sStr}.${msStr}` : `${sStr}.${msStr}`;
}

/** DriverList[num] fragment. Only fields OpenF1 actually sent are included, so partial records don't blank others out. */
export function driverPatch(r: Openf1Driver): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (r.name_acronym !== undefined) patch.Tla = r.name_acronym;
  if (r.full_name !== undefined) patch.FullName = r.full_name;
  if (r.team_name !== undefined) patch.TeamName = r.team_name;
  if (r.team_colour !== undefined) patch.TeamColour = r.team_colour;
  if (r.headshot_url !== undefined) patch.HeadshotUrl = r.headshot_url;
  return patch;
}

/** TimingData.Lines[num] fragment carrying lap/sector times, matching what transform.ts's timedValue()/sector() expect. */
export function lapPatch(r: Openf1Lap): Record<string, unknown> {
  const patch: Record<string, unknown> = { NumberOfLaps: r.lap_number };
  if (typeof r.lap_duration === "number") {
    patch.LastLapTime = { Value: formatLapTime(r.lap_duration) };
  }
  const { duration_sector_1: s1, duration_sector_2: s2, duration_sector_3: s3 } = r;
  if (typeof s1 === "number" || typeof s2 === "number" || typeof s3 === "number") {
    // transform.ts's sector() only accepts a literal 3-element array (no object-keyed
    // fallback), so this always sends all three even when only one changed.
    patch.Sectors = [
      { Value: typeof s1 === "number" ? formatLapTime(s1) : "" },
      { Value: typeof s2 === "number" ? formatLapTime(s2) : "" },
      { Value: typeof s3 === "number" ? formatLapTime(s3) : "" },
    ];
  }
  if (r.is_pit_out_lap) patch.PitOut = true;
  return patch;
}

/** RaceControlMessages.Messages[] entry, matching transform.ts's buildRaceControl() field reads. */
export function raceControlEntry(r: Openf1RaceControl): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    Utc: r.date,
    Category: r.category ?? "",
    Message: r.message ?? "",
  };
  if (r.flag !== null) entry.Flag = r.flag;
  if (r.scope !== null) entry.Scope = r.scope;
  if (r.sector !== null) entry.Sector = r.sector;
  if (r.lap_number !== null) entry.Lap = r.lap_number;
  return entry;
}

/**
 * Track-status numeric code matching state/parse.ts's trackStatus() codes
 * (1=AllClear, 2=Yellow, 4=SCDeployed, 5=Red, 6=VSC, 7=VSCEnding), derived
 * from a race_control message — OpenF1 has no dedicated track-status topic.
 * Returns null when the message doesn't signal a status change.
 */
export function raceControlToTrackStatusCode(r: Openf1RaceControl): number | null {
  if (r.category === "Flag" && r.scope === "Track") {
    switch ((r.flag ?? "").toUpperCase()) {
      case "GREEN":
      case "CLEAR":
        return 1;
      case "YELLOW":
      case "DOUBLE YELLOW":
        return 2;
      case "RED":
        return 5;
      default:
        return null;
    }
  }
  if (r.category === "SafetyCar") {
    const msg = (r.message ?? "").toUpperCase();
    if (msg.includes("VIRTUAL SAFETY CAR")) {
      if (msg.includes("ENDING")) return 7;
      if (msg.includes("DEPLOYED")) return 6;
      return null;
    }
    if (msg.includes("SAFETY CAR") && msg.includes("DEPLOYED")) return 4;
    // Real SC ending isn't a distinct code — it resolves via a later Flag/Track/GREEN message.
  }
  return null;
}

/** WeatherData replacement — this topic isn't nested, so the whole object is the patch. */
export function weatherPatch(r: Openf1Weather): Record<string, unknown> {
  return {
    AirTemp: r.air_temperature,
    Humidity: r.humidity,
    Pressure: r.pressure,
    Rainfall: r.rainfall,
    TrackTemp: r.track_temperature,
    WindDirection: r.wind_direction,
    WindSpeed: r.wind_speed,
  };
}

/** PitLaneTimeCollection.PitTimes[num] fragment, matching state/derived.ts's pit-stop parsing. */
export function pitTimesPatch(r: Openf1Pit): Record<string, unknown> {
  const duration = r.lane_duration ?? r.pit_duration;
  return {
    Lap: r.lap_number,
    Duration: typeof duration === "number" ? duration.toFixed(1) : "",
  };
}

function formatGapField(v: string | number | null): string | undefined {
  if (v === null) return undefined;
  if (typeof v === "number") return v === 0 ? "" : `+${v.toFixed(3)}`;
  return v; // already F1-shaped, e.g. "+1 LAP"
}

/** TimingData.Lines[num] fragment for gap-to-leader / interval-to-car-ahead. */
export function intervalPatch(r: Openf1Interval): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const gap = formatGapField(r.gap_to_leader);
  if (gap !== undefined) patch.GapToLeader = gap;
  const interval = formatGapField(r.interval);
  if (interval !== undefined) patch.IntervalToPositionAhead = { Value: interval };
  return patch;
}

/** TimingAppData.Lines[num].Stints[stint_number] fragment, matching state/transform.ts's stints(). */
export function stintPatch(r: Openf1Stint): { key: string; value: Record<string, unknown> } {
  return {
    key: String(r.stint_number),
    value: {
      Compound: (r.compound ?? "UNKNOWN").toUpperCase(),
      New: (r.tyre_age_at_start ?? 0) === 0,
      TotalLaps: r.lap_end - r.lap_start + 1,
      StartLaps: r.tyre_age_at_start ?? 0,
    },
  };
}

/** TeamRadio.Captures[] entry. recording_url is already absolute — see buildTeamRadio()'s http(s) passthrough. */
export function teamRadioEntry(r: Openf1TeamRadio): Record<string, unknown> {
  return {
    Utc: r.date,
    RacingNumber: String(r.driver_number),
    Path: r.recording_url,
  };
}
