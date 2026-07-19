// Wire shapes for OpenF1's MQTT topics — internal to this adapter, not part of
// our domain model (@f1-dash/types), since they describe OpenF1's schema.

export interface Openf1CarData {
  driver_number: number;
  rpm: number;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  /** F1's native channel-45 code (10/12/14 = open) — see state/parse.ts drsOpen(). */
  drs: number;
  date: string;
}

export interface Openf1Location {
  driver_number: number;
  x: number;
  y: number;
  z: number;
  date: string;
}

export interface Openf1Driver {
  driver_number: number;
  full_name?: string;
  name_acronym?: string;
  team_name?: string;
  team_colour?: string;
  headshot_url?: string;
}

export interface Openf1Lap {
  driver_number: number;
  lap_number: number;
  date_start?: string;
  duration_sector_1?: number;
  duration_sector_2?: number;
  duration_sector_3?: number;
  lap_duration?: number;
  is_pit_out_lap?: boolean;
}

export interface Openf1RaceControl {
  date: string;
  driver_number: number | null;
  lap_number: number | null;
  category: string | null;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  /** Current Q1/Q2/Q3 (or SQ1-3) segment — only present on some message categories. */
  qualifying_phase: number | null;
  message: string | null;
}

export interface Openf1Weather {
  date: string;
  air_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  track_temperature: number;
  wind_direction: number;
  wind_speed: number;
}

export interface Openf1Pit {
  driver_number: number;
  lap_number: number;
  date?: string;
  pit_duration?: number;
  lane_duration?: number;
}

export interface Openf1Interval {
  driver_number: number;
  gap_to_leader: string | number | null;
  interval: string | number | null;
  date: string;
}

export interface Openf1Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface Openf1TeamRadio {
  driver_number: number;
  date: string;
  recording_url: string;
}

/** Subset of /v1/sessions and /v1/meetings fields used for the one-time SessionInfo bootstrap. */
export interface Openf1Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  circuit_key: number | null;
  circuit_short_name: string;
  country_name: string;
}

export interface Openf1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
}
