import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "f1-ingest" },
});

/** Counts messages per topic for periodic rate logging. */
export class TopicCounter {
  private counts = new Map<string, number>();

  bump(topic: string): void {
    this.counts.set(topic, (this.counts.get(topic) ?? 0) + 1);
  }

  /** Return counts and reset the window. */
  drain(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.counts) out[k] = v;
    this.counts.clear();
    return out;
  }
}
