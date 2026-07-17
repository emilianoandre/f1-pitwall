import { EventEmitter } from "node:events";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type {
  HealthResponse,
  SseEvent,
  SessionState,
  IngestMode,
  PlayerStatus,
} from "@f1-dash/types";
import type { Player } from "./player/player.js";
import type { RecordingRegistry } from "./player/registry.js";

/** Anything that can produce SessionState and notify on change (engine or player). */
export interface StateSource extends EventEmitter {
  getState(): SessionState;
  hasData(): boolean;
}

interface ServerOptions {
  stateSource: StateSource;
  getMode: () => IngestMode;
  setMode: (mode: IngestMode) => void;
  isConnected: () => boolean;
  lastMessageAgeMs: () => number | null;
  allowedOrigin: string;
  throttleMs?: number;
  log?: (msg: string) => void;
  player: Player;
  registry: RecordingRegistry;
  /** If set, every request except /api/health must carry this in x-internal-token. */
  internalToken?: string;
}

const IMMEDIATE_TOPICS = new Set(["TrackStatus", "RaceControlMessages"]);

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const throttleMs = opts.throttleMs ?? 100;
  const log = opts.log ?? (() => {});

  void app.register(cors, { origin: opts.allowedOrigin });

  // The app's web frontend is the only intended caller (via its /api/ingest
  // proxy, itself behind a login) — this stops the ingest's own public URL
  // from being a way to bypass that login. /api/health stays open for the
  // platform's own health checks, which don't send custom headers.
  if (opts.internalToken) {
    const token = opts.internalToken;
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/api/health")) return;
      if (req.headers["x-internal-token"] !== token) {
        return reply.status(401).send({ error: "unauthorized" });
      }
    });
  }

  // Player status only makes sense in player mode.
  const playerStatus = (): PlayerStatus | null =>
    opts.getMode() === "player" ? opts.player.status() : null;

  app.get("/api/health", async (): Promise<HealthResponse> => ({
    ok: true,
    source: opts.getMode() === "live" ? "live" : "replay",
    mode: opts.getMode(),
    connected: opts.isConnected(),
    lastMessageAgeMs: opts.lastMessageAgeMs(),
  }));

  app.post("/api/mode", async (req, reply) => {
    const { mode } = (req.body ?? {}) as { mode?: string };
    if (mode !== "live" && mode !== "player") {
      return reply.status(400).send({ error: "mode must be 'live' or 'player'" });
    }
    opts.setMode(mode);
    return { mode: opts.getMode(), connected: opts.isConnected() };
  });

  app.get("/api/sse", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": opts.allowedOrigin,
    });

    const send = (event: SseEvent) =>
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

    const emitState = (type: "snapshot" | "update") => {
      if (opts.stateSource.hasData()) {
        send({ type, ts: Date.now(), state: opts.stateSource.getState(), player: playerStatus(), mode: opts.getMode() });
      } else {
        send({ type: "player", ts: Date.now(), player: playerStatus(), mode: opts.getMode() });
      }
    };

    emitState("snapshot");

    let dirty = false;
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      emitState("update");
    };

    const onChanged = (topic?: string) => {
      dirty = true;
      if (topic && IMMEDIATE_TOPICS.has(topic)) flush();
    };
    opts.stateSource.on("changed", onChanged);

    const interval = setInterval(flush, throttleMs);
    const heartbeat = setInterval(() => reply.raw.write(`: hb\n\n`), 15_000);

    req.raw.on("close", () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      opts.stateSource.off("changed", onChanged);
      log("sse: client disconnected");
    });
  });

  // ---- Player control API ----
  {
    const player = opts.player;
    const registry = opts.registry;

    app.get("/api/recordings", async (req) => {
      const year = Number((req.query as { year?: string }).year) || new Date().getFullYear();
      try {
        return { recordings: await registry.list(year), year };
      } catch (err) {
        return { recordings: registry.listDownloaded(), year, error: (err as Error).message };
      }
    });

    app.post("/api/recordings/download", async (req, reply) => {
      const { path } = (req.body ?? {}) as { path?: string };
      if (!path) return reply.status(400).send({ error: "path required" });
      return registry.startDownload(path);
    });

    app.get("/api/download/:id", async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = registry.getJob(id);
      if (!job) {
        return registry.isDownloaded(id)
          ? { id, status: "done", progress: { topicsDone: 1, topicsTotal: 1, currentTopic: "done" } }
          : reply.status(404).send({ error: "no such download" });
      }
      return job;
    });

    app.post("/api/player/load", async (req, reply) => {
      const { id } = (req.body ?? {}) as { id?: string };
      if (!id) return reply.status(400).send({ error: "id required" });
      if (!registry.isDownloaded(id)) {
        return reply.status(409).send({ error: "not downloaded", id });
      }
      const entries = await registry.list(new Date().getFullYear()).catch(() => []);
      const name = entries.find((e) => e.id === id)?.name ?? id;
      await player.load(registry.fileFor(id), id, name);
      opts.setMode("player"); // loading a recording implies replay mode
      log(`player: loaded ${id}`);
      return player.status();
    });

    app.post("/api/player/control", async (req, reply) => {
      const body = (req.body ?? {}) as {
        action?: string;
        valueMs?: number;
        fraction?: number;
        speed?: number;
      };
      switch (body.action) {
        case "play":
          player.play();
          break;
        case "pause":
          player.pause();
          break;
        case "seek":
          if (typeof body.fraction === "number") player.seekFraction(body.fraction);
          else if (typeof body.valueMs === "number") player.seek(body.valueMs);
          break;
        case "speed":
          if (typeof body.speed === "number") player.setSpeed(body.speed);
          break;
        default:
          return reply.status(400).send({ error: "unknown action" });
      }
      return player.status();
    });
  }

  return app;
}
