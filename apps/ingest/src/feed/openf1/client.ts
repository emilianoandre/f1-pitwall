import mqtt from "mqtt";
import { getOpenf1Token } from "./auth.js";
import { LatestByDriverBuffer } from "./buffer.js";
import { Openf1TopicWriter } from "./writer.js";
import { carDataChannels, positionEntry } from "./map.js";
import type { Openf1CarData, Openf1Location } from "./types.js";
import type { FeedCallbacks, FeedHandle } from "../source.js";

// OpenF1's own docs recommend plain MQTTS (not the WS transport, which is for
// browser clients) for backend applications.
const BROKER_URL = "mqtts://mqtt.openf1.org:8883";
const CAR_DATA_TOPIC = "v1/car_data";
const LOCATION_TOPIC = "v1/location";

interface Openf1Options {
  /** How often to coalesce buffered per-driver samples into one store update (default 1000ms). */
  flushMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  log?: (msg: string) => void;
  onConnected?: (connected: boolean) => void;
}

export interface Openf1FeedHandle extends FeedHandle {
  /** Re-arm topic writers after a SignalR resnapshot wipes CarData/Position from the raw store. */
  resetOnSnapshot(): void;
}

/**
 * Connect to OpenF1's live MQTT broker and feed CarData/Position updates into
 * the same store a live SignalR connection would, via cb.onMessage — see
 * feed/openf1/writer.ts for why the patches are shaped the way they are.
 */
export function connectOpenf1Live(
  cb: Pick<FeedCallbacks, "onMessage">,
  opts: Openf1Options = {},
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
    log(`openf1: reconnecting in ${delay}ms (attempt ${attempt})`);
    retryTimer = setTimeout(run, delay);
  };

  // mqtt.js can emit both "error" and "close" for one disconnect — dedupe so
  // we don't double-schedule (and double-increment backoff) per failure.
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

  const run = async () => {
    if (closed) return;
    disconnectHandled = false;

    let token: string;
    try {
      token = await getOpenf1Token();
    } catch (err) {
      log(`openf1: auth error: ${(err as Error).message}`);
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
      log("openf1: connected");
      onConnected(true);
      c.subscribe([CAR_DATA_TOPIC, LOCATION_TOPIC], (err) => {
        if (err) log(`openf1: subscribe error: ${err.message}`);
      });
      flushTimer = setInterval(flush, flushMs);
    });

    c.on("message", (topic: string, payload: Uint8Array) => {
      let record: unknown;
      try {
        record = JSON.parse(payload.toString());
      } catch {
        return; // malformed message — drop it rather than crash
      }
      if (topic === CAR_DATA_TOPIC) {
        const r = record as Partial<Openf1CarData>;
        if (typeof r.driver_number !== "number") return;
        carBuffer.set(String(r.driver_number), carDataChannels(r as Openf1CarData));
      } else if (topic === LOCATION_TOPIC) {
        const r = record as Partial<Openf1Location>;
        if (typeof r.driver_number !== "number") return;
        posBuffer.set(String(r.driver_number), positionEntry(r as Openf1Location));
      }
    });

    c.on("close", handleDisconnect);
    c.on("error", (err: Error) => {
      log(`openf1: connection error: ${err.message}`);
      handleDisconnect();
    });
  };

  void run();

  return {
    resetOnSnapshot() {
      carWriter.reset();
      posWriter.reset();
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanup();
    },
  };
}

// Deterministic jitter (matches feed/live.ts's own reconnect backoff).
function pseudoJitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
