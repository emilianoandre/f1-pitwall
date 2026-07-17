import { request } from "undici";

// F1 closed unauthenticated access to the live timing feed in 2026 — it now
// requires an F1TV subscription token.
//
// The programmatic login below (the same endpoint F1TV's own app and
// third-party clients like f1viewer use) gets blocked by Akamai bot
// detection when called from a cloud/datacenter IP — it returns a "Pardon
// Our Interruption" challenge page before ever checking the password.
// There's no clean server-side fix for that, so F1_SUBSCRIPTION_TOKEN lets
// you sidestep it: log into F1TV in a real browser (residential IP, no bot
// check), pull the resulting subscription token, and set it directly. It's
// a JWT valid for about a week; since it was obtained manually there's no
// way to auto-renew it, so you'll need to refresh it periodically.
const AUTH_URL = "https://api.formula1.com/v2/account/subscriber/authenticate/by-password";
// Public client API key used by open-source F1TV clients (f1viewer, MultiViewer).
// Not a secret — it identifies the client application, not the account.
const API_KEY = "fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7";

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

/** True if some way of getting an F1TV token is configured — the live feed requires one. */
export function hasF1tvCredentials(): boolean {
  return Boolean(
    process.env.F1_SUBSCRIPTION_TOKEN || (process.env.F1_USERNAME && process.env.F1_PASSWORD),
  );
}

/**
 * Get a cached F1TV subscription token: a manually-provided
 * F1_SUBSCRIPTION_TOKEN if set, otherwise a fresh username/password login
 * (blocked from most cloud hosts — see the module comment above).
 * Concurrent callers during a refresh share the same in-flight resolution.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (!inflight) {
    inflight = resolveToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

function resolveToken(): Promise<string> {
  const manual = process.env.F1_SUBSCRIPTION_TOKEN;
  return manual ? Promise.resolve(useManualToken(manual)) : login();
}

/**
 * A JWT is only `[A-Za-z0-9_-]` segments joined by `.` — strip anything else
 * (quotes, whitespace, a trailing newline from copy-paste) so a slightly
 * messy paste into an env var doesn't produce an invalid HTTP header value.
 */
function sanitizeToken(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_.-]/g, "");
}

function useManualToken(rawToken: string): string {
  const token = sanitizeToken(rawToken);
  if (!token || token.split(".").length !== 3) {
    throw new Error(
      "F1_SUBSCRIPTION_TOKEN doesn't look like a valid JWT after removing whitespace/quotes " +
        "— make sure you pasted only the subscriptionToken value, not the whole JSON response",
    );
  }
  const expiresAt = expiryFromJwt(token);
  if (expiresAt <= Date.now()) {
    throw new Error(
      "F1_SUBSCRIPTION_TOKEN has expired — log into F1TV in a browser again and set a fresh one " +
        "(a manually-obtained token can't be auto-renewed)",
    );
  }
  cached = { token, expiresAt };
  return token;
}

async function login(): Promise<string> {
  const username = process.env.F1_USERNAME;
  const password = process.env.F1_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "F1_USERNAME/F1_PASSWORD are not set — the live timing feed requires an F1TV login",
    );
  }

  const res = await request(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apiKey: API_KEY,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ Login: username, Password: password }),
  });

  // Read as text first — a WAF/bot-protection block page won't be JSON, and
  // we want to see it rather than silently swallow it.
  type LoginResponse = { data?: { subscriptionToken?: string }; message?: string };
  const rawText = await res.body.text();
  let parsed: LoginResponse | null = null;
  try {
    parsed = JSON.parse(rawText) as LoginResponse;
  } catch {
    // not JSON — likely a block page or plain-text error, fall through
  }

  const token = parsed?.data?.subscriptionToken;
  if (res.statusCode !== 200 || !token) {
    const server = res.headers["server"] ?? (res.headers["x-akamai-request-id"] ? "akamai" : undefined);
    const detail = parsed?.message ?? rawText.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `F1TV login failed: HTTP ${res.statusCode}` +
        (server ? ` (server: ${server})` : "") +
        (detail ? ` — ${detail}` : ""),
    );
  }

  cached = { token, expiresAt: expiryFromJwt(token) };
  return token;
}

/** Read the `exp` claim out of the JWT — we trust our own login response, no verification needed. */
function expiryFromJwt(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("not a JWT");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    if (typeof json.exp === "number") return json.exp * 1000;
  } catch {
    // fall through to default below
  }
  return Date.now() + 6 * 24 * 60 * 60 * 1000; // default: refresh after 6 days
}

/** Test-only: reset cached token state between test runs. */
export function resetAuthCacheForTests(): void {
  cached = null;
  inflight = null;
}
