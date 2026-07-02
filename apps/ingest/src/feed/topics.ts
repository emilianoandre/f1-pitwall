// Topics we subscribe to on the F1 SignalR feed.
// Topics ending in ".z" are raw-deflate + base64 compressed (see inflate.ts).
export const TOPICS = [
  "Heartbeat",
  "TimingData",
  "TimingAppData",
  "TimingStats",
  "DriverList",
  "SessionInfo",
  "SessionData",
  "TrackStatus",
  "RaceControlMessages",
  "WeatherData",
  "CarData.z",
  "Position.z",
  "TeamRadio",
  "LapCount",
  "ExtrapolatedClock",
  "TopThree",
  "PitLaneTimeCollection",
  "ChampionshipPrediction",
] as const;

export const HUB = "Streaming";
export const BASE_URL = "https://livetiming.formula1.com/signalr";
export const WS_URL = "wss://livetiming.formula1.com/signalr";
export const STATIC_URL = "https://livetiming.formula1.com/static";
export const CLIENT_PROTOCOL = "1.5";

// SignalR connectionData is a URL-encoded JSON array naming the hub.
export const CONNECTION_DATA = JSON.stringify([{ name: HUB }]);

// A browser-like UA — the feed rejects some default clients.
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Strip a trailing ".z" so compressed topics are emitted under their base name. */
export function normalizeTopic(topic: string): string {
  return topic.endsWith(".z") ? topic.slice(0, -2) : topic;
}
