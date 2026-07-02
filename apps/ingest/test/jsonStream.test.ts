import { describe, it, expect } from "vitest";
import { parseStreamLine, parseStream } from "../src/recording/jsonStream.js";

describe("parseStreamLine", () => {
  it("parses a timestamp offset and JSON payload", () => {
    const e = parseStreamLine('00:00:12.345{"Lines":{"1":{"Position":"1"}}}');
    expect(e).not.toBeNull();
    expect(e?.offsetMs).toBe(12_345);
    expect(e?.data).toEqual({ Lines: { "1": { Position: "1" } } });
  });

  it("handles hours/minutes", () => {
    const e = parseStreamLine('01:02:03.004{"a":1}');
    expect(e?.offsetMs).toBe(3_600_000 + 120_000 + 3_000 + 4);
  });

  it("parses string payloads (compressed topics)", () => {
    const e = parseStreamLine('00:00:01.000"base64stringhere"');
    expect(e?.data).toBe("base64stringhere");
  });

  it("returns null on malformed lines", () => {
    expect(parseStreamLine("garbage")).toBeNull();
    expect(parseStreamLine("00:00:01.000{bad json")).toBeNull();
  });
});

describe("parseStream", () => {
  it("parses multiple lines and skips blanks", () => {
    const body = '00:00:00.000{"a":1}\n\n00:00:00.500{"b":2}\n';
    const out = parseStream(body);
    expect(out).toHaveLength(2);
    expect(out[0]?.offsetMs).toBe(0);
    expect(out[1]?.offsetMs).toBe(500);
  });
});
