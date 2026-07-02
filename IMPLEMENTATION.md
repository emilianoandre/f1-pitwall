# F1 Live Dashboard — Executable Task Breakdown

This document is written for an AI agent (or engineer) to execute without additional
context. Read `PLAN.md` first for the "why"; this file is the "how". Execute tasks in
order — later tasks assume earlier ones are complete. Each task ends with **acceptance
criteria**; do not move on until they pass.

Conventions used throughout:
- Node 22+, TypeScript strict mode, pnpm workspaces, ESM everywhere (`"type": "module"`).
- All timestamps are ISO-8601 UTC strings on the wire, `number` (ms epoch) internally.
- Driver keys are the **racing number as a string** (e.g. `"1"`, `"44"`) — this is how
  the F1 feed keys everything. Never re-key by TLA.

---

## Task 0 — Repository scaffold

Create a pnpm monorepo:

```
f1-dash/
├── package.json                # private, workspaces
├── pnpm-workspace.yaml         # packages: ["apps/*", "packages/*"]
├── tsconfig.base.json          # strict, ES2022, moduleResolution bundler
├── apps/
│   ├── ingest/                 # backend: feed client, state, SSE server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── web/                    # Next.js frontend (created in Task 6)
├── packages/
│   └── types/                  # shared TypeScript types, zero runtime deps
│       ├── package.json
│       └── src/index.ts
└── data/
    └── recordings/             # JSONL session recordings (gitignored)
```

- `apps/ingest` deps: `fastify`, `ws`, `undici`. Dev deps: `tsx`, `vitest`, `typescript`.
- Scripts in `apps/ingest/package.json`: `dev` (`tsx watch src/main.ts`), `test`
  (`vitest run`), `record` (`tsx src/tools/record.ts`), `replay` (`tsx src/tools/replay.ts`).
- `.gitignore`: `node_modules`, `data/recordings`, `.next`, `dist`.

**Acceptance**: `pnpm install` succeeds; `pnpm -r exec tsc --noEmit` passes with a
placeholder `src/main.ts`.

---

## Task 1 — SignalR feed client (`apps/ingest/src/feed/`)

The F1 live timing feed is classic ASP.NET SignalR (protocol 1.5), NOT SignalR Core.
Implement a minimal client by hand — do not pull in a SignalR library.

### 1a. `feed/connect.ts` — negotiate + websocket

1. **Negotiate**:
   `GET https://livetiming.formula1.com/signalr/negotiate?connectionData=%5B%7B%22name%22%3A%22Streaming%22%7D%5D&clientProtocol=1.5`
   (connectionData is URL-encoded `[{"name":"Streaming"}]`). Send a browser-like
   `User-Agent`. From the response take: JSON body field `ConnectionToken`, and the
   `Set-Cookie` response headers (must be echoed back on connect).
2. **Connect** via WebSocket:
   `wss://livetiming.formula1.com/signalr/connect?transport=webSockets&clientProtocol=1.5&connectionToken=<URL-encoded token>&connectionData=<same encoded value>`
   with headers `Cookie` (from step 1), `User-Agent`, `Accept-Encoding: gzip,identity`.
3. On open, send the subscribe frame:
   ```json
   {"H":"Streaming","M":"Subscribe","A":[["Heartbeat","TimingData","TimingAppData","TimingStats","DriverList","SessionInfo","SessionData","TrackStatus","RaceControlMessages","WeatherData","CarData.z","Position.z","TeamRadio","LapCount","ExtrapolatedClock","TopThree","PitLaneTimeCollection","ChampionshipPrediction"]],"I":1}
   ```
4. Export `connectFeed(onMessage: (topic: string, data: unknown, ts: string) => void, onSnapshot: (state: Record<string, unknown>) => void): FeedHandle` where `FeedHandle`
   has `close()`.

### 1b. Message parsing

Every websocket frame is JSON. Three shapes matter:
- **Keepalive**: `{}` — ignore.
- **Subscribe reply**: `{"R": { "<Topic>": <fullState>, ... }, "I":"1"}` — this is the
  full initial snapshot for every subscribed topic. Route to `onSnapshot`.
- **Updates**: `{"M": [ {"H":"Streaming","M":"feed","A":[ "<Topic>", <patch>, "<utc timestamp>" ]}, ... ]}` — route each `A` tuple to `onMessage`.

### 1c. `feed/inflate.ts` — compressed topics

Topics whose name ends in `.z` (`CarData.z`, `Position.z`) deliver a **base64 string**
instead of an object. Decode: `zlib.inflateRawSync(Buffer.from(s, "base64")).toString("utf8")`
then `JSON.parse`. Strip the `.z` suffix when routing onward (emit as `CarData`,
`Position`). This applies both in the `R` snapshot and in `M` patches.

### 1d. Reconnect

Wrap the whole connect flow in a supervisor: on socket close/error, retry with
exponential backoff (1s → 2s → 4s … cap 30s, with jitter). On reconnect the `R` reply
gives a fresh snapshot — emit it via `onSnapshot` so downstream state resets cleanly.

**Acceptance**: a `tools/record.ts` script (Task 2) connects during any live session —
or unit tests pass for: negotiate URL construction, frame parsing of all three shapes
(use hard-coded fixture strings), and `.z` inflation round-trip (compress a fixture with
`deflateRawSync`, verify inflation).

---

## Task 2 — Recorder & replayer (`apps/ingest/src/tools/`)

Development happens against recordings, not live sessions. Build these before any UI.

### 2a. `tools/record.ts`
Connect with the Task 1 client and append every event to
`data/recordings/<session-slug>.jsonl`, one JSON object per line:
```json
{"kind":"snapshot","ts":1719849600000,"state":{...}}
{"kind":"update","ts":1719849601234,"topic":"TimingData","data":{...}}
```
`ts` is local receive time (ms epoch). Flush per line (append stream).

### 2b. `tools/fetch-replay.ts` — historical sessions (no live session needed)
F1 publishes every past session as static files. This makes fixtures available
immediately:
1. `GET https://livetiming.formula1.com/static/<year>/Index.json` → list of meetings
   with `Path` values.
2. For a session path `P` (e.g. `2024/2024-03-02_Bahrain_Grand_Prix/2024-03-02_Race/`),
   fetch `https://livetiming.formula1.com/static/<P><Topic>.jsonStream` for each topic
   (e.g. `TimingData.jsonStream`, `CarData.z.jsonStream`).
3. Each `.jsonStream` line is `<HH:MM:SS.mmm><json>` — a session-relative timestamp
   immediately followed by JSON (no separator; the JSON starts at the first `{` or `"`).
   Parse both, inflate `.z` payloads, merge all topics sorted by timestamp, and write the
   same JSONL format as 2a (synthesize `ts` from an arbitrary epoch + offset). The first
   line of each topic stream is that topic's initial state → fold all of them into one
   leading `snapshot` line.
4. If any endpoint 404s or the format differs, log the raw first 500 bytes and adapt —
   verify empirically rather than trusting this doc.

### 2c. `tools/replay.ts` + `feed/replaySource.ts`
`replaySource(file, speed)` implements the same interface as `connectFeed` but reads the
JSONL and emits events preserving inter-event timing scaled by `speed` (e.g. `--speed 10`).
The ingest server (Task 4) must accept `--replay <file>` to use this source instead of
the live feed.

**Acceptance**: `pnpm --filter ingest record` produces a growing JSONL during a live
session, OR `fetch-replay` produces a JSONL for a 2024/2025 race; `replay --speed 50`
re-emits it. Commit one small recording (a few minutes trimmed) as a test fixture under
`apps/ingest/test/fixtures/`.

---

## Task 3 — State store & merge engine (`apps/ingest/src/state/`)

### 3a. `state/merge.ts` — the critical piece; test heavily
The feed sends deep partial patches. Implement `deepMerge(target, patch)`:
- Objects: merge recursively, key by key.
- **Arrays are patched as objects with numeric string keys**: a patch of
  `{"Lines": {"3": {...}}}` against an array means "merge into index 3". If the target
  at that path is an array and the patch is a plain object whose keys are all numeric
  strings, apply per-index merges (growing the array if needed). If the patch is an
  actual array, replace wholesale.
- Scalars/null: replace.
- Special key `"_deleted"` (array of keys) inside a patch object: delete those keys from
  the target. (Seen on `RaceControlMessages` and others; keep the handling generic.)

### 3b. `state/store.ts`
`SessionStore` holds `raw: Record<Topic, unknown>` (merged per topic) and applies:
- snapshot → replace all topics;
- update → `raw[topic] = deepMerge(raw[topic], patch)`.
It emits `('update', topic)` events after each apply.

### 3c. `state/transform.ts` — raw feed → clean `SessionState`
Map the raw topics into the shared `packages/types` model (define it there now, per the
sketch in PLAN.md §4). Key mappings, verified against real data — where reality differs,
trust the recording:
- `DriverList` → driver identity: `Tla`, `FullName`, `TeamName`, `TeamColour` (hex
  without `#`), `Line` (tower position), `HeadshotUrl`.
- `TimingData.Lines[num]` → `Position`, `GapToLeader`, `IntervalToPositionAhead.Value`,
  `LastLapTime {Value, OverallFastest, PersonalFastest}`, `BestLapTime`,
  `Sectors[] {Value, OverallFastest, PersonalFastest, Segments[] {Status}}`
  (segment status codes: 2048=set/yellow-ish base, 2049=personal best/green,
  2051=overall best/purple, 2064=pit — verify empirically and centralize in one enum),
  `InPit`, `PitOut`, `NumberOfPitStops`, `Retired`, `KnockedOut`, `Stopped`.
- `TimingAppData.Lines[num].Stints[]` → `Compound` (`SOFT|MEDIUM|HARD|INTERMEDIATE|WET`),
  `New` ("true"/"false" strings), `TotalLaps` (tyre age), `StartLaps`.
- `TrackStatus.Status`: "1"=AllClear, "2"=Yellow, "4"=SCDeployed, "5"=Red, "6"=VSC,
  "7"=VSCEnding.
- `SessionInfo` → `Meeting.Name`, `Name` (session name), `Type`, `StartDate`, `Path`.
- `ExtrapolatedClock` → `Remaining`, `Extrapolating`, `Utc`. `LapCount` →
  `CurrentLap`, `TotalLaps`.
- `WeatherData` → all-numeric-string fields; parse to numbers.
- `RaceControlMessages.Messages[]` → `Utc`, `Category`, `Message`, `Flag`, `Scope`,
  `Sector`. Note: arrives as array initially, then object-keyed patches (3a handles it).
- `CarData.Entries[] { Utc, Cars: { [num]: { Channels: { "0": rpm, "2": speed(kph), "3": gear, "4": throttle, "5": brake, "45": drs } } } }`.
  DRS channel: values 10, 12, 14 = DRS open; 8 = eligible; else closed.
- `Position.Position[] { Timestamp, Entries: { [num]: { Status, X, Y, Z } } }`
  (coordinates in cm, need scaling/rotation per circuit for the map — Task 8).

### 3d. `state/derived.ts` — computed data
Maintained incrementally on each update:
- `lapHistory[num]`: append `{lap, timeMs, compound}` whenever `NumberOfLaps` increments
  and `LastLapTime.Value` is non-empty. Parse `"1:23.456"` → ms with a helper
  (`parseLapTime`), handle `""` and `null`.
- `gapHistory[num]`: per completed leader lap, snapshot each driver's gap-to-leader in ms
  (parse `"+12.345"`, `"1 L"` → mark `lapped: true`).
- `battles`: pairs with interval < 1.0s (race only).

**Acceptance**: vitest suite where the fixture recording is replayed through
`SessionStore` + transform and assertions check: final classification order matches the
real session result, no crashes on any message, a mid-recording state snapshot matches a
committed golden JSON (`expect(state).toMatchSnapshot()` on selected paths). Merge
engine has direct unit tests for: nested merge, numeric-string-key array patch, `_deleted`,
scalar replace, patch-onto-undefined.

---

## Task 4 — Ingest HTTP/SSE server (`apps/ingest/src/server.ts`, `src/main.ts`)

Fastify app, port `4000` (env `PORT`):
- `GET /api/health` → `{ ok: true, source: "live"|"replay", connected: boolean }`.
- `GET /api/sse` → SSE stream. On connect, immediately send
  `event: snapshot` with the full transformed `SessionState`, then per store update send
  `event: update` with `{ topic, state: <transformed slice or full state> }`.
  **Simplification for v1: send the full transformed state on every flush** — it is a
  few tens of KB; optimize to patches later only if measured to matter.
- **Throttle**: coalesce updates and flush at most every 250ms. Exception: bypass
  throttle for `TrackStatus` and `RaceControlMessages` (flush immediately).
- Heartbeat comment line every 15s to keep proxies from killing the stream.
- CORS: allow `http://localhost:3000` (env-configurable origin).
- `main.ts`: parse args (`--replay <file>`, `--speed <n>`), wire
  feed/replay source → store → transform → server. Log topic message counts every 30s.

**Acceptance**: with `--replay` on the fixture, `curl -N localhost:4000/api/sse` shows a
snapshot then a steady stream of updates; two concurrent curls both receive data;
killing the replay mid-stream doesn't crash the server.

---

## Task 5 — Shared types package (`packages/types`)

Finalize `SessionState` (PLAN.md §4 sketch, refined by what Task 3 actually produced),
plus `SseEvent` union. No runtime code. Both apps depend on it via
`"@f1-dash/types": "workspace:*"`.

**Acceptance**: `tsc --noEmit` passes in all packages with the ingest transform typed
against these types (no `any` leaks at module boundaries).

---

## Task 6 — Web app scaffold + live store (`apps/web`)

- `pnpm create next-app` (App Router, TS, Tailwind, no src dir opinion — pick `src/`).
  Add `zustand`.
- `src/lib/liveStore.ts`: zustand store `{ state: SessionState | null, connected: boolean, delayMs: number }`.
- `src/lib/sse.ts`: `EventSource` to `NEXT_PUBLIC_INGEST_URL/api/sse`.
  **Delay buffer**: push incoming events into a queue with their event timestamp; a 100ms
  interval drains events whose `ts <= now - delayMs` into the store. `delayMs = 0` drains
  immediately. Auto-reconnect is native to EventSource; reflect `connected` state.
- Components must subscribe to slices (`useLiveStore(s => s.state?.drivers)` etc. with
  shallow compare) — never the whole state — so telemetry ticks don't re-render the tower.
- Dark theme, data-dense: base bg `#0a0a0a`, tabular-nums font for all timing values
  (`font-variant-numeric: tabular-nums`).

**Acceptance**: page shows raw connection status + session name + track status string,
updating live against the replaying ingest server.

---

## Task 7 — MVP dashboard UI

Layout (`/` route, desktop-first, CSS grid):
```
┌──────────────────────────────────────────────────────────┐
│ Header: session name | clock/laps | weather | trk status │
├───────────────────────────────┬──────────────────────────┤
│ Timing tower (left, ~60%)     │ Track map (Task 8)       │
│                               ├──────────────────────────┤
│                               │ Race control feed        │
└───────────────────────────────┴──────────────────────────┘
```

### 7a. Timing tower (`components/TimingTower.tsx`)
One row per driver, ordered by `line`. Columns: position, team-color bar + TLA, interval,
gap to leader, last lap, best lap, S1/S2/S3, mini-sector segment dots, tyre
(compound letter in compound color: SOFT red, MEDIUM yellow, HARD white, INTER green,
WET blue) + age, pit/status chip (IN PIT / OUT / STOPPED / OUT OF SESSION).
- Timing value colors: purple `#a855f7` overall fastest, green `#22c55e` personal best,
  white otherwise, gray for stale (previous-lap) values.
- Animate row reorder with CSS transform transitions on `line` change (FLIP or
  `framer-motion` `layout` prop — keep it cheap).
- Row highlight flash on position change (green up / red down arrow shown ~4s).

### 7b. Header (`components/SessionHeader.tsx`)
Session + meeting name, `Remaining` countdown (extrapolate client-side between updates
when `Extrapolating` is true), `LapCount` for races, weather chips (air/track/wind/rain),
track status banner spanning full width when not green (yellow/SC/VSC/red with color +
label, pulsing).

### 7c. Race control feed (`components/RaceControl.tsx`)
Reverse-chronological list, auto-scroll pinned to newest unless user has scrolled up,
flag messages get colored left borders, per-message UTC → session-clock time.

### 7d. Delay control (`components/DelayControl.tsx`)
Header widget: number input + quick presets (0s, 10s, 30s, 45s, custom), persisted to
`localStorage`. Wired to the Task 6 buffer.

**Acceptance**: run against a replayed race at `--speed 1`: tower orders correctly,
sector colors match expectations for known moments in the fixture, delay slider visibly
delays updates, no dropped frames scrolling the RC feed (verify with React profiler that
tower rows don't re-render on weather updates).

---

## Task 8 — Track map (`components/TrackMap.tsx`)

1. Circuit outline: `GET https://api.multiviewer.app/api/v1/circuits/<circuitKey>/<year>`
   (`circuitKey` comes from `SessionInfo.Meeting.Circuit.Key`). Response contains `x`/`y`
   polyline arrays plus `corners` and `marshalSectors`. Fetch server-side in Next
   (route handler with 24h cache) to avoid CORS. If this API is unavailable, fall back
   to building the outline from one recorded lap of `Position` data of any driver.
2. Render as SVG: compute bounding box, `viewBox` fit, rotate per circuit `rotation`
   field. Track drawn as a fat gray stroke path.
3. Cars: one `<g>` per driver — circle in team color + TLA label. Positions come from the
   `Position` topic (~4-5 Hz per batch): interpolate between the last two samples with
   `requestAnimationFrame`, lerping x/y. Hide cars with status not `"OnTrack"`.
4. Flag overlay: color marshal sector path segments yellow when `RaceControlMessages`
   yellow-flag messages carry a `Sector` scope (clear on green); full-track tint for
   SC/VSC/red from `TrackStatus`.

**Acceptance**: on the replay, dots travel around the correct circuit outline smoothly
(no teleporting except through pit lane), and a known yellow-flag moment in the fixture
colors the right sector.

---

## Task 9 — Session-specific modes

Switch on `SessionState.session.type`:
- **Race**: battle chips in tower (interval < 1.0s → subtle link + DRS badge on the
  chasing car when `drs` open); pit stop log panel (`PitLaneTimeCollection` gives pit-lane
  times, stationary time only if present — otherwise show pit-lane time and label it);
  gap-evolution line chart from `gapHistory` (plain SVG or visx, one line per driver,
  team colors, toggleable per driver).
- **Qualifying**: derive current segment (Q1/Q2/Q3) from `TimingData.SessionPart`;
  visually separate the drop zone (bottom 5 in Q1/Q2 with `TimingData` cutoff logic);
  strike-through `KnockedOut` drivers; show delta-to-provisional-pole column instead of
  gap-to-leader.
- **Practice**: tower sorts by best lap; long-run panel from `derived.lapHistory` —
  group consecutive laps on one stint, stints with ≥5 non-pit laps within 107% of the
  stint median count as long runs, show compound + lap count + average.

**Acceptance**: replay one recording of each session type; correct mode renders, quali
drop zone matches the real elimination results at the segment ends.

---

## Task 10 — No-session & schedule (idle state)

- `GET https://api.jolpi.ca/ergast/f1/current.json` (Jolpica) for the season schedule;
  route handler with 6h cache.
- When ingest reports no live data (`/api/health` `connected: false` or no snapshot):
  render countdown to next session (all sessions of the next weekend, user's local
  timezone) + last race podium (`/current/last/results.json`).

**Acceptance**: with ingest stopped or idle, the page shows the schedule view instead of
an empty dashboard, and recovers automatically (poll health every 30s / SSE reconnect)
when the stream comes back.

---

## Task 11 — Deploy & ops

- Dockerfiles for `apps/ingest` and `apps/web` (standalone Next output);
  `docker-compose.yml` wiring them, web receives `NEXT_PUBLIC_INGEST_URL`.
- Ingest env: `PORT`, `ALLOWED_ORIGIN`, `RECORD=true|false` (record every live session
  automatically when true), `DATA_DIR`.
- Structured logs (pino) with per-topic counters; `/api/health` exposes last-message age
  so an external monitor can alert on a stalled feed.

**Acceptance**: `docker compose up` serves the dashboard on :3000 against a replay file
mounted into the ingest container.

---

## Later (do not start unless asked)
Telemetry traces panel and head-to-head, team radio player (`TeamRadio` gives relative
audio paths under `livetiming.formula1.com/static/<SessionPath>`), lap-time scatter,
stint strategy bars, championship prediction panel, favorite-driver pinning, mobile
layout pass, multi-screen kiosk mode.

## Ground rules for the executing agent
1. **Verify feed formats empirically.** Field names above are believed-correct but the
   recording is the source of truth; when they disagree, fix this doc in the same commit.
2. **Never develop against the live feed** except in Task 1/2 verification; everything
   else runs on replays.
3. Keep the merge engine (Task 3a) dependency-free and 100% unit-tested — it is the
   highest-risk component.
4. Commit per task, message `task(N): <summary>`, and update a `PROGRESS.md` checklist
   (task id, status, deviations from this doc) so any agent can resume.
5. Do not add auth, databases, or queues — out of scope for v1.
