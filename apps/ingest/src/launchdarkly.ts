import { init, type LDClient } from "@launchdarkly/node-server-sdk";
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
