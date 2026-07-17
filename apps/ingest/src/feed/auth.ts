import { request } from "undici";

// F1 closed unauthenticated access to the live timing feed in 2026 — it now
// requires an F1TV subscription token, obtained the same way the official
// F1TV app does (and the way third-party clients like f1viewer reverse
// engineered): log in with a subscriber's username/password.
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

/** True if F1TV credentials are configured — the live feed requires them. */
export function hasF1tvCredentials(): boolean {
  return Boolean(process.env.F1_USERNAME && process.env.F1_PASSWORD);
}

/**
 * Get a cached F1TV subscription token, logging in (or refreshing) as needed.
 * Concurrent callers during a refresh share the same in-flight login request.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (!inflight) {
    inflight = login().finally(() => {
      inflight = null;
    });
  }
  return inflight;
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
