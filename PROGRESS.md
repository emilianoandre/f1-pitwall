# Progress

Checklist tracking execution of IMPLEMENTATION.md. Update as tasks complete.

| Task | Status | Notes / deviations |
|------|--------|--------------------|
| 0. Monorepo scaffold | ✅ done | pnpm 11.9 (installed globally, no corepack). Node 26. esbuild builds approved in pnpm-workspace.yaml. |
| 5. Shared types | ✅ done | Built up front (Task 0) since all code depends on it. `SseEvent` sends full state per event (v1 simplification per Task 4). |

**All tasks (0–11) complete. Visually verified in a real browser (Playwright/Chromium).**

## Player / scrubber feature set (post-MVP)
Added a seekable "movie player" mode, recording picker, and yellow-flag map.
- **Seekable Player** (`apps/ingest/src/player/player.ts`) — loads a recording,
  builds ~40 keyframes (raw + derived state) so it can jump backward/forward
  instantly, plays at variable speed. 5 tests incl. seek-backward==seek-forward.
- **Recording registry + download-on-demand** (`player/registry.ts`,
  `recording/download.ts`) — lists downloaded + archive-available sessions per
  year; downloads a session from the F1 archive on first use with progress.
- **Control API + player mode** — `/api/recordings`, `/api/recordings/download`,
  `/api/download/:id`, `/api/player/load`, `/api/player/control`; SSE events carry
  `PlayerStatus`. Ingest defaults to player mode (`--live` for the live feed).
- **Frontend** — `RecordingPicker` (list/download/load), `TransportBar`
  (play/pause, scrubber, ±30s, speed 0.5–100×). SSE client applies player status
  instantly and bypasses the delay buffer in player mode.
- **Yellow flags on the track map** — `activeYellowSectors()` replays race-control
  sector flags; `buildMarshalSectorPaths()` splits the outline per marshal sector;
  flagged sectors pulse yellow. Whole-track tint reserved for SC/VSC/red.

### Verified in-browser (Playwright)
Picker lists 76 sessions (downloaded marked green); loading qualifying populates
the dashboard; play advances the playhead at the set speed; scrubbing works;
seeking into the sector-14 yellow window renders exactly one highlighted marshal
sector. Zero console errors.

## Pit stops, tyre degradation, catch-up forecast (follow-up)
- **Pit stops**: `PitLaneTimeCollection.PitTimes` entries are ephemeral (shown
  briefly, then `_deleted`), so the Deriver now accumulates them (dedupe by
  driver+lap; duration refinements overwrite) → `pitStops` in SessionState.
  Rendered as a pit-stop log in the Tire Strategy panel (TLA, lap, pit-lane
  time; fastest in purple). Verified: 42 stops in Spanish 2024 race; unit test.
- **Tyre degradation**: client-side (`lib/pace.ts`) — regression slope of the
  current stint's representative laps (in/out laps >107% of median dropped;
  needs ≥4 laps) → per-driver "+0.12s/lap" readout on each Tire Strategy row,
  color-coded (green flat / amber mild / red heavy).
- **Catch-up forecast**: recent-pace delta (avg last 3 representative laps) +
  current interval → "HAM closing 0.42s/lap · DRS in ~3 laps" / "losing …" /
  "in DRS range" lines between the Head-to-Head rows.
- Verified in-browser on the 2026 Australian GP race (downloaded via the picker):
  17 stop entries, 15 deg readouts, forecast line rendering. 40 backend tests.

## Team radio + panel refinements (follow-up)
- **Team Radio**: parse `TeamRadio.Captures` → `teamRadio` clips in SessionState
  (utc, racingNumber, tla, team, colour, absolute mp3 URL = static base + session
  path + Path). New `RadioPanel` with two tabs (Team Radio | Race Control), a
  **per-team filter** (All teams + each team with colour dot), and audio playback
  (team-colored play buttons, single shared `<audio>`). Verified: 102 clips,
  Ferrari filter → SAI/LEC only, audio URLs return 200 audio/mpeg.
- **Audio / Transcript toggle** on the Team Radio panel. The feed has no audio
  transcript, so "Transcript" shows each clip's driver-associated race-control
  text (most recent message mentioning that driver up to the clip time — same
  source as driver-detail radio); clips with no related text show a note + keep
  playback. Not a literal audio transcript (no STT available/needed).
- **Sector Times & Tire Strategy** now scroll to show all 20 drivers.
- **Driver Detail**: added Car Ahead / Car Behind gap panels (red/green) and a
  Last 10 Laps list (lap #, compound, time; fastest purple).

## "Trackside Broadcast" redesign (design_imp handoff)
Recreated the broadcast-TV design (F1 red on near-black, Saira/Saira Condensed/
Martian Mono, sharp corners, team liveries as accents) in the existing Next.js
stack, wired to the real feeds. Verified in-browser at high fidelity, zero errors.
- **Design system** (`lib/design.ts`, `globals.css`, fonts in `layout.tsx`) — CSS
  tokens, keyframes (blink/pulse/rise), broadcast scrubber, `contrastText`,
  compound + timing colors, `Panel` primitive.
- **Screen nav** in store (`picker | dashboard | driver`) + `focus` driver state
  (`useFocusNumber` → explicit selection or current leader).
- **Session Picker** (`broadcast/SessionPicker.tsx`) — PitWall brand, live hero
  from the schedule, Season Archive grid **grouped per Grand Prix** with clickable
  session chips (download-on-demand, downloaded=green, "N saved" badge), year
  segmented control.
- **Dashboard** (`broadcast/*`) — grid-areas layout: Track Map (team-color driver
  badges, layered asphalt, yellow marshal sectors), Live Timing board (team pos
  blocks, DRS/PIT chips, tire squares, sub-1s green intervals, click to focus),
  Telemetry (speed/gear/DRS/throttle/brake/rpm + speed-trace ring buffer), Sector
  Times (purple/green), Tire Strategy gantt (playhead), Weather tiles, Race Control
  feed, Head-to-Head around focus. Sticky top bar (Live/Replay toggle, LAP,
  remaining, flag chip) + broadcast transport.
- **Driver Detail** — hero (car number in team color), live telemetry, lap-time
  trend (purple best-lap dot), last-lap sector bars, driver radio.
- Old MVP components (TimingTower, RaceControl, TrackMap, SessionPanel, GapChart,
  RaceStrategy, LongRuns, DelayControl, TransportBar, RecordingPicker, ModeToggle,
  SessionHeader) removed; IdleView kept for the live-idle state.

## Live/Replay switch + picker grouping + year filter (follow-up)
- **Runtime mode switch** (`apps/ingest/src/mode.ts`) — `ModeController` with an
  `ActiveSource` proxy + `LiveController`; `POST /api/mode` flips between the live
  feed and the recording player without restarting. SSE events + health carry
  `mode`; loading a recording auto-switches to player mode. Frontend `ModeToggle`
  (Live | Replay) in the header; live mode shows the delay control + idle/schedule,
  player mode shows the transport bar. Verified: toggle flips server mode, live
  shows idle (no active session), replay restores.
- **Recording picker grouped per Grand Prix** — collapsible groups with a
  per-GP "N downloaded" badge; groups with downloads auto-expand. Verified: 15
  groups, PLAY/DOWNLOAD per session.
- **Year filter fix** — downloaded recordings from other seasons no longer leak
  into every year (`registry.list` filters orphans by `yearFromId`). Verified:
  2025 → 0 downloaded, 2024 → 4.

### Bug found & fixed during verification
- **Infinite render loop**: zustand selectors returning a new `[]` literal
  (`useLiveStore(s => s.state?.order ?? [])`) break `useSyncExternalStore`'s
  caching → "Maximum update depth exceeded". Only triggered once `state` could be
  null (empty player state / the moment a recording loads before its first
  snapshot). Fixed by moving the `?? []` default outside the selector across all
  components.

## Browser verification (Playwright)
Drove Chromium against ingest-replay + web for every view. Scripts in
`apps/web/scripts/*.mjs`. Results:
- **Qualifying** — tower, team colours, quali gap deltas, mini-sector segments,
  tyre compound badges, Q1 segment + drop-zone (16–20 tinted red). ✓
- **Practice** — long-run pace table (compound badge + avg + lap count), no drop zone. ✓
- **Race** — LAP counter, live battles (<1s), broadcast-style stint/stop bars,
  20-line gap-to-leader chart with pit jumps. ✓
- **Track map** — Catalunya outline + cars at true positions (pit-lane cluster
  when parked, spread on-track when running). ✓
- **Idle/schedule** — next race (British GP), FP1 countdown, sprint-weekend
  timetable, last-race podium — all from live 2026 Jolpica data. ✓
- Zero console errors after the CORS fix below.

### Bug found & fixed during verification
- **SSE CORS**: `/api/sse` writes to `reply.raw`, bypassing `@fastify/cors`'s
  hooks, so the browser blocked the stream and the page fell back to the idle
  view. Fixed by setting `Access-Control-Allow-Origin` on the raw SSE response
  (`apps/ingest/src/server.ts`).

### Test-script note
Several DOM text checks needed to be case-insensitive: Tailwind's `uppercase`
class makes `innerText` return upper-cased text, so exact-case `includes()`
checks gave false negatives (panels were actually rendering).
| 1. SignalR feed client | ✅ done | Hand-rolled SignalR 1.5 client (negotiate + ws + subscribe), reconnect w/ backoff. 15 unit tests. |
| 2. Recorder & replayer | ✅ done | record.ts, fetch-replay.ts (static archive), replay source. Validated by fetching real Spanish 2024 quali (41MB). |
| 3. State store & merge engine | ✅ done | Merge engine (12 tests), transform, deriver. Engine test replays real quali → exact classification (NOR pole). 33 tests total. |
| 4. Ingest SSE server | ✅ done | Fastify SSE, full-state per event, 250ms throttle, immediate flush for TrackStatus/RaceControl, health w/ last-msg age. Verified: snapshot+updates, concurrent clients, replay loop. |
| 6. Web app scaffold + live store | ✅ done | Next 15 + React 19 + Tailwind v4 + zustand. SSE client w/ 100ms drain + delay buffer. Builds + typechecks. |
| 7. MVP dashboard UI | ✅ done | Timing tower (sectors/segments/tyres/status), SessionHeader w/ extrapolated clock + weather + flag banner, RaceControl feed, DelayControl. E2E data path verified via SSE consumer. |
| 8. Track map | ✅ done | Cached MultiViewer circuit route, SVG outline w/ rotation+bbox, rAF-eased car dots from Position topic (same coord frame), flag-colored track. Data path verified; full recording drives cars. |
| 9. Session-specific modes | ✅ done | Race: battles + stint strip + gap-evolution chart. Quali: segment badge + drop-zone (cutoff Q1→15/Q2→10/Q3→null, verified) + tower tint. Practice: long-run pace table (in/out laps excluded). |
| 10. No-session & schedule | ✅ done | Jolpica schedule route (6h cache) → verified vs live 2026 season. IdleView w/ next-session countdown + weekend timetable + last podium. Auto-recovers via open SSE update events. |
| 11. Deploy & ops | ✅ done | Dockerfiles (ingest via tsx, web standalone), docker-compose, pino structured logs + per-topic counters, RECORD/DATA_DIR env, health exposes last-msg age. Dockerfile paths validated vs standalone output; `docker compose up` not run (no Docker in this env). |

## Environment notes
- pnpm installed via `npm install -g pnpm` (corepack unavailable on this machine).

## Verified feed facts (from real Spanish 2024 quali recording)
- DriverList/SessionInfo/TimingData/CarData channel/Stints field names all match the doc.
- **Quali gaps live in `TimingData.Lines[n].Stats[part].TimeDiffToFastest` /
  `TimeDifftoPositionAhead`**, NOT `GapToLeader`/`IntervalToPositionAhead` (those are
  race-only). transform.ts falls back to Stats for quali.
- `TimingData.SessionPart` (top-level) = current Q segment (1/2/3). `NoEntries` =
  drivers remaining per segment.
- Snapshot seeds `TimingData.Lines` as `{}` and `Sectors` as real arrays; updates patch
  them with numeric-string-keyed objects → merge engine handles both.
- Segment status codes: only 0 (unset) observed in this fixture; other codes
  (2049 green / 2051 purple / 2064 pit) centralized in `state/parse.ts segmentStatus()`,
  to be reconfirmed against a race recording.
- Fixtures: `apps/ingest/test/fixtures/spanish-2024-qualifying.jsonl` (1.7MB, CarData +
  Position stripped via make-fixture tool). Full recordings live in
  `apps/ingest/data/recordings/` (gitignored).
