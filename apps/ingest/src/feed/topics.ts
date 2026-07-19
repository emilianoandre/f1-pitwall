// Topics we subscribe to on the F1 live timing feed.
// Topics ending in ".z" are raw-deflate + base64 compressed (see inflate.ts).
//
// This is a real browser session's exact 19-topic list (and order), captured
// from a raw packet trace whose Subscribe completion genuinely included
// CarData.z/Position.z, plus PitLaneTimeCollection appended -- the browser
// doesn't request it, but we actually consume it (state/derived.ts pit-stop
// history) unlike RcmSeries/TopThree, which the browser also omits and which
// nothing in this codebase reads either.
export const TOPICS = [
  "Heartbeat",
  "AudioStreams",
  "DriverList",
  "ExtrapolatedClock",
  "RaceControlMessages",
  "SessionInfo",
  "SessionStatus",
  "TeamRadio",
  "TimingAppData",
  "TimingStats",
  "TrackStatus",
  "WeatherData",
  "Position.z",
  "CarData.z",
  "ContentStreams",
  "SessionData",
  "TimingData",
  "LapCount",
  "ChampionshipPrediction",
  "PitLaneTimeCollection",
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
