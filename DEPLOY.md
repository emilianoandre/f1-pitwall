# Deployment

This app has **two** deployable pieces with different hosting needs:

| Part | What it is | Where it can run |
|------|------------|------------------|
| `apps/web` | Next.js frontend + two cached proxy routes | **Vercel** (or any Next.js host) |
| `apps/ingest` | Long-running SSE server: holds a WebSocket to F1, in-memory session state, and the seekable player | **A container/VM host** — *not* Vercel |

> **Why ingest isn't on Vercel:** Vercel runs short-lived, stateless serverless
> functions. The ingest service holds a persistent SignalR WebSocket to F1,
> keeps merged race state and a loaded recording (tens of MB) in memory, and
> streams SSE for the life of a session. That's a stateful long-running server,
> which the serverless model can't host. So the frontend goes on Vercel and the
> ingest runs as an always-on container elsewhere.

The browser talks to the ingest service **directly** (for the SSE stream and
player controls), so the ingest just needs a public URL and CORS pointed at your
Vercel domain.

---

## 1. Deploy the frontend to Vercel

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **New Project → import the repo**.
3. Set **Root Directory** to `apps/web`. Vercel detects Next.js and reads
   `apps/web/vercel.json` (install/build commands are already set for the pnpm
   workspace). If Vercel asks, enable *"Include files outside the root directory"*
   so the `@f1-dash/types` workspace package is available at build time.
4. Add an **Environment Variable**:
   - `NEXT_PUBLIC_INGEST_URL` = the public URL of your ingest service
     (e.g. `https://f1-ingest.up.railway.app`) — see step 2.
   > This is a `NEXT_PUBLIC_*` var, so it's baked into the client bundle at build
   > time. If you change it later, **redeploy** for it to take effect.
5. Deploy. Note your Vercel URL (e.g. `https://your-app.vercel.app`).

You can deploy the frontend before the ingest exists — it will just show the
schedule / "no live session" idle view until `NEXT_PUBLIC_INGEST_URL` points at a
running ingest.

## 2. Deploy the ingest service (a container host)

The ingest ships a production `Dockerfile` (`apps/ingest/Dockerfile`, build
context = repo root). Any Docker-capable host works — Railway, Render, Fly.io,
a VPS, etc. Configure:

- **Build**: from `apps/ingest/Dockerfile` with build context = repo root.
- **Env vars** (see `apps/ingest/.env.example`):
  - `PORT` — the port the platform expects (many set this automatically).
  - `ALLOWED_ORIGIN` = your Vercel URL, e.g. `https://your-app.vercel.app`
    (this is the CORS allowlist for the SSE stream + control API).
  - `DATA_DIR` = `/data/recordings` (mount a volume here to persist downloaded
    sessions across restarts; optional — they re-download on demand).
- **Expose** the port publicly and copy that URL into the web app's
  `NEXT_PUBLIC_INGEST_URL`, then redeploy the web app.

Example with Docker directly:

```bash
docker build -f apps/ingest/Dockerfile -t f1-ingest .
docker run -p 4000:4000 \
  -e ALLOWED_ORIGIN=https://your-app.vercel.app \
  -e DATA_DIR=/data/recordings \
  -v $(pwd)/data/recordings:/data/recordings \
  f1-ingest
```

The ingest starts in **player mode** (users pick sessions from the UI). To run it
permanently connected to the live feed instead, set the container command to
`pnpm exec tsx src/main.ts --live`.

## 3. Wire them together

```
Browser ──HTTPS──▶ Vercel (apps/web)         static UI + /api/circuit, /api/schedule
   │
   └────SSE / POST──▶ ingest host (apps/ingest)   NEXT_PUBLIC_INGEST_URL
                          │
                          └──▶ F1 live timing feed / static archive
```

Checklist:
- [ ] `NEXT_PUBLIC_INGEST_URL` on Vercel = ingest public URL (then redeploy web)
- [ ] `ALLOWED_ORIGIN` on ingest = Vercel URL
- [ ] Both use `https://` in production (mixed content is blocked otherwise)

## Notes & caveats

- **HTTPS both sides.** A Vercel (https) page cannot open an SSE stream to an
  `http://` ingest — the browser blocks it. Make sure the ingest host serves TLS.
- **Team radio audio** is fetched by the browser directly from
  `livetiming.formula1.com` (unaffected by where you host).
- **Docker compose** (`docker-compose.yml`) runs both parts together for local /
  single-box hosting; it has not been executed end-to-end in the build
  environment (no Docker there), but the Dockerfile paths are validated against
  the real build output.
- **All-Vercel is not possible** without re-architecting the player to run in the
  browser and dropping live mode (or fronting it with an external realtime
  service). The split above is the intended production shape.
