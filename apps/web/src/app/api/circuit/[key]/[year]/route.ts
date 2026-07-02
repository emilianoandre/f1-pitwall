import { NextResponse } from "next/server";

// Proxy the MultiViewer circuit geometry (avoids client CORS) and cache it hard —
// circuit outlines don't change within a season.
export const revalidate = 86_400; // 24h

interface Params {
  params: Promise<{ key: string; year: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { key, year } = await params;
  if (!/^\d+$/.test(key) || !/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: "bad key/year" }, { status: 400 });
  }

  const url = `https://api.multiviewer.app/api/v1/circuits/${key}/${year}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "f1-dash" },
    next: { revalidate: 86_400 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
  }

  const data = (await res.json()) as Record<string, unknown>;
  // Return only what the map needs.
  return NextResponse.json(
    {
      x: data.x,
      y: data.y,
      rotation: data.rotation,
      corners: data.corners,
      marshalSectors: data.marshalSectors,
    },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
