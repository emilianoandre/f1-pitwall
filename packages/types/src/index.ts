// Shared types for the F1 live dashboard. Zero runtime code.
// Driver keys are always the racing number as a string, e.g. "1", "44".

export type SessionType = "Practice" | "Qualifying" | "Sprint" | "Race" | "Unknown";

export type TrackStatus =
  | "AllClear"
  | "Yellow"
  | "SCDeployed"
  | "VSC"
  | "VSCEnding"
  | "Red"
  | "Unknown";

export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

/** Coloring flags for a timing value (lap or sector). */
export interface TimedValue {
  /** Raw display string from the feed, e.g. "1:23.456" or "" when unset. */
  value: string;
  /** Milliseconds, or null when unparseable/empty. */
  ms: number | null;
  personalBest: boolean;
  overallBest: boolean;
}

/** Mini-sector segment status (the little dots under each sector). */
export type SegmentStatus = "none" | "yellow" | "green" | "purple" | "pit" | "stopped";

export interface Sector {
  value: string;
  ms: number | null;
  personalBest: boolean;
  overallBest: boolean;
  segments: SegmentStatus[];
}

export interface Stint {
  compound: Compound;
  /** true if the tyre was new at the start of the stint. */
  isNew: boolean;
  /** Tyre age in laps (total laps on this set). */
  age: number;
  startLaps: number;
}

export interface DriverState {
  racingNumber: string;
  tla: string;
  fullName: string;
  teamName: string;
  /** Hex without leading '#', e.g. "3671C6". */
  teamColour: string;
  headshotUrl?: string;
  /** Tower position (1-based). Falls back to classification order. */
  line: number;
  position: number;

  gapToLeader: string;
  gapToLeaderMs: number | null;
  lapped: boolean;
  interval: string;
  intervalMs: number | null;

  lastLap: TimedValue;
  bestLap: TimedValue;
  sectors: [Sector, Sector, Sector];

  numberOfLaps: number;
  stints: Stint[];
  currentCompound: Compound;
  tyreAge: number;

  inPit: boolean;
  pitOut: boolean;
  numberOfPitStops: number;
  retired: boolean;
  stopped: boolean;
  knockedOut: boolean;

  carData?: CarData;
  trackPosition?: TrackPosition;
}

export interface CarData {
  rpm: number;
  /** Speed in km/h. */
  speed: number;
  gear: number;
  /** Throttle 0-100. */
  throttle: number;
  /** Brake 0-100 (feed is often 0/100). */
  brake: number;
  drs: boolean;
  utc: string;
}

export interface TrackPosition {
  x: number;
  y: number;
  z: number;
  /** e.g. "OnTrack", "OffTrack". */
  status: string;
}

export interface Weather {
  airTemp: number;
  trackTemp: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  rainfall: boolean;
}

export interface RaceControlMessage {
  utc: string;
  category: string;
  message: string;
  flag?: string;
  scope?: string;
  sector?: number;
  lap?: number;
}

export interface TeamRadioClip {
  utc: string;
  racingNumber: string;
  tla: string;
  teamName: string;
  /** Hex without leading '#'. */
  teamColour: string;
  /** Absolute URL to the mp3 clip. */
  audioUrl: string;
}

export interface SessionInfo {
  type: SessionType;
  /** Full session name, e.g. "Practice 1", "Qualifying", "Race". */
  name: string;
  meetingName: string;
  officialName: string;
  circuitKey: number | null;
  circuitName: string;
  countryName: string;
  startDate: string;
  /** Static-archive path, e.g. "2024/2024-03-02_Bahrain_Grand_Prix/...". */
  path: string;
  started: boolean;
  /** Qualifying/sprint-shootout segment: 1=Q1, 2=Q2, 3=Q3. */
  part: number | null;
}

export interface SessionClock {
  /** Remaining time string "HH:MM:SS". */
  remaining: string;
  extrapolating: boolean;
  /** UTC at which `remaining` was sampled — used for client extrapolation. */
  utc: string;
  currentLap: number | null;
  totalLaps: number | null;
}

export interface Battle {
  /** racing number of the car behind. */
  chaser: string;
  /** racing number of the car ahead. */
  leader: string;
  gapMs: number;
  drs: boolean;
}

export interface LapHistoryPoint {
  lap: number;
  timeMs: number;
  compound: Compound;
}

export interface GapHistoryPoint {
  lap: number;
  gapMs: number;
  lapped: boolean;
}

/** One completed pit stop (pit-lane time, not stationary time). */
export interface PitStop {
  racingNumber: string;
  lap: number;
  /** Total pit-lane duration in seconds. */
  durationS: number;
}

export interface SessionState {
  session: SessionInfo;
  clock: SessionClock;
  /**
   * Qualifying only: number of drivers who advance from the current segment.
   * Drivers with position > this are in the elimination (drop) zone. null when
   * not qualifying or in the final segment.
   */
  qualifyingCutoff: number | null;
  trackStatus: TrackStatus;
  weather: Weather;
  drivers: Record<string, DriverState>;
  /** Driver racing numbers in current classification order. */
  order: string[];
  raceControl: RaceControlMessage[];
  teamRadio: TeamRadioClip[];
  battles: Battle[];
  lapHistory: Record<string, LapHistoryPoint[]>;
  gapHistory: Record<string, GapHistoryPoint[]>;
  /** All completed pit stops, chronological. */
  pitStops: PitStop[];
}

// ---- Player (seekable replay) ----

export interface PlayerStatus {
  loaded: boolean;
  recordingId: string | null;
  recordingName: string | null;
  /** Timeline bounds + playhead, in ms on the recording's synthetic clock. */
  startMs: number;
  endMs: number;
  playheadMs: number;
  playing: boolean;
  speed: number;
}

export interface RecordingEntry {
  id: string;
  name: string;
  downloaded: boolean;
  /** Archive path, present for entries that can be downloaded. */
  path?: string;
  year?: number;
  sizeBytes?: number;
}

export interface DownloadStatus {
  id: string;
  status: "downloading" | "done" | "error";
  progress: { topicsDone: number; topicsTotal: number; currentTopic: string };
  error?: string;
}

// ---- SSE wire protocol ----

export interface SnapshotEvent {
  type: "snapshot";
  ts: number;
  state: SessionState;
  /** Present when the server is in player mode. */
  player?: PlayerStatus | null;
  mode: IngestMode;
  /** True when the live feed's own upstream connection (to F1) is up; always true in player mode. */
  connected: boolean;
}

export interface UpdateEvent {
  type: "update";
  ts: number;
  state: SessionState;
  player?: PlayerStatus | null;
  mode: IngestMode;
  connected: boolean;
}

/** Sent when player/mode status changes but the session state hasn't (e.g. pause). */
export interface PlayerEvent {
  type: "player";
  ts: number;
  player: PlayerStatus | null;
  mode: IngestMode;
  connected: boolean;
}

export type SseEvent = SnapshotEvent | UpdateEvent | PlayerEvent;

export type IngestMode = "live" | "player";

export interface HealthResponse {
  ok: boolean;
  source: "live" | "replay";
  mode: IngestMode;
  connected: boolean;
  lastMessageAgeMs: number | null;
}
