# Build context is the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --filter @f1-dash/web... --frozen-lockfile=false

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/web ./apps/web
# NEXT_PUBLIC_* must be present at build time (inlined into the client bundle).
ARG NEXT_PUBLIC_INGEST_URL=http://localhost:4000
ENV NEXT_PUBLIC_INGEST_URL=$NEXT_PUBLIC_INGEST_URL
# Emit the self-contained standalone server for the runner stage below.
ENV BUILD_STANDALONE=true
WORKDIR /app/apps/web
RUN pnpm build

# ---- runner (standalone) ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Docker sets HOSTNAME to the container ID; Next's standalone server binds to
# it literally unless overridden, so traffic from outside the container can't reach it.
ENV HOSTNAME="0.0.0.0"
# Next standalone output bundles the server + minimal node_modules.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Next's standalone file tracer doesn't reliably preserve newrelic's own
# dependency tree (json-stringify-safe and others silently got dropped, even
# with next.config.mjs forcing newrelic's own directory in) — reinstall it
# here directly with npm's flat resolution instead of trusting the tracer.
# Installed into a scratch dir, not --prefix apps/web directly: the
# standalone-generated package.json there uses pnpm's "workspace:" protocol,
# which plain npm can't parse.
RUN mkdir -p /tmp/nr-install && cd /tmp/nr-install && npm install --no-save --omit=dev newrelic@14.3.0 \
  && cp -r /tmp/nr-install/node_modules/. /app/apps/web/node_modules/ \
  && rm -rf /tmp/nr-install

# Preloads the agent before Next's generated server.js runs — that file is
# build-generated, not hand-editable, so instrumentation.ts's own import
# alone happens too late for full auto-instrumentation. newrelic.js would
# also be parsed as ESM here (package.json "type": "module"), so config is
# env-var-only. The absolute path matters too: --require resolves relative
# to the process's cwd (/app), but this app's own node_modules lives nested
# under apps/web/, not at the top level.
ENV NEW_RELIC_NO_CONFIG_FILE=true
ENV NODE_OPTIONS="--require /app/apps/web/node_modules/newrelic"
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
