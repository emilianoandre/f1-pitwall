# LaunchDarkly Feature Flags

This project uses LaunchDarkly for feature flag management.

## SDK context (this repo)
- SDKs: `@launchdarkly/node-server-sdk` (apps/ingest, server-side), `launchdarkly-react-client-sdk` (apps/web, client-side)
- Initialization: `apps/ingest/src/launchdarkly.ts` (called from `main.ts`); `apps/web/src/components/LaunchDarklyProvider.tsx` (used in `app/layout.tsx`)
- Key env vars: `LAUNCHDARKLY_SDK_KEY` (apps/ingest, secret), `NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID` (apps/web, not a secret) — never hardcode either in source
- Full reference: `LAUNCHDARKLY.md` at the repo root

## Agent: use LaunchDarkly skills (required)

The LaunchDarkly agent skills below are already installed under `.claude/skills/`. For any substantive flag work, **open that skill's `SKILL.md` and follow it** — do not improvise from generic flag advice alone.

| Skill | When to use it |
|-------|------------------|
| `launchdarkly-flag-create` | User wants a new flag, code wiring, feature toggle, or experiment setup. |
| `launchdarkly-flag-discovery` | User wants flag inventory, debt/stale-flag audit, health, or removal readiness. |
| `launchdarkly-flag-targeting` | User wants who sees a flag, rollouts, targeting rules, or environment promotion. |
| `launchdarkly-flag-cleanup` | User wants a flag removed from code safely, archive/cleanup workflows, or MCP-driven removal. |

**Invocation:** Match the user's request to the skill `description` in each skill's frontmatter, or use the editor's slash/plugin command for that skill if configured.

**Tools:** When a skill lists LaunchDarkly MCP tools as required, use MCP (already connected, see `.mcp.json`); do not skip validation steps.

## Conventions (summary)
- Prefer boolean flags unless multivariate is required; use descriptive kebab-case keys (e.g. `enable-checkout-v2`).
- Always pass a fallback when evaluating flags; use a meaningful evaluation context (user key, org, etc.).
- Server-side SDK keys stay secret; client-side IDs may appear in browser code.
- Do not evaluate flags in tight loops without caching.
- Archive or remove flag code when a flag is fully rolled out and the team agrees — use `launchdarkly-flag-cleanup` (and `launchdarkly-flag-discovery` first if assessing candidates).
