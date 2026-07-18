/**
 * Emits patches shaped exactly like F1's own CarData.z/Position.z topics, so
 * SessionStore's deepMerge (state/merge.ts) and transform.ts's
 * latestCarCars()/latestPositionEntries() need zero changes to consume them.
 *
 * deepMerge only grows an array via the numeric-key-patch convention when the
 * *target* is already a real array. Since F1 never sends these topics on this
 * account, the target starts undefined, so the first patch for a topic must
 * be a literal array (`{[arrayKey]: [entry]}`) to seed a real array; every
 * later patch can then use the index-patch shape (`{[arrayKey]: {"<n>": entry}}`).
 *
 * A SignalR reconnect sends a fresh snapshot that *replaces* the whole raw
 * store (SessionStore.applySnapshot) — since these topics aren't in the
 * grant, they simply vanish from it. If this writer kept counting from a
 * stale index afterward, its next patch would merge against an undefined
 * target again and build a plain object instead of an array. reset() must be
 * called whenever that happens.
 */
export class Openf1TopicWriter {
  private nextIndex = 0;

  constructor(private readonly arrayKey: string) {}

  nextPatch(entry: unknown): Record<string, unknown> {
    if (this.nextIndex === 0) {
      this.nextIndex = 1;
      return { [this.arrayKey]: [entry] };
    }
    const patch = { [this.arrayKey]: { [String(this.nextIndex)]: entry } };
    this.nextIndex += 1;
    return patch;
  }

  reset(): void {
    this.nextIndex = 0;
  }
}
