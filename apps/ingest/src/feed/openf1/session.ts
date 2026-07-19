import { request } from "undici";
import type { Openf1Session, Openf1Meeting } from "./types.js";

const API_BASE = "https://api.openf1.org/v1";

/**
 * One-time REST bootstrap for session/meeting metadata (full-switch mode only)
 * — OpenF1 doesn't stream this live, it's fetched once at connect time and
 * mapped into the same raw shape F1's own SessionInfo topic carries, so
 * transform.ts's buildSession() needs no changes.
 */
export async function fetchOpenf1SessionInfo(token: string): Promise<Record<string, unknown> | null> {
  const session = await fetchLatest<Openf1Session>(`${API_BASE}/sessions?session_key=latest`, token);
  if (!session) return null;
  const meeting = await fetchLatest<Openf1Meeting>(
    `${API_BASE}/meetings?meeting_key=${session.meeting_key}`,
    token,
  );

  return {
    Type: session.session_type,
    Name: session.session_name,
    StartDate: session.date_start,
    Path: "",
    Meeting: {
      Name: meeting?.meeting_name ?? "",
      OfficialName: meeting?.meeting_official_name ?? "",
      Circuit: {
        Key: session.circuit_key,
        ShortName: session.circuit_short_name,
      },
      Country: {
        Name: session.country_name,
      },
    },
  };
}

async function fetchLatest<T>(url: string, token: string): Promise<T | null> {
  const res = await request(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) {
    await res.body.text().catch(() => {});
    return null;
  }
  const body = (await res.body.json()) as unknown;
  return Array.isArray(body) && body.length > 0 ? (body[0] as T) : null;
}
