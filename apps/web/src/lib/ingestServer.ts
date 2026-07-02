/** Server-side ingest base URL (used by the /api/ingest proxy). */
export function ingestServerUrl(): string {
  return (
    process.env.INGEST_URL ??
    process.env.NEXT_PUBLIC_INGEST_URL ??
    "http://localhost:4000"
  );
}
