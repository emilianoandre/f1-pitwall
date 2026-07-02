# F1 Live Dashboard — Plan & Implementation Details

A real-time dashboard that shows live timing, positions, and telemetry during F1 sessions
(practice, qualifying, sprint, race), with graceful degradation when no session is live.

---

## 1. Data sources

### Primary: F1 Live Timing feed (SignalR)
The official F1 live timing service at `https://livetiming.formula1.com/signalr` is a
public (unauthenticated) SignalR endpoint that broadcasts the same data the F1 TV timing
screens use. This is what FastF1 and the open-source f1-dash project consume.

- **Protocol**: SignalR (classic ASP.NET flavor, not Core). Flow: HTTP `negotiate` →
  WebSocket `connect` → `Subscribe` to topics.
- **Topics to subscribe**: `Heartbeat`, `TimingData`, `TimingAppData`, `TimingStats`,
  `DriverList`, `SessionInfo`, `SessionData`, `TrackStatus`, `RaceControlMessages`,
  `WeatherData`, `CarData.z`, `Position.z`, `TeamRadio`, `LapCount`, `ExtrapolatedClock`,
  `TopThree`, `PitLaneTimeCollection`, `ChampionshipPrediction`.
- **Wire format quirks**:
  - Topics ending in `.z` are raw-deflate-compressed, base64-encoded JSON (inflate with
    zlib raw mode).
  - The feed sends an initial full state (`R` message) followed by incremental patches
    (`M` messages) that must be deep-merged into the state tree.
  - Car telemetry (`CarData.z`) arrives in batches (~every 1.2s) containing multiple
    samples: RPM, speed, gear, throttle, brake, DRS per car.
  - `Position.z` carries x/y/z coordinates per car for the track map.

### Secondary / fallback: OpenF1 API
`https://api.openf1.org/v1/...` — REST + near-real-time data (laps, intervals, pit,
stints, radio, location). Use as fallback if the SignalR feed misbehaves, and for
backfilling if a client connects mid-session.

### Historical / non-live context
- **Jolpica (Ergast successor)** for standings, schedules, results.
- The F1 static API (`livetiming.formula1.com/static/...`) for session index/replay data —
  this also enables a **replay mode** for development (crucial: you can't develop only on
  live weekends).

---

## 2. Architecture

```
┌──────────────────────┐     ┌───────────────────────────┐     ┌──────────────────┐
│ F1 SignalR feed      │────▶│ Ingest service            │────▶│ Web clients      │
│ (livetiming.f1.com)  │  WS │ - parse/inflate/merge     │ SSE │ - Next.js app    │
└──────────────────────┘     │ - canonical session state │ /WS │ - zustand store  │
┌──────────────────────┐     │ - delta broadcast         │     │ - SVG/canvas map │
│ OpenF1 / Jolpica     │────▶│ - recorder (replay files) │     └──────────────────┘
└──────────────────────┘ REST└───────────────────────────┘
```

**One upstream connection, many clients.** The ingest service is the only thing talking
to the F1 feed (being a good citizen + resilience). It holds the full merged session
state and fans out to browsers.

### Ingest service ("live" backend)
- **Language**: TypeScript (Node) or Rust. Recommendation: **TypeScript** for iteration
  speed and shared types with the frontend; the throughput (a few KB/s) doesn't need Rust.
- Responsibilities:
  1. Connect/reconnect to SignalR with backoff; resubscribe on drop.
  2. Inflate `.z` topics, deep-merge patches into a canonical `SessionState` object.
  3. **Derive computed data** the raw feed doesn't give directly: gap history per lap,
     stint summaries, position-change events, battle detection (cars within 1s),
     pit-window estimates.
  4. Broadcast: on client connect send full state snapshot, then push JSON-patch deltas
     (throttled to ~4–10 Hz for timing, pass-through batches for telemetry).
  5. **Record** every raw message with timestamps to disk (JSONL) → replay mode.
- **Transport to clients**: SSE is simplest (one-directional, auto-reconnect,
  HTTP/2-friendly); WebSocket if we later add client→server interactions. Start with SSE.

### Frontend
- **Next.js (App Router) + React + Tailwind**, `zustand` for the live state store.
- One SSE connection feeding the store; components subscribe to slices so a telemetry
  tick doesn't re-render the timing tower.
- Track map: SVG rendered from the track outline (derivable from position data or the
  MultiViewer circuit API `api.multiviewer.app/api/v1/circuits/{key}/{year}`), with car
  dots animated via `requestAnimationFrame` interpolation between position samples.
- **Delay control**: a client-side buffer slider (0–60s+) so users can sync the dashboard
  with their TV broadcast (broadcasts lag the raw feed). This is a must-have feature —
  spoiler protection.

### Deployment
- Single VPS / container: ingest service + Next.js (or static frontend + Node backend).
- No database required for MVP; session state is in-memory, recordings on disk.
  Add Postgres later only if we want queryable history.

---

## 3. Features

### Core (all session types) — MVP
| Feature | Detail |
|---|---|
| **Timing tower** | Position, driver code + team color, last lap, best lap, gap to leader, interval to car ahead, sector times with personal/overall-best coloring (white/green/purple), mini-sector dots |
| **Tyre info** | Current compound (C1–C5/inter/wet icon), tyre age in laps, stint history strip |
| **Track map** | Live car positions on circuit outline, marshal-sector coloring for yellow/red flags, safety car indicator |
| **Track status banner** | Green / yellow / SC / VSC / red flag, prominently displayed |
| **Race control feed** | Scrolling RC messages (investigations, penalties, deleted laps, flag events) |
| **Session header** | Session name, remaining time / lap counter (from `ExtrapolatedClock` + `LapCount`), weather (air/track temp, wind, rain flag, humidity) |
| **Pit indicator** | In-pit / out-lap status, pit stop count |
| **Broadcast-sync delay slider** | Buffer the stream client-side by user-set seconds |

### Session-specific views
- **Race**: interval-centric tower, position-change arrows, pit-stop log with stationary
  times, battle highlighting (gap < 1.0s → DRS threat), leader lap count, gap evolution
  chart (per-driver line chart over laps), championship prediction ("as they stand").
- **Qualifying**: Q1/Q2/Q3 segment display, elimination zone highlighting (drop zone),
  cutoff line, "at-risk" drivers on track vs. in garage, purple/green sector deltas
  against provisional pole, track evolution note.
- **Practice**: best-lap-centric tower, long-run detection (consecutive laps on same
  compound → average pace table), lap-time scatter plot per driver, program tracking
  (quali sim vs. race sim inference).

### Telemetry & analysis (post-MVP, high value)
- **Driver detail panel**: click a driver → speed/throttle/brake/gear/DRS traces for the
  current lap, head-to-head comparison vs. another driver.
- **Lap time chart**: all drivers, filterable, compound-colored points.
- **Stint/strategy view**: horizontal stint bars per driver (compound + length), like the
  broadcast strategy graphic.
- **Team radio player**: list + inline audio playback (`TeamRadio` topic gives clip URLs).

### Quality-of-life
- Schedule page (next session countdown, full weekend timetable, user's timezone).
- "No live session" home state → next session countdown + latest results (Jolpica).
- Settings: favorite drivers pinned/highlighted, units, which tower columns to show.
- Responsive: full data-dense desktop layout; mobile gets tower + track status first.
- Optional kiosk/multi-screen mode (map on one screen, tower on another) — later.

---

## 4. Data model sketch

```ts
type SessionState = {
  session: { type: 'Practice'|'Qualifying'|'Sprint'|'Race'; name: string; started: boolean;
             remaining?: string; currentLap?: number; totalLaps?: number };
  trackStatus: 'AllClear'|'Yellow'|'SCDeployed'|'VSC'|'Red';
  weather: { airTemp: number; trackTemp: number; humidity: number; windSpeed: number;
             windDir: number; rainfall: boolean };
  drivers: Record<string /*racingNumber*/, {
    tla: string; fullName: string; teamName: string; teamColor: string; line: number;
    gapToLeader: string; interval: string;
    lastLap: LapTime; bestLap: LapTime;
    sectors: [Sector, Sector, Sector];        // value + pb/ob flags + mini-sector segments
    stints: Stint[];                           // compound, ageAtStart, laps
    inPit: boolean; pitOut: boolean; stops: number;
    retired: boolean; knockedOut: boolean;     // quali
    carData?: { rpm: number; speed: number; gear: number; throttle: number;
                brake: number; drs: boolean };
    position?: { x: number; y: number };
  }>;
  raceControl: { utc: string; category: string; message: string; flag?: string }[];
  // derived, computed server-side:
  lapHistory: Record<string, { lap: number; timeMs: number; compound: string }[]>;
  gapHistory: Record<string, { lap: number; gapMs: number }[]>;
};
```

Clients receive `{ type: 'snapshot', state }` on connect, then `{ type: 'patch', ops }`
(RFC-6902-ish or shallow topic merges — pick one and keep it dumb).

---

## 5. Implementation phases

### Phase 0 — Feed spike + recorder (the de-risking step, do this first)
- Minimal script: negotiate → connect → subscribe → dump raw messages to JSONL.
- Verify inflate of `.z` topics and the R/M merge semantics against a real session
  (or the static replay endpoints).
- **Deliverable**: recorded session files + a replay player that re-emits them with
  original timing (and a speed multiplier). All later development runs off replays.

### Phase 1 — Ingest service
- SignalR client with reconnect, state merger, derived-data computation, SSE fan-out,
  snapshot-on-connect. Unit-test the merger against recorded fixtures.

### Phase 2 — MVP frontend
- Timing tower + session header + track status + race control feed + weather.
- SSE client, zustand store, delay buffer.
- **Deliverable**: usable dashboard for a race, driven by replay in dev.

### Phase 3 — Track map + tyres + pit
- Circuit outline, animated car dots with interpolation, sector flag coloring.
- Tyre compound/age column, stint strip, pit log.

### Phase 4 — Session-specific modes
- Quali elimination view, practice long-run tables, race gap chart & battle highlights.

### Phase 5 — Telemetry & extras
- Per-driver telemetry traces, head-to-head, lap chart, team radio, schedule/standings
  pages, settings & favorites.

---

## 6. Risks & mitigations
- **Unofficial feed**: no SLA, format can change, could be restricted. Mitigate with the
  recorder (fixtures detect breakage fast), OpenF1 fallback, and a single shared upstream
  connection. Don't monetize; keep it a personal/community tool (F1 trademarks apply).
- **Can only test live ~21 weekends/year**: replay mode from Phase 0 is the answer.
- **Patch-merge bugs** (state drift): periodic full-state checksum/refetch; heavy fixture
  testing of the merger.
- **Render performance** with 20 cars × high-frequency data: slice-based store
  subscriptions, rAF-batched map updates, throttled tower updates (humans can't read
  faster than ~4 Hz anyway).
- **Clock sync for the delay slider**: buffer by server-stamped message time, not client
  arrival time.

## 7. Tech stack summary
- **Backend**: Node 22 + TypeScript, `ws`, `zlib`, Fastify (SSE + REST), JSONL recorder.
- **Frontend**: Next.js + React + Tailwind + zustand; SVG track map; a lightweight chart
  lib (e.g. visx or plain SVG) for lap/gap charts.
- **Shared**: one `packages/types` for `SessionState` etc. (pnpm monorepo:
  `apps/ingest`, `apps/web`, `packages/types`).
- **Testing**: vitest + recorded-session fixtures; Playwright smoke test on replay.
