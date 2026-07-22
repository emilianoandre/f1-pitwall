import { init, type LDClient } from "@launchdarkly/node-server-sdk";
import type { DataSource } from "@f1-dash/types";
import { logger } from "./logger.js";

let client: LDClient | null = null;

/**
 * Start the LaunchDarkly client (singleton per process) and wait for it to
 * initialize. No-ops if LAUNCHDARKLY_SDK_KEY isn't set, so the server still
 * runs fine without it -- flags just aren't evaluable.
 */
export async function initLaunchDarkly(): Promise<void> {
  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  if (!sdkKey) {
    logger.info("LAUNCHDARKLY_SDK_KEY not set — skipping LaunchDarkly init");
    return;
  }
  client = init(sdkKey);
  try {
    await client.waitForInitialization({ timeout: 5 });
    logger.info("LaunchDarkly client initialized");
  } catch (err) {
    logger.error({ err: (err as Error).message }, "LaunchDarkly init failed");
  }
}

/** The singleton LDClient, or null if it was never started (no SDK key). */
export function getLaunchDarklyClient(): LDClient | null {
  return client;
}

// No per-user targeting makes sense for an ingest-process-level flag like this.
const SERVICE_CONTEXT = { kind: "service" as const, key: "f1-ingest" };

/**
 * The "data-source-flag" flag's variation *values* in LaunchDarkly are
 * currently the untouched defaults ("variation 1"/"variation 2"/"variation 3")
 * rather than the "f1"/"openf1"/"mix" display names — that's a dashboard
 * fix (Variations tab) still worth making, but this normalizes both forms so
 * behavior is correct either way in the meantime.
 */
export function normalizeDataSource(raw: string): DataSource {
  switch (raw) {
    case "f1":
    case "variation 1":
      return "f1";
    case "openf1":
    case "variation 2":
      return "openf1";
    default:
      return "mix";
  }
}

/**
 * "data-source-flag": which live source to use.
 * - "f1": F1's own SignalR feed only, no OpenF1 involvement at all (see mode.ts).
 * - "openf1": source everything live from OpenF1 instead (see feed/openf1/fullClient.ts).
 * - "mix": today's default — F1's feed plus the OpenF1 CarData/Position supplement.
 * Defaults to "mix" if LaunchDarkly isn't configured or the flag can't be read.
 */
export async function getDataSourceFlag(): Promise<DataSource> {
  if (!client) return "mix";
  try {
    const raw = await client.stringVariation("data-source-flag", SERVICE_CONTEXT, "mix");
    return normalizeDataSource(raw);
  } catch {
    return "mix";
  }
}
