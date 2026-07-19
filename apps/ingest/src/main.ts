// Ingest entry point. Serves a single SSE stream whose source can switch between
// the live F1 feed and a seekable recording player at runtime (POST /api/mode).
//   pnpm --filter @f1-dash/ingest dev                 (starts in player mode)
//   pnpm --filter @f1-dash/ingest dev -- --live       (starts connected to the feed)
//   pnpm --filter @f1-dash/ingest dev -- --load <id>  (auto-load a recording)
//
// Env: PORT, ALLOWED_ORIGIN, DATA_DIR, LOG_LEVEL, F1_USERNAME, F1_PASSWORD,
// F1_ENTITLEMENT_TOKEN, OPENF1_USERNAME, OPENF1_PASSWORD, INGEST_SHARED_SECRET,
// LAUNCHDARKLY_SDK_KEY.
// F1_USERNAME/F1_PASSWORD are only needed for live mode (see feed/auth.ts) —
// F1 requires an F1TV login to access the live timing feed.
// F1_ENTITLEMENT_TOKEN is optional — a separate, manually-captured cookie
// (see feed/auth.ts) that a real browser sends alongside its login; a leading
// candidate for what actually gates CarData/Position on this feed, since a
// verified real session with it does get them and ours (without it) doesn't.
// OPENF1_USERNAME/OPENF1_PASSWORD are optional and only used in live mode (see
// feed/openf1/auth.ts) — they supplement the feed above with CarData/Position,
// which F1's own feed doesn't grant on this account. Requires a paid OpenF1
// account; live mode works fine without them, just without that data.
// INGEST_SHARED_SECRET, if set, must match the web app's proxy on every request
// except /api/health — see server.ts.

import type { IngestMode } from "@f1-dash/types";
import { ModeController } from "./mode.js";
import { RecordingRegistry } from "./player/registry.js";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";
import { initLaunchDarkly } from "./launchdarkly.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const port = Number(process.env.PORT ?? 4000);
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";
const dataDir = process.env.DATA_DIR ?? "data/recordings";
const internalToken = process.env.INGEST_SHARED_SECRET;
const initialMode: IngestMode = flag("live") ? "live" : "player";

const controller = new ModeController(initialMode, (m) => logger.info(m));
const registry = new RecordingRegistry(dataDir);

// Optional startup auto-load of a recording (implies player mode).
const loadId = arg("load");
const loadFile = arg("replay");
if (loadId && registry.isDownloaded(loadId)) {
  await controller.player.load(registry.fileFor(loadId), loadId, loadId);
  controller.ensurePlayerMode();
  logger.info({ loadId }, "auto-loaded recording");
} else if (loadFile) {
  await controller.player.load(loadFile, "adhoc", loadFile);
  controller.ensurePlayerMode();
  logger.info({ loadFile }, "auto-loaded file");
}

await initLaunchDarkly();

const app = buildServer({
  stateSource: controller.source,
  getMode: () => controller.mode,
  setMode: (m) => controller.setMode(m),
  isConnected: () => controller.connected,
  isOpenf1Connected: () => controller.openf1Connected,
  lastMessageAgeMs: () => controller.lastMessageAgeMs(),
  allowedOrigin,
  internalToken,
  log: (m) => logger.debug(m),
  player: controller.player,
  registry,
});

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => logger.info({ port, mode: controller.mode, allowedOrigin }, "SSE server listening"))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, "server failed to start");
    process.exit(1);
  });

const shutdown = async () => {
  logger.info("shutting down");
  controller.setMode("player"); // stops the live feed if running
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
