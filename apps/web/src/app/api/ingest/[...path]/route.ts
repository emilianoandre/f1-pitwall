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

  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
    });

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
