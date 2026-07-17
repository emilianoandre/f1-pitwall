import { NextResponse } from "next/server";
import { ingestServerUrl } from "@/lib/ingestServer";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(req: Request, { params }: RouteContext) {
  const { path } = await params;
  const ingestPath = `/api/${path.join("/")}`;
  const url = new URL(ingestPath, ingestServerUrl());
  url.search = new URL(req.url).search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Requests only reach ingest through this proxy — the shared secret lets
  // ingest confirm that (it has no other reason to trust its own public URL).
  const internalToken = process.env.INGEST_SHARED_SECRET;
  if (internalToken) headers.set("x-internal-token", internalToken);

  const isSse = ingestPath === "/api/sse";

  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
      // SSE is a long-lived stream — never buffer it into a Response.
      ...(isSse ? { duplex: "half" as const } : {}),
    });

    if (isSse) {
      return new NextResponse(res.body, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `ingest unreachable at ${ingestServerUrl()}: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
