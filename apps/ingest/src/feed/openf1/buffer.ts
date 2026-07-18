/**
 * Coalesces a high-rate per-driver MQTT stream (OpenF1 pushes one message per
 * driver per sample, ~3.7Hz/car) down to one combined snapshot per flush.
 * Without this, every single message would grow the underlying raw-store
 * array by one entry — ~20x-70x faster than F1's own feed ever does, which
 * risks unbounded memory growth over a session.
 */
export class LatestByDriverBuffer<T> {
  private latest = new Map<string, T>();
  private dirty = false;

  set(driverNumber: string, record: T): void {
    this.latest.set(driverNumber, record);
    this.dirty = true;
  }

  /** Returns the accumulated per-driver map and clears the dirty flag, or null if nothing changed. */
  flushIfDirty(): Record<string, T> | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return Object.fromEntries(this.latest);
  }
}
