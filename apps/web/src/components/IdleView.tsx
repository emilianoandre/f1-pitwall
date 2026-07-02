"use client";

import { useEffect, useMemo, useState } from "react";

interface Session {
  name: string;
  start: string | null;
}
interface Race {
  round: number;
  name: string;
  circuit: string;
  country: string;
  sessions: Session[];
}
interface ScheduleData {
  races: Race[];
  lastRace: { name: string; podium: Array<{ position: number; driver: string; constructor: string }> };
}

function useCountdown(target: number | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (target === null) return "—";
  const ms = target - Date.now();
  if (ms <= 0) return "starting…";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m ${s}s`;
}

function localTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IdleView() {
  const [data, setData] = useState<ScheduleData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.races)) setData(d as ScheduleData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const next = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    // Next weekend = the race whose Race session is still in the future.
    for (const race of data.races) {
      const raceSession = race.sessions.find((s) => s.name === "Race");
      const raceTime = raceSession?.start ? Date.parse(raceSession.start) : 0;
      if (raceTime > now - 4 * 3_600_000) return race;
    }
    return null;
  }, [data]);

  const nextSession = useMemo(() => {
    if (!next) return null;
    const now = Date.now();
    return (
      next.sessions.find((s) => s.start && Date.parse(s.start) > now) ??
      next.sessions[next.sessions.length - 1] ??
      null
    );
  }, [next]);

  const countdown = useCountdown(
    nextSession?.start ? Date.parse(nextSession.start) : null,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-12">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-neutral-600">No live session</div>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-100">
          {next?.name ?? "Off-season"}
        </h1>
        {next && (
          <p className="text-sm text-neutral-500">
            {next.circuit}
            {next.country ? ` · ${next.country}` : ""}
          </p>
        )}
      </div>

      {nextSession && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-center">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Next: {nextSession.name}
          </div>
          <div className="tabular mt-1 text-4xl font-semibold text-neutral-100">{countdown}</div>
          {nextSession.start && (
            <div className="mt-1 text-xs text-neutral-500">{localTime(nextSession.start)}</div>
          )}
        </div>
      )}

      {next && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
            Weekend schedule
          </div>
          <div className="flex flex-col gap-1">
            {next.sessions.map((s) => (
              <div key={s.name} className="flex justify-between text-sm">
                <span className="text-neutral-300">{s.name}</span>
                <span className="tabular text-neutral-500">{s.start ? localTime(s.start) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.lastRace.podium.length ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
            Last race · {data.lastRace.name}
          </div>
          <div className="flex flex-col gap-1">
            {data.lastRace.podium.map((p) => (
              <div key={p.position} className="flex items-center gap-3 text-sm">
                <span className="tabular w-5 text-neutral-500">{p.position}</span>
                <span className="font-semibold text-neutral-100">{p.driver}</span>
                <span className="text-neutral-500">{p.constructor}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
