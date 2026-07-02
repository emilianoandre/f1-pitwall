# PitWall — F1 Live Dashboard

Broadcast-style F1 timing dashboard (practice / qualifying / sprint / race) with live
data and seekable replays. See [`PLAN.md`](./PLAN.md) for the design,
[`IMPLEMENTATION.md`](./IMPLEMENTATION.md) for the task spec, and
[`PROGRESS.md`](./PROGRESS.md) for build status.

## Architecture

```
F1 SignalR feed ─────▶ apps/ingest ──SSE──▶ apps/web (Next.js)
F1 static archive ───▶  (live/player modes,      (PitWall UI)
                         merge/derive, player)
```

One backend holds a single connection to the data source (live feed **or** a seekable
recording player — switchable at runtime), maintains canonical session state, and fans
it out to browsers over Server-Sent Events. Circuit geometry comes from MultiViewer and
the schedule from Jolpica, both proxied + cached by Next routes.

## Prerequisites

- Node ≥ 22 and pnpm (`npm install -g pnpm`)

## Setup

```bash
pnpm install
```

## Run (player mode, default)

```bash
pnpm --filter @f1-dash/ingest dev     # terminal 1 — starts in player mode
pnpm --filter @f1-dash/web dev        # terminal 2
# open http://localhost:3000
```

The landing page is the **session picker**: a Season Archive grouped per Grand Prix
(defaults to the current year). Click any session chip — downloaded sessions (green)
load instantly, new ones are fetched from the F1 archive on first use. The dashboard
then gives you a **transport bar**: play/pause, a seekable timeline scrubber
(backward and forward), and playback speed (0.5× – 30×).

Dashboard panels: track map (live car badges + yellow-flag marshal sectors), live
timing board (click a row to focus a driver), telemetry, sector times, tire strategy,
weather, team radio (audio playback, per-team filter, transcript view) / race control,
and head-to-head. "Driver detail →" opens a per-driver page (telemetry, lap trend,
last 10 laps, gaps to the cars ahead/behind, sectors, radio).

To auto-load a recording on startup:

```bash
pnpm --filter @f1-dash/ingest dev -- --load <recordingId>
```

## Live mode

Use the **LIVE / REPLAY** toggle in the dashboard top bar, or start ingest in live mode:

```bash
pnpm --filter @f1-dash/ingest dev -- --live
```

The live feed only carries data during an active session; otherwise ingest reports
`connected:false` on `/api/health` and retries with backoff, and the UI shows the
next-session countdown.

## CLI: fetch or record sessions

```bash
pnpm --filter @f1-dash/ingest fetch-replay --list 2024                # browse sessions
pnpm --filter @f1-dash/ingest fetch-replay \
  --path "2024/2024-06-23_Spanish_Grand_Prix/2024-06-22_Qualifying/"  # download one

pnpm --filter @f1-dash/ingest record --out data/recordings/my.jsonl  # record live feed
```

Recordings land in `apps/ingest/data/recordings/` (gitignored). A trimmed fixture
(`apps/ingest/test/fixtures/spanish-2024-qualifying.jsonl`, 1.7MB) is committed for tests.

## Test & typecheck

```bash
pnpm test        # vitest: merge engine, feed parsing, player seek, classification
pnpm typecheck   # tsc across all packages
```

## Docker

```bash
docker compose up --build
```

- **web** on `http://localhost:3000`, **ingest** on `:4000`.
- Ingest starts in player mode — open the UI and pick a session as usual. Downloaded
  recordings persist in `./data/recordings` (volume-mounted into the container).
- To start in live mode or auto-load a recording, uncomment the `command:` override in
  `docker-compose.yml` (`--live` / `--load <recordingId>`).
- Deploying for real: set the `NEXT_PUBLIC_INGEST_URL` build arg on the web service to
  the ingest service's public URL — it's baked into the client bundle at build time —
  and set `ALLOWED_ORIGIN` on ingest to the web app's public origin.

Note: the compose stack is written but has not been validated end-to-end (no Docker in
the dev environment used to build this).

## Deploy (Vercel + a container host)

The frontend deploys to **Vercel**; the ingest service is a stateful long-running
server that runs as a **container elsewhere** (Railway/Render/Fly/VPS). Full
step-by-step instructions — Vercel project settings, env vars, and wiring the two
together — are in [`DEPLOY.md`](./DEPLOY.md).

## Layout

- `apps/ingest` — SignalR feed client, merge engine, state transform, seekable player,
  recording registry/downloader, SSE server, CLI tools
- `apps/web` — Next.js "Trackside Broadcast" UI (session picker, dashboard, driver
  detail) + cached proxy routes for circuit geometry and the schedule
- `packages/types` — shared `SessionState` + wire types
