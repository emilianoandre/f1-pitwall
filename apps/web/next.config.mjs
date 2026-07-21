import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@f1-dash/types"],
  // Required so Vercel traces workspace deps (e.g. @f1-dash/types) from the monorepo root.
  outputFileTracingRoot: monorepoRoot,
  // Note: newrelic is intentionally NOT included via outputFileTracingIncludes
  // here — the file tracer doesn't reliably preserve its own transitive deps
  // (json-stringify-safe and others got silently dropped even when forced
  // in). apps/web/Dockerfile reinstalls newrelic directly in the runner
  // image instead; see that file's comment for why.
  // `standalone` is only for the self-hosted Docker image. On Vercel we leave the
  // output mode default so Vercel's own build pipeline handles it.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
