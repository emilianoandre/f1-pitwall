// Next.js's instrumentation hook — called once per server instance boot.
// Loads the New Relic agent for the Node runtime only: this file also runs
// for the Edge runtime bootstrap (which middleware.ts uses), and importing
// the Node-only `newrelic` package there would break it.
//
// The agent hard-throws at import time ("must name this application") if
// NEW_RELIC_APP_NAME isn't set — guard on that so local dev (which has no
// New Relic config) boots fine, same as every other optional integration
// in this app (LaunchDarkly, OpenF1, etc. all no-op without their env vars).
function newRelicConfigured(): boolean {
  return Boolean(process.env.NEW_RELIC_APP_NAME && process.env.NEW_RELIC_LICENSE_KEY);
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && newRelicConfigured()) {
    await import("newrelic");
  }
}

// Catches errors Next's own App Router error boundaries intercept before
// they'd otherwise reach the agent's default instrumentation.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
) {
  if (process.env.NEXT_RUNTIME === "nodejs" && newRelicConfigured()) {
    const newrelic = (await import("newrelic")).default;
    newrelic.noticeError(err instanceof Error ? err : new Error(String(err)), request);
  }
}
