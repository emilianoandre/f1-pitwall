# Deployment

Both parts of the app run on **Railway**, as two services in the same project,
both built from this repo's Dockerfiles:

| Service | What it is | Dockerfile |
|---------|------------|------------|
| `f1-web` | Next.js frontend + two cached proxy routes | `apps/web/Dockerfile` |
| `f1-ingest` | Long-running SSE server: holds a WebSocket to F1, in-memory session state, and the seekable player | `apps/ingest/Dockerfile` |

> **Why ingest needs a long-running container:** it holds a persistent
> WebSocket to F1, keeps merged race state and a loaded recording (tens of MB)
> in memory, and streams SSE for the life of a session. That rules out
> stateless serverless hosting — it needs an always-on container, which is
> why both services live on Railway rather than splitting across a serverless
> frontend host and a separate container host.

The browser never talks to `f1-ingest` directly — `f1-web`'s
`/api/ingest/[...path]` route proxies both the SSE stream and the player
control API server-side, so everything the browser touches is same-origin.
This also means the app-wide login gate (below) actually protects the live
data, rather than just the page shell — `f1-ingest`'s own public URL isn't a
back door around it (see `INGEST_SHARED_SECRET` below).

---

## Repo-level config

Railway's Railpack builder can't auto-detect a start command in this pnpm
monorepo, so both services build via Docker instead. This is configured with:

- **`railway.json`** (repo root) — `"build": { "builder": "DOCKERFILE" }`,
  shared by both services.
- **`RAILWAY_DOCKERFILE_PATH`** — a per-service variable pointing each service
  at its own Dockerfile (`apps/web/Dockerfile` / `apps/ingest/Dockerfile`).
  Both Dockerfiles use the repo root as build context, so they can `COPY`
  workspace files like `pnpm-workspace.yaml` and `packages/types`.

## Setting up a service from scratch

1. `railway add --repo <owner>/<repo> --branch main --service <name>` — links
   a new service to this repo.
2. Set `RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile` (or `apps/ingest/...`) as
   a service variable.
3. `railway domain --service <name> --port <PORT>` — generates a public
   domain. **The port must match what the container actually listens on**,
   not just what the Dockerfile's `ENV PORT` says — see gotcha below.
4. Set the remaining env vars (below), then `railway redeploy`.

## Environment variables

**`f1-web`:**
- `RAILWAY_DOCKERFILE_PATH` = `apps/web/Dockerfile`
- `INGEST_URL` = the `f1-ingest` **public** URL, server-only (used by the
  `/api/ingest` proxy). `NEXT_PUBLIC_INGEST_URL` still works as a fallback
  but nothing in the browser bundle reads it anymore.
- `APP_USERNAME` / `APP_PASSWORD` / `AUTH_SECRET` — the login gate (see
  `src/middleware.ts`). Leave all three unset to run without a login (e.g.
  local dev). `AUTH_SECRET` signs the session cookie — generate with
  `openssl rand -base64 32`.
- `INGEST_SHARED_SECRET` — sent as `x-internal-token` on every proxied
  request to `f1-ingest`; must match the same variable there.
- Set the credential/secret variables directly in the Railway dashboard's
  Variables tab rather than via the CLI, so passwords/secrets never pass
  through a terminal/chat history.

**`f1-ingest`:**
- `RAILWAY_DOCKERFILE_PATH` = `apps/ingest/Dockerfile`
- `ALLOWED_ORIGIN` = the `f1-web` public URL (CORS is mostly vestigial now
  that the browser only reaches ingest through `f1-web`'s proxy, but harmless
  to leave set)
- `DATA_DIR` = `/data/recordings`, with a volume mounted there to persist
  downloaded sessions across restarts
- `LOG_LEVEL` = `info`
- `F1_USERNAME` / `F1_PASSWORD` — an F1TV subscriber login, required for
  **live** mode only (player/replay mode doesn't touch the live feed). F1
  closed unauthenticated access to the live timing feed in 2026; see
  `apps/ingest/src/feed/auth.ts`.
- `INGEST_SHARED_SECRET` — must match `f1-web`'s value. If set, every
  request except `/api/health` must carry it, which is what makes `f1-web`'s
  login gate actually mean something instead of being bypassable by hitting
  ingest's own URL.

The ingest starts in **player mode** (users pick sessions from the UI). To run
it permanently connected to the live feed instead, set the container command
to `pnpm exec tsx src/main.ts --live`.

## Gotchas hit during setup

- **Railpack can't find a start command** in this monorepo → force the
  Dockerfile builder (see "Repo-level config" above) rather than relying on
  auto-detect.
- **`apps/web/Dockerfile` copying `packages/types/node_modules`**: that
  package has zero dependencies, so pnpm never creates a `node_modules` dir
  for it — don't `COPY` it from the deps stage.
- **Next.js standalone server binds to the wrong host.** Docker sets the
  `HOSTNAME` env var to the container ID, and Next's standalone `server.js`
  binds to `process.env.HOSTNAME` literally instead of `0.0.0.0`. Traffic from
  Railway's edge proxy can't reach a server bound to the container ID, which
  shows up as a 502 with an otherwise-healthy, running deployment. Fix:
  `ENV HOSTNAME="0.0.0.0"` in the runner stage.
- **Railway injects its own `PORT`**, which can differ from the Dockerfile's
  `ENV PORT` default. Check the actual port from `railway logs` (Next prints
  `Network: http://0.0.0.0:<port>` on boot) and make sure the service's public
  domain (`railway domain update <domain> --port <port>`) targets that same
  port — a mismatch also presents as a 502 on an otherwise-successful deploy.

## Wiring diagram

```
Browser ──HTTPS──▶ f1-web (apps/web)             login gate, static UI, /api/circuit, /api/schedule
                       │
                       └──/api/ingest/*──▶ f1-ingest (apps/ingest)    INGEST_URL + x-internal-token
                                              │
                                              └──▶ F1 live timing feed / static archive
```

Checklist:
- [ ] `INGEST_URL` on `f1-web` = `f1-ingest` public URL
- [ ] `INGEST_SHARED_SECRET` matches on both services
- [ ] `APP_USERNAME` / `APP_PASSWORD` / `AUTH_SECRET` set on `f1-web` if you want the login gate
- [ ] `ALLOWED_ORIGIN` on `f1-ingest` = `f1-web` public URL
- [ ] Both domains' target ports match what the container actually listens on
- [ ] Both use `https://` in production (mixed content is blocked otherwise)

## Notes & caveats

- **HTTPS both sides.** An `https://` page cannot open an SSE stream to an
  `http://` ingest — the browser blocks it. Railway domains are TLS by default.
- **Team radio audio** is fetched by the browser directly from
  `livetiming.formula1.com` (unaffected by where you host).
- **Docker compose** (`docker-compose.yml`) runs both parts together for local
  development.
