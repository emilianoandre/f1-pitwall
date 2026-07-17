import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasF1tvCredentials, getAccessToken, resetAuthCacheForTests } from "../src/feed/auth.js";

/** Build a fake (unsigned) JWT carrying only the `exp` claim, for testing. */
function fakeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("hasF1tvCredentials", () => {
  const original = {
    u: process.env.F1_USERNAME,
    p: process.env.F1_PASSWORD,
    t: process.env.F1_SUBSCRIPTION_TOKEN,
  };

  afterEach(() => {
    process.env.F1_USERNAME = original.u;
    process.env.F1_PASSWORD = original.p;
    process.env.F1_SUBSCRIPTION_TOKEN = original.t;
  });

  it("is false when nothing is set", () => {
    delete process.env.F1_USERNAME;
    delete process.env.F1_PASSWORD;
    delete process.env.F1_SUBSCRIPTION_TOKEN;
    expect(hasF1tvCredentials()).toBe(false);
  });

  it("is false with only one of username/password", () => {
    delete process.env.F1_SUBSCRIPTION_TOKEN;
    process.env.F1_USERNAME = "driver@example.com";
    delete process.env.F1_PASSWORD;
    expect(hasF1tvCredentials()).toBe(false);
  });

  it("is true once both username and password are set", () => {
    delete process.env.F1_SUBSCRIPTION_TOKEN;
    process.env.F1_USERNAME = "driver@example.com";
    process.env.F1_PASSWORD = "hunter2";
    expect(hasF1tvCredentials()).toBe(true);
  });

  it("is true with just a subscription token", () => {
    delete process.env.F1_USERNAME;
    delete process.env.F1_PASSWORD;
    process.env.F1_SUBSCRIPTION_TOKEN = fakeJwt(9999999999);
    expect(hasF1tvCredentials()).toBe(true);
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    resetAuthCacheForTests();
    delete process.env.F1_USERNAME;
    delete process.env.F1_PASSWORD;
    delete process.env.F1_SUBSCRIPTION_TOKEN;
  });

  it("rejects with a clear error when nothing is configured", async () => {
    await expect(getAccessToken()).rejects.toThrow(/F1_USERNAME.*F1_PASSWORD/);
  });

  it("returns a valid F1_SUBSCRIPTION_TOKEN directly, without logging in", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    process.env.F1_SUBSCRIPTION_TOKEN = token;
    await expect(getAccessToken()).resolves.toBe(token);
  });

  it("rejects an expired F1_SUBSCRIPTION_TOKEN with a clear error", async () => {
    process.env.F1_SUBSCRIPTION_TOKEN = fakeJwt(Math.floor(Date.now() / 1000) - 3600);
    await expect(getAccessToken()).rejects.toThrow(/expired/i);
  });

  it("strips stray whitespace/quotes/newlines from a pasted token", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    process.env.F1_SUBSCRIPTION_TOKEN = `  "${token}"\n`;
    await expect(getAccessToken()).resolves.toBe(token);
  });

  it("rejects a token that still isn't a 3-part JWT after sanitizing", async () => {
    process.env.F1_SUBSCRIPTION_TOKEN = "not-a-jwt";
    await expect(getAccessToken()).rejects.toThrow(/doesn't look like a valid JWT/);
  });
});
