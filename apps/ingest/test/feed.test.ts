import { describe, it, expect } from "vitest";
import { inflateZ, deflateZ, isCompressedTopic } from "../src/feed/inflate.js";
import { parseFrame, routeFrame } from "../src/feed/parse.js";
import { normalizeTopic, CONNECTION_DATA } from "../src/feed/topics.js";

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

describe("connection data", () => {
  it("encodes the Streaming hub", () => {
    expect(CONNECTION_DATA).toBe('[{"name":"Streaming"}]');
    expect(encodeURIComponent(CONNECTION_DATA)).toContain("Streaming");
  });
});

describe("routeFrame", () => {
  it("ignores keepalive frames", () => {
    let msgs = 0;
    let snaps = 0;
    routeFrame({}, () => msgs++, () => snaps++);
    expect(msgs).toBe(0);
    expect(snaps).toBe(0);
  });

  it("routes the subscribe reply (R) as a snapshot, inflating .z topics", () => {
    const carData = { Entries: [{ Utc: "t", Cars: {} }] };
    const frame = {
      R: {
        TimingData: { Lines: { "1": { Position: "1" } } },
        "CarData.z": deflateZ(carData),
      },
      I: "1",
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

  it("routes M-frame feed tuples as messages", () => {
    const frame = {
      M: [
        { H: "Streaming", M: "feed", A: ["TrackStatus", { Status: "2" }, "2024-01-01T00:00:00Z"] },
        { H: "Streaming", M: "feed", A: ["LapCount", { CurrentLap: 5 }, "2024-01-01T00:00:01Z"] },
        { H: "Streaming", M: "notfeed", A: ["Ignored", {}, "t"] },
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

  it("inflates .z topics inside M frames and normalizes the name", () => {
    const pos = { Position: [{ Timestamp: "t", Entries: {} }] };
    const frame = {
      M: [{ H: "Streaming", M: "feed", A: ["Position.z", deflateZ(pos), "t"] }],
    };
    let got: { topic: string; data: unknown } | null = null;
    routeFrame(frame, (topic, data) => (got = { topic, data }), () => {});
    expect(got).not.toBeNull();
    const g = got as unknown as { topic: string; data: unknown };
    expect(g.topic).toBe("Position");
    expect(g.data).toEqual(pos);
  });
});

describe("parseFrame", () => {
  it("parses valid JSON", () => {
    expect(parseFrame('{"a":1}')).toEqual({ a: 1 });
  });
  it("returns null on garbage", () => {
    expect(parseFrame("not json")).toBeNull();
  });
});
