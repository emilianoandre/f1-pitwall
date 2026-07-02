// The deep-merge engine — highest-risk component, kept dependency-free.
//
// The F1 feed sends deep partial patches. Rules:
//  - Objects merge recursively, key by key.
//  - Arrays are patched as objects with numeric-string keys: a patch
//    {"0": {...}, "2": {...}} against an array merges into indices 0 and 2
//    (growing the array if needed). A patch that is itself an array replaces.
//  - Scalars/null replace.
//  - A "_deleted" key (array of keys) removes those keys from the target object.

type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Deep-merge `patch` into `target`, returning the merged value.
 * Mutates and returns `target` where possible for efficiency; callers that need
 * immutability should clone first.
 */
export function deepMerge(target: unknown, patch: unknown): unknown {
  // Array target patched by a numeric-keyed object → per-index merge.
  if (Array.isArray(target) && isPlainObject(patch)) {
    applyDeletions(patch, (key) => {
      const idx = Number(key);
      if (Number.isInteger(idx) && idx >= 0 && idx < target.length) {
        target.splice(idx, 1);
      }
    });
    for (const [key, value] of Object.entries(patch)) {
      if (key === "_deleted") continue;
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0) continue;
      target[idx] = deepMerge(target[idx], value);
    }
    return target;
  }

  // Object target.
  if (isPlainObject(target)) {
    // Patch is an array → replace wholesale (shape changed).
    if (Array.isArray(patch)) return patch;

    if (isPlainObject(patch)) {
      applyDeletions(patch, (key) => {
        delete target[key];
      });
      for (const [key, value] of Object.entries(patch)) {
        if (key === "_deleted") continue;
        target[key] = deepMerge(target[key], value);
      }
      return target;
    }

    // Patch is a scalar/null → replace.
    return patch;
  }

  // Target is undefined and patch is an object → build a fresh object.
  // We deliberately do NOT arrayify numeric-keyed patches here: the only
  // reliable signal that a collection is an array is the snapshot seeding it as
  // one (which then hits the array branch above). Driver-number-keyed maps like
  // TimingData.Lines are objects and must stay objects.
  if (target === undefined && isPlainObject(patch)) {
    const out: Obj = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === "_deleted") continue;
      out[key] = deepMerge(undefined, value);
    }
    return out;
  }

  // Scalar / mismatched → patch wins.
  return patch;
}

function applyDeletions(patch: Obj, remove: (key: string) => void): void {
  const deleted = patch["_deleted"];
  if (Array.isArray(deleted)) {
    for (const key of deleted) {
      if (typeof key === "string" || typeof key === "number") remove(String(key));
    }
  }
}
