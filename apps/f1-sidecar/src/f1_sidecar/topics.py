"""Mirrors apps/ingest/src/feed/topics.ts — keep the two in sync.

Topics ending in ".z" are raw-deflate + base64 compressed; this service
forwards them untouched, decompression happens on the Node side
(feed/inflate.ts).
"""

TOPICS = [
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
]

NEGOTIATE_URL = "https://livetiming.formula1.com/signalrcore/negotiate"
WS_URL = "wss://livetiming.formula1.com/signalrcore"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Captured from a real authenticated browser session's own network trace —
# the live-timing widget on formula1.com itself (not f1tv.formula1.com) is
# what actually connects here.
ORIGIN = "https://www.formula1.com"
REFERER = "https://www.formula1.com/"
