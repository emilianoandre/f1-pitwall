// Next.js's instrumentation hook — called once per server instance boot.
// Loads the New Relic agent for the Node runtime only: this file also runs
// for the Edge runtime bootstrap (which middleware.ts uses), and importing
// the Node-only `newrelic` package there would break it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("newrelic");
  }
}

// Catches errors Next's own App Router error boundaries intercept before
// they'd otherwise reach the agent's default instrumentation.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const newrelic = (await import("newrelic")).default;
    newrelic.noticeError(err instanceof Error ? err : new Error(String(err)), request);
  }
}
