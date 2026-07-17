import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasF1tvCredentials, getAccessToken, resetAuthCacheForTests } from "../src/feed/auth.js";

describe("hasF1tvCredentials", () => {
  const original = { u: process.env.F1_USERNAME, p: process.env.F1_PASSWORD };

  afterEach(() => {
    process.env.F1_USERNAME = original.u;
    process.env.F1_PASSWORD = original.p;
  });

  it("is false when either credential is missing", () => {
    delete process.env.F1_USERNAME;
    delete process.env.F1_PASSWORD;
    expect(hasF1tvCredentials()).toBe(false);

    process.env.F1_USERNAME = "driver@example.com";
    delete process.env.F1_PASSWORD;
    expect(hasF1tvCredentials()).toBe(false);
  });

  it("is true once both are set", () => {
    process.env.F1_USERNAME = "driver@example.com";
    process.env.F1_PASSWORD = "hunter2";
    expect(hasF1tvCredentials()).toBe(true);
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    resetAuthCacheForTests();
    delete process.env.F1_USERNAME;
    delete process.env.F1_PASSWORD;
  });

  it("rejects with a clear error when credentials aren't configured", async () => {
    await expect(getAccessToken()).rejects.toThrow(/F1_USERNAME.*F1_PASSWORD/);
  });
});
