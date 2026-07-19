import { describe, it, expect } from "vitest";
import { normalizeDataSource, getDataSourceFlag } from "../src/launchdarkly.js";

describe("normalizeDataSource", () => {
  it("recognizes the intended display-name values", () => {
    expect(normalizeDataSource("f1")).toBe("f1");
    expect(normalizeDataSource("openf1")).toBe("openf1");
    expect(normalizeDataSource("mix")).toBe("mix");
  });

  it("also recognizes the flag's actual current variation values (unfixed placeholders)", () => {
    expect(normalizeDataSource("variation 1")).toBe("f1");
    expect(normalizeDataSource("variation 2")).toBe("openf1");
    expect(normalizeDataSource("variation 3")).toBe("mix");
  });

  it("falls back to 'mix' for anything unrecognized", () => {
    expect(normalizeDataSource("")).toBe("mix");
    expect(normalizeDataSource("nonsense")).toBe("mix");
  });
});

describe("getDataSourceFlag", () => {
  it("defaults to 'mix' when LaunchDarkly was never initialized", async () => {
    await expect(getDataSourceFlag()).resolves.toBe("mix");
  });
});
