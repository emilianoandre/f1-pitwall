import { NextResponse } from "next/server";

// Season schedule + last race podium from Jolpica (Ergast successor). Cached 6h.
export const revalidate = 21_600;

const JOLPICA = "https://api.jolpi.ca/ergast/f1";

interface ErgastSession {
  date: string;
  time?: string;
}
interface ErgastRace {
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit?: { circuitName?: string; Location?: { country?: string; locality?: string } };
  FirstPractice?: ErgastSession;
  SecondPractice?: ErgastSession;
  ThirdPractice?: ErgastSession;
  Qualifying?: ErgastSession;
  Sprint?: ErgastSession;
  SprintQualifying?: ErgastSession;
}

function iso(s?: ErgastSession): string | null {
  if (!s?.date) return null;
  return `${s.date}T${s.time ?? "00:00:00Z"}`;
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${JOLPICA}/${path}`, {
    headers: { "User-Agent": "f1-dash" },
    next: { revalidate: 21_600 },
  });
  if (!res.ok) throw new Error(`jolpica ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [schedRaw, lastRaw] = await Promise.all([
      getJson("current.json"),
      getJson("current/last/results.json"),
    ]);

    const races = (
      (schedRaw as { MRData?: { RaceTable?: { Races?: ErgastRace[] } } }).MRData?.RaceTable
        ?.Races ?? []
    ).map((r) => ({
      round: Number(r.round),
      name: r.raceName,
      circuit: r.Circuit?.circuitName ?? "",
      country: r.Circuit?.Location?.country ?? "",
      sessions: [
        { name: "FP1", start: iso(r.FirstPractice) },
        { name: "FP2", start: iso(r.SecondPractice) },
        { name: "FP3", start: iso(r.ThirdPractice) },
        { name: "Sprint Quali", start: iso(r.SprintQualifying) },
        { name: "Sprint", start: iso(r.Sprint) },
        { name: "Qualifying", start: iso(r.Qualifying) },
        { name: "Race", start: iso({ date: r.date, time: r.time }) },
      ].filter((s) => s.start !== null),
    }));

    const lastRace = (
      lastRaw as {
        MRData?: {
          RaceTable?: {
            Races?: Array<{
              raceName?: string;
              Results?: Array<{
                position?: string;
                Driver?: { code?: string; familyName?: string };
                Constructor?: { name?: string };
              }>;
            }>;
          };
        };
      }
    ).MRData?.RaceTable?.Races?.[0];

    const podium = (lastRace?.Results ?? []).slice(0, 3).map((x) => ({
      position: Number(x.position),
      driver: x.Driver?.code ?? x.Driver?.familyName ?? "",
      constructor: x.Constructor?.name ?? "",
    }));

    return NextResponse.json(
      { races, lastRace: { name: lastRace?.raceName ?? "", podium } },
      { headers: { "Cache-Control": "public, max-age=21600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
