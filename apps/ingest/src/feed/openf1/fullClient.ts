import mqtt from "mqtt";
import { getOpenf1Token } from "./auth.js";
import { fetchOpenf1SessionInfo } from "./session.js";
import { LatestByDriverBuffer } from "./buffer.js";
import { Openf1TopicWriter } from "./writer.js";
import {
  carDataChannels,
  positionEntry,
  driverPatch,
  lapPatch,
  raceControlEntry,
  raceControlToTrackStatusCode,
  weatherPatch,
  pitTimesPatch,
  intervalPatch,
  stintPatch,
  teamRadioEntry,
} from "./map.js";
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
import type { FeedCallbacks, FeedHandle } from "../source.js";
import type { Openf1FeedHandle } from "./client.js";

// Same broker as the supplement client — see client.ts for why plain MQTTS.
const BROKER_URL = "mqtts://mqtt.openf1.org:8883";
const TOPICS = {
  carData: "v1/car_data",
  location: "v1/location",
  drivers: "v1/drivers",
  laps: "v1/laps",
  raceControl: "v1/race_control",
  weather: "v1/weather",
  pit: "v1/pit",
  intervals: "v1/intervals",
  stints: "v1/stints",
  teamRadio: "v1/team_radio",
} as const;

interface Openf1FullOptions {
  /** How often to coalesce buffered per-driver car_data/location samples (default 1000ms). */
  flushMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  log?: (msg: string) => void;
  onConnected?: (connected: boolean) => void;
}

/**
 * The "data-source-flag" flag's "openf1" value: source everything live from
 * OpenF1 instead of F1's own SignalR feed. Unlike the supplement client (client.ts),
 * this is the *only* source in this mode — nothing else populates the raw
 * store, so every topic needs a first message here, including a one-time
 * SessionInfo bootstrap (OpenF1 doesn't stream that, only REST).
 *
 * Known gaps vs the direct F1 feed (no OpenF1 source exists for these):
 * qualifyingCutoff (NoEntries), clock.totalLaps, retired/stopped/knockedOut,
 * and TrackStatus/session.part are best-effort derivations from race_control
 * rather than direct fields — see raceControlToTrackStatusCode() in map.ts.
 */
export function connectOpenf1Full(
  cb: Pick<FeedCallbacks, "onMessage">,
  opts: Openf1FullOptions = {},
): Openf1FeedHandle {
  const flushMs = opts.flushMs ?? 1000;
  const base = opts.baseBackoffMs ?? 1000;
  const max = opts.maxBackoffMs ?? 30000;
  const log = opts.log ?? (() => {});
  const onConnected = opts.onConnected ?? (() => {});

  const carBuffer = new LatestByDriverBuffer<ReturnType<typeof carDataChannels>>();
  const posBuffer = new LatestByDriverBuffer<ReturnType<typeof positionEntry>>();
  const carWriter = new Openf1TopicWriter("Entries");
  const posWriter = new Openf1TopicWriter("Position");
  const raceControlWriter = new Openf1TopicWriter("Messages");
  const teamRadioWriter = new Openf1TopicWriter("Captures");
  let maxLapSeen = 0;

  let closed = false;
  let attempt = 0;
  let client: mqtt.MqttClient | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let disconnectHandled = false;

  const cleanup = () => {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    if (client) {
      const c = client;
      client = null;
      c.removeAllListeners();
      try {
        c.end(true);
      } catch {
        /* already closing */
      }
    }
  };

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    const backoff = Math.min(max, base * 2 ** (attempt - 1));
    const jitter = backoff * 0.25 * pseudoJitter(attempt);
    const delay = Math.round(backoff + jitter);
    log(`openf1-full: reconnecting in ${delay}ms (attempt ${attempt})`);
    retryTimer = setTimeout(run, delay);
  };

  const handleDisconnect = () => {
    if (disconnectHandled) return;
    disconnectHandled = true;
    onConnected(false);
    cleanup();
    scheduleRetry();
  };

  const flush = () => {
    const cars = carBuffer.flushIfDirty();
    if (cars) {
      const utc = new Date().toISOString();
      cb.onMessage("CarData", carWriter.nextPatch({ Utc: utc, Cars: cars }), utc);
    }
    const positions = posBuffer.flushIfDirty();
    if (positions) {
      const ts = new Date().toISOString();
      cb.onMessage("Position", posWriter.nextPatch({ Timestamp: ts, Entries: positions }), ts);
    }
  };

  const handleMessage = (topic: string, payload: Uint8Array) => {
    let record: unknown;
    try {
      record = JSON.parse(payload.toString());
    } catch {
      return; // malformed message — drop it rather than crash
    }
    if (typeof record !== "object" || record === null) return;
    const r = record as Record<string, unknown>;
    const driverNumber = r.driver_number;
    const now = new Date().toISOString();

    switch (topic) {
      case TOPICS.carData: {
        if (typeof driverNumber !== "number") return;
        carBuffer.set(String(driverNumber), carDataChannels(r as unknown as Openf1CarData));
        return;
      }
      case TOPICS.location: {
        if (typeof driverNumber !== "number") return;
        posBuffer.set(String(driverNumber), positionEntry(r as unknown as Openf1Location));
        return;
      }
      case TOPICS.drivers: {
        if (typeof driverNumber !== "number") return;
        cb.onMessage(
          "DriverList",
          { [String(driverNumber)]: driverPatch(r as unknown as Openf1Driver) },
          now,
        );
        return;
      }
      case TOPICS.laps: {
        if (typeof driverNumber !== "number") return;
        const lap = r as unknown as Openf1Lap;
        cb.onMessage("TimingData", { Lines: { [String(driverNumber)]: lapPatch(lap) } }, now);
        if (lap.lap_number > maxLapSeen) {
          maxLapSeen = lap.lap_number;
          cb.onMessage("LapCount", { CurrentLap: maxLapSeen }, now);
        }
        return;
      }
      case TOPICS.raceControl: {
        const rc = r as unknown as Openf1RaceControl;
        cb.onMessage("RaceControlMessages", raceControlWriter.nextPatch(raceControlEntry(rc)), now);
        if (rc.qualifying_phase !== null && rc.qualifying_phase !== undefined) {
          cb.onMessage("TimingData", { SessionPart: rc.qualifying_phase }, now);
        }
        const statusCode = raceControlToTrackStatusCode(rc);
        if (statusCode !== null) {
          cb.onMessage("TrackStatus", { Status: statusCode }, now);
        }
        return;
      }
      case TOPICS.weather: {
        cb.onMessage("WeatherData", weatherPatch(r as unknown as Openf1Weather), now);
        return;
      }
      case TOPICS.pit: {
        if (typeof driverNumber !== "number") return;
        const pit = r as unknown as Openf1Pit;
        cb.onMessage(
          "PitLaneTimeCollection",
          { PitTimes: { [String(driverNumber)]: pitTimesPatch(pit) } },
          now,
        );
        return;
      }
      case TOPICS.intervals: {
        if (typeof driverNumber !== "number") return;
        const interval = r as unknown as Openf1Interval;
        cb.onMessage("TimingData", { Lines: { [String(driverNumber)]: intervalPatch(interval) } }, now);
        return;
      }
      case TOPICS.stints: {
        if (typeof driverNumber !== "number") return;
        const { key, value } = stintPatch(r as unknown as Openf1Stint);
        cb.onMessage(
          "TimingAppData",
          { Lines: { [String(driverNumber)]: { Stints: { [key]: value } } } },
          now,
        );
        return;
      }
      case TOPICS.teamRadio: {
        cb.onMessage(
          "TeamRadio",
          teamRadioWriter.nextPatch(teamRadioEntry(r as unknown as Openf1TeamRadio)),
          now,
        );
        return;
      }
      default:
        return;
    }
  };

  const bootstrapSessionInfo = (token: string) => {
    fetchOpenf1SessionInfo(token)
      .then((info) => {
        if (closed || !info) return;
        cb.onMessage("SessionInfo", info, new Date().toISOString());
      })
      .catch((err: Error) => log(`openf1-full: session bootstrap failed: ${err.message}`));
  };

  const run = async () => {
    if (closed) return;
    disconnectHandled = false;

    let token: string;
    try {
      token = await getOpenf1Token();
    } catch (err) {
      log(`openf1-full: auth error: ${(err as Error).message}`);
      scheduleRetry();
      return;
    }
    if (closed) return;

    const c = mqtt.connect(BROKER_URL, {
      username: process.env.OPENF1_USERNAME,
      password: token,
      reconnectPeriod: 0, // we own reconnect, so a fresh token is fetched every time
      connectTimeout: 15_000,
    });
    client = c;

    c.on("connect", () => {
      attempt = 0;
      log("openf1-full: connected");
      onConnected(true);
      c.subscribe(Object.values(TOPICS), (err) => {
        if (err) log(`openf1-full: subscribe error: ${err.message}`);
      });
      flushTimer = setInterval(flush, flushMs);
      bootstrapSessionInfo(token);
    });

    c.on("message", handleMessage);
    c.on("close", handleDisconnect);
    c.on("error", (err: Error) => {
      log(`openf1-full: connection error: ${err.message}`);
      handleDisconnect();
    });
  };

  void run();

  return {
    resetOnSnapshot() {
      // No-op: OpenF1 is the only source in full-switch mode, so nothing ever
      // replaces the raw store out from under these writers (unlike the
      // supplement client, which resets after a SignalR resnapshot).
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanup();
    },
  } satisfies FeedHandle & { resetOnSnapshot(): void };
}

// Deterministic jitter (matches feed/live.ts's own reconnect backoff).
function pseudoJitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
