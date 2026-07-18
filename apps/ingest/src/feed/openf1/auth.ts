import { request } from "undici";

// OpenF1 (openf1.org) is a supplementary source for the topics F1's own feed
// won't grant us (see feed/auth.ts for that story) — real-time access needs a
// paid account. Tokens are short-lived (1h) so we cache + refresh, same shape
// as the F1TV token cache below.
const TOKEN_URL = "https://api.openf1.org/token";

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

/** True if OpenF1 credentials are configured — the supplementary feed is optional. */
export function hasOpenf1Credentials(): boolean {
  return Boolean(process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD);
}

/** Get a cached OpenF1 access token, refreshing (with in-flight dedup) if expired. */
export async function getOpenf1Token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (!inflight) {
    inflight = login().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function login(): Promise<string> {
  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;
  if (!username || !password) {
    throw new Error("OPENF1_USERNAME/OPENF1_PASSWORD are not set");
  }

  const res = await request(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }).toString(),
  });

  const rawText = await res.body.text();
  type TokenResponse = { access_token?: string; expires_in?: number };
  let parsed: TokenResponse | null = null;
  try {
    parsed = JSON.parse(rawText) as TokenResponse;
  } catch {
    // not JSON — fall through to the error below
  }

  const token = parsed?.access_token;
  if (res.statusCode !== 200 || !token) {
    const detail = rawText.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `OpenF1 login failed: HTTP ${res.statusCode}${detail ? ` — ${detail}` : ""}`,
    );
  }

  const expiresInMs = (parsed?.expires_in ?? 3600) * 1000;
  cached = { token, expiresAt: Date.now() + expiresInMs };
  return token;
}

/** Test-only: reset cached token state between test runs. */
export function resetOpenf1AuthCacheForTests(): void {
  cached = null;
  inflight = null;
}
