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
  // Belt-and-suspenders: the file tracer used by `standalone` output infers
  // most deps from the import graph (instrumentation.ts's `import("newrelic")`
  // already anchors this one), but newrelic is also loaded via a Dockerfile
  // NODE_OPTIONS preload that the tracer can't see — force it in explicitly
  // so a future refactor of the dynamic import can't silently prune it.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/newrelic/**/*"],
  },
  // `standalone` is only for the self-hosted Docker image. On Vercel we leave the
  // output mode default so Vercel's own build pipeline handles it.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
