import { describe, it, expect, afterEach } from "vitest";
import { hasOpenf1Credentials } from "../src/feed/openf1/auth.js";
import { carDataChannels, positionEntry } from "../src/feed/openf1/map.js";
import { Openf1TopicWriter } from "../src/feed/openf1/writer.js";
import { LatestByDriverBuffer } from "../src/feed/openf1/buffer.js";
import { StateEngine } from "../src/state/engine.js";
import type { Openf1CarData, Openf1Location } from "../src/feed/openf1/types.js";

describe("hasOpenf1Credentials", () => {
  const original = { u: process.env.OPENF1_USERNAME, p: process.env.OPENF1_PASSWORD };

  afterEach(() => {
    process.env.OPENF1_USERNAME = original.u;
    process.env.OPENF1_PASSWORD = original.p;
  });

  it("is false when nothing is set", () => {
    delete process.env.OPENF1_USERNAME;
    delete process.env.OPENF1_PASSWORD;
    expect(hasOpenf1Credentials()).toBe(false);
  });

  it("is false with only one of username/password", () => {
    process.env.OPENF1_USERNAME = "driver@example.com";
    delete process.env.OPENF1_PASSWORD;
    expect(hasOpenf1Credentials()).toBe(false);
  });

  it("is true once both are set", () => {
    process.env.OPENF1_USERNAME = "driver@example.com";
    process.env.OPENF1_PASSWORD = "hunter2";
    expect(hasOpenf1Credentials()).toBe(true);
  });
});

describe("carDataChannels", () => {
  it("maps the documented example record to F1 channel codes", () => {
    const record: Openf1CarData = {
      driver_number: 55,
      rpm: 11141,
      speed: 315,
      n_gear: 8,
      throttle: 99,
      brake: 0,
      drs: 12,
      date: "2023-09-15T13:08:19.923000+00:00",
    };
    expect(carDataChannels(record)).toEqual({
      Channels: { "0": 11141, "2": 315, "3": 8, "4": 99, "5": 0, "45": 12 },
    });
  });
});

describe("positionEntry", () => {
  it("maps x/y/z and defaults status to OnTrack", () => {
    const record: Openf1Location = {
      driver_number: 81,
      x: 567,
      y: 3195,
      z: 187,
      date: "2023-09-16T13:03:35.292000+00:00",
    };
    expect(positionEntry(record)).toEqual({ X: 567, Y: 3195, Z: 187, Status: "OnTrack" });
  });
});

describe("Openf1TopicWriter", () => {
  it("bootstraps with a literal array, then appends by index, then resets", () => {
    const writer = new Openf1TopicWriter("Entries");
    expect(writer.nextPatch("a")).toEqual({ Entries: ["a"] });
    expect(writer.nextPatch("b")).toEqual({ Entries: { "1": "b" } });
    expect(writer.nextPatch("c")).toEqual({ Entries: { "2": "c" } });

    writer.reset();
    expect(writer.nextPatch("d")).toEqual({ Entries: ["d"] });
  });

  it("uses whatever array key it's constructed with", () => {
    const writer = new Openf1TopicWriter("Position");
    expect(writer.nextPatch("a")).toEqual({ Position: ["a"] });
  });
});

describe("LatestByDriverBuffer", () => {
  it("returns null when nothing has been set since the last flush", () => {
    const buf = new LatestByDriverBuffer<number>();
    expect(buf.flushIfDirty()).toBeNull();
  });

  it("coalesces multiple sets for the same driver into one flush", () => {
    const buf = new LatestByDriverBuffer<number>();
    buf.set("55", 1);
    buf.set("55", 2);
    buf.set("81", 3);
    expect(buf.flushIfDirty()).toEqual({ "55": 2, "81": 3 });
    expect(buf.flushIfDirty()).toBeNull();
  });
});

describe("Openf1TopicWriter through the real StateEngine (array-bootstrap invariant)", () => {
  it("populates carData/trackPosition, then recovers after a resnapshot wipes the raw store", () => {
    const engine = new StateEngine();
    const cb = engine.callbacks;

    cb.onSnapshot({ DriverList: { "55": { Tla: "SAI" } } });

    const carWriter = new Openf1TopicWriter("Entries");
    const posWriter = new Openf1TopicWriter("Position");

    cb.onMessage(
      "CarData",
      carWriter.nextPatch({ Utc: "t1", Cars: { "55": carDataChannels({
        driver_number: 55, rpm: 11141, speed: 315, n_gear: 8, throttle: 99, brake: 0, drs: 12, date: "t1",
      }) } }),
      "t1",
    );
    cb.onMessage(
      "Position",
      posWriter.nextPatch({ Timestamp: "t1", Entries: { "55": positionEntry({
        driver_number: 55, x: 567, y: 3195, z: 187, date: "t1",
      }) } }),
      "t1",
    );

    let state = engine.getState();
    expect(state.drivers["55"]?.carData).toEqual({
      rpm: 11141, speed: 315, gear: 8, throttle: 99, brake: 0, drs: true, utc: "",
    });
    expect(state.drivers["55"]?.trackPosition).toEqual({ x: 567, y: 3195, z: 187, status: "OnTrack" });

    // A second update should append (index-patch), not clobber the array.
    cb.onMessage(
      "CarData",
      carWriter.nextPatch({ Utc: "t2", Cars: { "55": carDataChannels({
        driver_number: 55, rpm: 12000, speed: 320, n_gear: 8, throttle: 100, brake: 0, drs: 12, date: "t2",
      }) } }),
      "t2",
    );
    state = engine.getState();
    expect(state.drivers["55"]?.carData?.speed).toBe(320);

    // Simulate a SignalR resnapshot: the raw store is replaced and CarData/
    // Position (never granted by SignalR) vanish. Without resetting the
    // writers, the next patch would target a now-nonexistent array.
    cb.onSnapshot({ DriverList: { "55": { Tla: "SAI" } } });
    carWriter.reset();
    posWriter.reset();

    cb.onMessage(
      "CarData",
      carWriter.nextPatch({ Utc: "t3", Cars: { "55": carDataChannels({
        driver_number: 55, rpm: 9000, speed: 200, n_gear: 4, throttle: 50, brake: 20, drs: 0, date: "t3",
      }) } }),
      "t3",
    );
    state = engine.getState();
    expect(state.drivers["55"]?.carData?.speed).toBe(200);
  });
});
