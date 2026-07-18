# LaunchDarkly Setup

This project uses [LaunchDarkly](https://launchdarkly.com) for feature flag management. It's wired into **both** apps in this monorepo:

## SDK Details

| | Backend (`apps/ingest`) | Frontend (`apps/web`) |
|---|---|---|
| SDK | Node.js Server SDK | React Web SDK |
| Package | `@launchdarkly/node-server-sdk` | `launchdarkly-react-client-sdk` |
| Type | server-side | client-side |
| Key type | SDK key | Client-side ID |
| Installed via | `pnpm add @launchdarkly/node-server-sdk --filter @f1-dash/ingest` | `pnpm add launchdarkly-react-client-sdk --filter @f1-dash/web` |
| Initialization | `apps/ingest/src/launchdarkly.ts` (`initLaunchDarkly()`), called from `apps/ingest/src/main.ts` before the server starts listening | `apps/web/src/components/LaunchDarklyProvider.tsx`, wraps `{children}` in `apps/web/src/app/layout.tsx` |

## Configuration

Keys are never hardcoded — both come from environment variables.

- `apps/ingest/.env` → `LAUNCHDARKLY_SDK_KEY` (server-side SDK key, secret — do not expose to the browser)
- `apps/web/.env.local` → `NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID` (client-side ID, **not** a secret — this one is meant to end up in the browser bundle)

Both files are covered by the repo's root `.env` / `.env.*` `.gitignore` entries. Placeholders are in the respective `.env.example` files.

**Note:** neither app auto-loads `.env` files at runtime (no `dotenv` dependency in `apps/ingest`; Next.js auto-loads `.env.local` for `apps/web` but not plain `.env` outside its own conventions). Locally, source `apps/ingest/.env` yourself before running `pnpm dev` (e.g. `set -a; source .env; set +a; pnpm dev`) or export the var another way. In production (Railway), set these as real environment variables on each service — same as the other env vars this project already uses (`F1_USERNAME`, `INGEST_SHARED_SECRET`, etc.).

## Where to Find Things

| What | Where |
|------|-------|
| Feature flags dashboard | https://app.launchdarkly.com/projects/default/flags |
| Project settings | https://app.launchdarkly.com/settings/projects/default |
| Environments | https://app.launchdarkly.com/settings/projects/default/environments |
| API access tokens | https://app.launchdarkly.com/settings/authorization |
| Node.js Server SDK docs | https://launchdarkly.com/docs/sdk/server-side/node-js |
| React Web SDK docs | https://launchdarkly.com/docs/sdk/client-side/react/react-web |
| LaunchDarkly docs | https://launchdarkly.com/docs |

Project key: `default`. Two environments exist: `test` (used for the local dev keys above) and `production`.

## How Feature Flags Work in This Project

1. **Backend:** `apps/ingest/src/launchdarkly.ts` holds a singleton `LDClient`, started once at process startup and awaited (`waitForInitialization`) before the server accepts traffic. Evaluate flags anywhere in `apps/ingest` via `getLaunchDarklyClient()`.
2. **Frontend:** `apps/web`'s `LaunchDarklyProvider` initializes the client-side SDK on mount and swaps in the real provider once ready (so a slow/missing connection never blocks the dashboard from rendering). Any client component inside it can call `useFlags()`.
3. Changes to flags in the dashboard take effect immediately on both sides — the server SDK streams updates, and the client SDK does too via `launchdarkly-js-client-sdk` under the hood.

### Example: Evaluating a Flag

```typescript
// Backend — apps/ingest (e.g. in a route handler, see server.ts's /api/launchdarkly-demo)
import { getLaunchDarklyClient } from "./launchdarkly.js";

const client = getLaunchDarklyClient();
const context = { kind: "user", key: "demo-user" };
const enabled = client ? await client.boolVariation("my-flag-key", context, false) : false;
```

```tsx
// Frontend — apps/web (any client component under LaunchDarklyProvider)
import { useFlags } from "launchdarkly-react-client-sdk";

function MyComponent() {
  // React SDK camelCases kebab-case keys: "my-flag-key" -> myFlagKey
  const { myFlagKey } = useFlags();
  return myFlagKey ? <p>Feature is ON</p> : <p>Feature is OFF</p>;
}
```

## First Flag (onboarding proof point)

`pitwall-launchdarkly-demo` was created as a temporary demo flag and verified end-to-end on both SDKs (default OFF → toggled ON via MCP, live update with no restart on either app → toggled back OFF). It gates:

- `GET /api/launchdarkly-demo` on `apps/ingest` (returns `{ flag, enabled, message }`)
- A banner at the top of every page in `apps/web` (`src/components/LaunchDarklyDemoBanner.tsx`)

Both are marked "safe to remove" in comments — delete them (and the flag itself, or archive it via `launchdarkly-flag-cleanup`) whenever you're done using them as a reference.

## Next Steps

### Feature Flag Best Practices
- Use flags for every new feature — wrap new features in flags so you can release and roll back independently of deployments.
- Mark flags as temporary during creation and archive them when no longer needed.
- Use descriptive, kebab-case flag keys (e.g. `enable-checkout-v2`).

### Advanced Capabilities
- **[Percentage Rollouts](https://launchdarkly.com/docs/home/targeting-flags/rollouts)** — gradually roll out features to a percentage of users.
- **[Targeting Rules](https://launchdarkly.com/docs/home/targeting-flags/targeting-rules)** — target specific users, segments, or contexts.
- **[Experimentation](https://launchdarkly.com/docs/home/about-experimentation)** — run A/B tests and measure the impact of flag variations.
- **[Guarded Rollouts](https://launchdarkly.com/docs/home/guarded-rollouts)** — automatically roll back flag changes based on metric guardrails.
- **[Observability](https://launchdarkly.com/docs/home/observability)** — monitor flag evaluations and SDK performance.

### Agent Integration (MCP Server)

The hosted LaunchDarkly MCP server is already connected in this project (`.mcp.json`, OAuth-authenticated, no tokens stored in config). With it, an agent can create/toggle flags, set up targeting, audit stale flags, run experiments, and more — all from the editor.

Four companion skills are already installed (`.claude/skills/launchdarkly-flag-*`): `launchdarkly-flag-create`, `launchdarkly-flag-discovery`, `launchdarkly-flag-targeting`, `launchdarkly-flag-cleanup`. See `.claude/rules/launchdarkly.md` for when to use each.
