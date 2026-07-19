// Topics we subscribe to on the F1 live timing feed.
// Topics ending in ".z" are raw-deflate + base64 compressed (see inflate.ts).
export const TOPICS = [
  "Heartbeat",
  "TimingData",
  "TimingAppData",
  "TimingStats",
  "DriverList",
  "SessionInfo",
  "SessionData",
  "SessionStatus",
  "TrackStatus",
  "RaceControlMessages",
  "RcmSeries",
  "WeatherData",
  "CarData.z",
  "Position.z",
  "TeamRadio",
  "AudioStreams",
  "ContentStreams",
  "LapCount",
  "ExtrapolatedClock",
  "TopThree",
  "PitLaneTimeCollection",
  "ChampionshipPrediction",
] as const;

// F1 migrated the live feed from old ASP.NET SignalR to ASP.NET Core SignalR
// ("signalrcore") in 2026, at the same time it started requiring an F1TV
// login (see feed/auth.ts) — the endpoints below are the new ones.
export const NEGOTIATE_URL = "https://livetiming.formula1.com/signalrcore/negotiate";
export const WS_URL = "wss://livetiming.formula1.com/signalrcore";
export const STATIC_URL = "https://livetiming.formula1.com/static";

// A browser-like UA — the feed rejects some default clients.
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Captured from a real authenticated browser session's own network trace —
// the live-timing widget on formula1.com itself (not f1tv.formula1.com) is
// what actually connects here.
export const ORIGIN = "https://www.formula1.com";
export const REFERER = "https://www.formula1.com/";

/** Strip a trailing ".z" so compressed topics are emitted under their base name. */
export function normalizeTopic(topic: string): string {
  return topic.endsWith(".z") ? topic.slice(0, -2) : topic;
}
