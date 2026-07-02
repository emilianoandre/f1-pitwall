# Build context is the repo root: docker build -f apps/ingest/Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11

WORKDIR /app

# Workspace manifests first for cached installs.
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/ingest/package.json ./apps/ingest/

RUN pnpm install --filter @f1-dash/ingest... --frozen-lockfile=false

# Source.
COPY packages/types ./packages/types
COPY apps/ingest ./apps/ingest

WORKDIR /app/apps/ingest

ENV PORT=4000
ENV DATA_DIR=/data/recordings
EXPOSE 4000

# tsx runs the TS entrypoint directly (throughput is a few KB/s — no build step needed).
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
