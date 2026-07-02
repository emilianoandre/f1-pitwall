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
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
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
# Next standalone output bundles the server + minimal node_modules.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
