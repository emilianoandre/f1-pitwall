import { describe, it, expect } from "vitest";
import { inflateZ, deflateZ, isCompressedTopic } from "../src/feed/inflate.js";
import { parseFrames, routeFrame } from "../src/feed/parse.js";
import { normalizeTopic, TOPICS } from "../src/feed/topics.js";

describe("inflate", () => {
  it("round-trips a .z payload", () => {
    const obj = { Entries: [{ Cars: { "1": { Channels: { "0": 11000 } } } }] };
    const encoded = deflateZ(obj);
    expect(typeof encoded).toBe("string");
    expect(inflateZ(encoded)).toEqual(obj);
  });

  it("detects compressed topics", () => {
    expect(isCompressedTopic("CarData.z")).toBe(true);
    expect(isCompressedTopic("TimingData")).toBe(false);
  });
});

describe("normalizeTopic", () => {
  it("strips .z suffix", () => {
    expect(normalizeTopic("CarData.z")).toBe("CarData");
    expect(normalizeTopic("Position.z")).toBe("Position");
    expect(normalizeTopic("TimingData")).toBe("TimingData");
  });
});

describe("TOPICS", () => {
  it("includes the topics downstream state derivation depends on", () => {
    expect(TOPICS).toContain("PitLaneTimeCollection");
    expect(TOPICS).toContain("ChampionshipPrediction");
  });
});

describe("parseFrames", () => {
  it("splits record-separated frames and parses each as JSON", () => {
    const raw = `{"a":1}\x1e{"b":2}\x1e`;
    expect(parseFrames(raw)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("drops unparseable frames instead of throwing", () => {
    const raw = `{"a":1}\x1enot json\x1e{"b":2}\x1e`;
    expect(parseFrames(raw)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("ignores empty segments", () => {
    expect(parseFrames("\x1e\x1e")).toEqual([]);
  });
});

describe("routeFrame", () => {
  it("ignores the handshake ack and pings", () => {
    let msgs = 0;
    let snaps = 0;
    routeFrame({}, () => msgs++, () => snaps++);
    routeFrame({ type: 6 }, () => msgs++, () => snaps++);
    expect(msgs).toBe(0);
    expect(snaps).toBe(0);
  });

  it("routes a type-3 completion's result as a snapshot, inflating .z topics", () => {
    const carData = { Entries: [{ Utc: "t", Cars: {} }] };
    const frame = {
      type: 3,
      invocationId: "0",
      result: {
        TimingData: { Lines: { "1": { Position: "1" } } },
        "CarData.z": deflateZ(carData),
      },
    };
    let snapshot: Record<string, unknown> | null = null;
    routeFrame(frame, () => {}, (s) => (snapshot = s));
    expect(snapshot).not.toBeNull();
    const snap = snapshot as unknown as Record<string, unknown>;
    expect(snap.TimingData).toEqual({ Lines: { "1": { Position: "1" } } });
    // Re-keyed under base name and inflated.
    expect(snap.CarData).toEqual(carData);
    expect(snap["CarData.z"]).toBeUndefined();
  });

  it("routes a type-1 invocation carrying a single [topic, data, utc] tuple", () => {
    const frame = {
      type: 1,
      target: "feed",
      arguments: ["TrackStatus", { Status: "2" }, "2024-01-01T00:00:00Z"],
    };
    const received: Array<{ topic: string; data: unknown; ts: string }> = [];
    routeFrame(frame, (topic, data, ts) => received.push({ topic, data, ts }), () => {});
    expect(received).toEqual([
      { topic: "TrackStatus", data: { Status: "2" }, ts: "2024-01-01T00:00:00Z" },
    ]);
  });

  it("routes a type-1 invocation carrying a batch of tuples", () => {
    const frame = {
      type: 1,
      target: "feed",
      arguments: [
        ["TrackStatus", { Status: "2" }, "2024-01-01T00:00:00Z"],
        ["LapCount", { CurrentLap: 5 }, "2024-01-01T00:00:01Z"],
      ],
    };
    const received: Array<{ topic: string; data: unknown; ts: string }> = [];
    routeFrame(frame, (topic, data, ts) => received.push({ topic, data, ts }), () => {});
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({
      topic: "TrackStatus",
      data: { Status: "2" },
      ts: "2024-01-01T00:00:00Z",
    });
    expect(received[1]?.topic).toBe("LapCount");
  });

  it("inflates .z topics inside a tuple and normalizes the name", () => {
    const pos = { Position: [{ Timestamp: "t", Entries: {} }] };
    const frame = { type: 1, target: "feed", arguments: ["Position.z", deflateZ(pos), "t"] };
    let got: { topic: string; data: unknown } | null = null;
    routeFrame(frame, (topic, data) => (got = { topic, data }), () => {});
    expect(got).not.toBeNull();
    const g = got as unknown as { topic: string; data: unknown };
    expect(g.topic).toBe("Position");
    expect(g.data).toEqual(pos);
  });
});
