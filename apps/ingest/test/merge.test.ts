import { describe, it, expect } from "vitest";
import { deepMerge } from "../src/state/merge.js";

describe("deepMerge", () => {
  it("merges nested objects key by key", () => {
    const t = { a: { x: 1, y: 2 }, b: 3 };
    deepMerge(t, { a: { y: 20, z: 30 } });
    expect(t).toEqual({ a: { x: 1, y: 20, z: 30 }, b: 3 });
  });

  it("patches an array via numeric-string-key object", () => {
    const t = { Sectors: [{ v: "a" }, { v: "b" }, { v: "c" }] };
    deepMerge(t, { Sectors: { "1": { v: "B" } } });
    expect(t.Sectors).toEqual([{ v: "a" }, { v: "B" }, { v: "c" }]);
  });

  it("grows an array when patch index exceeds length", () => {
    const t = { arr: [{ v: 0 }] as Array<{ v: number }> };
    deepMerge(t, { arr: { "2": { v: 2 } } });
    expect(t.arr[2]).toEqual({ v: 2 });
    expect(t.arr.length).toBe(3);
  });

  it("replaces when the patch is a real array", () => {
    const t = { Segments: [{ Status: 0 }, { Status: 0 }] };
    deepMerge(t, { Segments: [{ Status: 2051 }] });
    expect(t.Segments).toEqual([{ Status: 2051 }]);
  });

  it("replaces scalars", () => {
    const t = { Status: "1", Position: "3" };
    deepMerge(t, { Status: "2" });
    expect(t).toEqual({ Status: "2", Position: "3" });
  });

  it("replaces with null", () => {
    const t = { a: { b: 1 } };
    deepMerge(t, { a: null });
    expect(t).toEqual({ a: null });
  });

  it("merges onto undefined target by materializing an object", () => {
    const t: Record<string, unknown> = {};
    deepMerge(t, { Lines: { "44": { Position: "5" } } });
    expect(t).toEqual({ Lines: { "44": { Position: "5" } } });
  });

  it("keeps driver-number-keyed maps as objects (no sparse arrays)", () => {
    const t: Record<string, unknown> = { Lines: {} };
    deepMerge(t, { Lines: { "44": { Position: "5" }, "1": { Position: "1" } } });
    expect(Array.isArray((t.Lines as Record<string, unknown>))).toBe(false);
    expect(t.Lines).toEqual({ "44": { Position: "5" }, "1": { Position: "1" } });
  });

  it("handles _deleted on object keys", () => {
    const t = { Messages: { "1": { m: "a" }, "2": { m: "b" } } };
    deepMerge(t, { Messages: { _deleted: ["1"], "3": { m: "c" } } });
    expect(t.Messages).toEqual({ "2": { m: "b" }, "3": { m: "c" } });
  });

  it("handles _deleted on array indices (splice)", () => {
    const t = { arr: [{ v: 0 }, { v: 1 }, { v: 2 }] };
    deepMerge(t, { arr: { _deleted: ["1"] } });
    expect(t.arr).toEqual([{ v: 0 }, { v: 2 }]);
  });

  it("merges the real F1 segments patch shape", () => {
    // Snapshot seeds Sectors as an array of 3 sector objects.
    const line: Record<string, unknown> = {
      Sectors: [{ Value: "" }, { Value: "" }, { Value: "" }],
    };
    // Update patches sector 0's Segments as a real array.
    deepMerge(line, {
      Sectors: { "0": { Segments: [{ Status: 0 }, { Status: 2051 }] } },
    });
    const sectors = line.Sectors as Array<Record<string, unknown>>;
    expect(sectors[0]!.Segments).toEqual([{ Status: 0 }, { Status: 2051 }]);
    expect(sectors[1]).toEqual({ Value: "" });
  });

  it("merges the real F1 stints patch shape (numeric-keyed onto object)", () => {
    const line: Record<string, unknown> = { Stints: {} };
    deepMerge(line, { Stints: { "0": { Compound: "SOFT", TotalLaps: 3 } } });
    deepMerge(line, { Stints: { "0": { TotalLaps: 4 }, "1": { Compound: "HARD" } } });
    expect(line.Stints).toEqual({
      "0": { Compound: "SOFT", TotalLaps: 4 },
      "1": { Compound: "HARD" },
    });
  });
});
