"use client";

import { useMemo } from "react";
import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, COMPOUND, timingColor, orDash } from "@/lib/design";
import type { LapHistoryPoint, DriverState } from "@f1-dash/types";

function LapTrend({ laps }: { laps: LapHistoryPoint[] }) {
  const W = 640;
  const H = 180;
  if (laps.length < 2) return <div style={{ color: F1.muted2, fontSize: 12, padding: "24px 0" }}>Not enough laps yet</div>;
  const times = laps.map((l) => l.timeMs);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const bestIdx = times.indexOf(min);
  const pts = laps.map((l, i) => {
    const x = (i / (laps.length - 1)) * W;
    const y = H - ((l.timeMs - min) / span) * (H - 20) - 10;
    return { x, y };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={F1.accent2} strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === bestIdx ? 4 : 2.2} fill={i === bestIdx ? F1.purple : F1.muted} />
      ))}
    </svg>
  );
}

export function DriverDetail() {
  const num = useFocusNumber();
  const d = useLiveStore((s) => (num ? s.state?.drivers[num] : undefined));
  const lapHistory = useLiveStore((s) => (num ? s.state?.lapHistory[num] : undefined));
  const session = useLiveStore((s) => s.state?.session);
  const raceControl = useLiveStore((s) => s.state?.raceControl) ?? [];
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
  const setScreen = useLiveStore((s) => s.setScreen);
  const laps = useMemo(() => lapHistory ?? [], [lapHistory]);
  const last10 = useMemo(() => laps.slice(-10).reverse(), [laps]);
  const bestMs = useMemo(() => (laps.length ? Math.min(...laps.map((l) => l.timeMs)) : null), [laps]);

  const team = teamHex(d?.teamColour);
  const car = d?.carData;
  const sectorMax = Math.max(1, ...(d?.sectors.map((s) => s.ms ?? 0) ?? [1]));

  // Neighbours in the running order.
  const idx = num ? order.indexOf(num) : -1;
  const ahead = idx > 0 ? drivers?.[order[idx - 1]!] : undefined;
  const behind = idx >= 0 && idx < order.length - 1 ? drivers?.[order[idx + 1]!] : undefined;
  const gapAhead = d?.intervalMs != null ? `+${(d.intervalMs / 1000).toFixed(3)}s` : orDash(d?.interval);
  const gapBehind = behind?.intervalMs != null ? `+${(behind.intervalMs / 1000).toFixed(3)}s` : orDash(behind?.interval);

  const driverRadio = raceControl.filter((m) => d && m.message.includes(d.tla)).reverse();

  return (
    <div className="mx-auto" style={{ maxWidth: 1300, padding: "0 22px 34px" }}>
      <div className="sticky top-0 z-20 flex items-center justify-between" style={{ background: "linear-gradient(180deg,var(--f1-bg2) 72%,transparent)", padding: "16px 0 12px" }}>
        <button
          onClick={() => setScreen("dashboard")}
          className="f1-panel"
          style={{ padding: "8px 14px", color: F1.muted, fontSize: 13, cursor: "pointer" }}
        >
          ← Back to dashboard
        </button>
        <div style={{ fontSize: 12.5, color: F1.muted }}>
          {session?.meetingName} · {session?.name}
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ borderRadius: 3, border: `1px solid ${F1.border}`, background: "linear-gradient(115deg,var(--f1-panel),#111318)", marginBottom: 14 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: team }} />
        <div className="flex flex-wrap items-end justify-between gap-[20px]" style={{ padding: "24px 30px 24px 34px" }}>
          <div className="flex items-end gap-[18px]">
            <div className="f1-mono" style={{ fontWeight: 700, fontSize: 64, lineHeight: 1, color: team }}>{d?.racingNumber ?? "—"}</div>
            <div>
              <div className="f1-cond" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1 }}>{d?.fullName ?? "No driver"}</div>
              <div style={{ fontSize: 14, color: F1.muted }}>{d?.teamName}</div>
            </div>
          </div>
          <div className="flex gap-[22px]">
            <Stat label="POS" value={d ? `P${d.position}` : "—"} />
            <Stat label="GAP TO LEAD" value={orDash(d?.gapToLeader)} mono />
            <Stat label="LAST LAP" value={orDash(d?.lastLap.value)} mono />
            <Stat label="BEST LAP" value={orDash(d?.bestLap.value)} mono color={F1.purple} />
            <Stat label="TIRE" value={`${COMPOUND[d?.currentCompound ?? "UNKNOWN"].letter} · ${d?.tyreAge ?? 0}L`} />
          </div>
        </div>
      </div>

      {/* Gap to the cars either side */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
        <Rival role="Ahead" d={ahead} gap={ahead ? gapAhead : "—"} />
        <Rival role="Behind" d={behind} gap={behind ? gapBehind : "—"} />
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "minmax(0,1.5fr) 340px" }}>
        <div className="flex flex-col gap-[14px]">
          <Panel title="Live Telemetry">
            <div className="flex gap-[26px]">
              <Stat label="SPEED" value={`${Math.round(car?.speed ?? 0)}`} mono big />
              <Stat label="GEAR" value={`${car?.gear ?? "–"}`} big />
              <Stat label="THROTTLE" value={`${Math.round(car?.throttle ?? 0)}%`} mono />
              <Stat label="BRAKE" value={`${Math.round(car?.brake ?? 0)}%`} mono />
              <Stat label="DRS" value={car?.drs ? "OPEN" : "—"} color={car?.drs ? F1.green : F1.muted2} />
            </div>
          </Panel>
          <Panel title="Lap Time Trend" meta={`${laps.length} laps`}>
            <LapTrend laps={laps} />
          </Panel>
          <Panel title="Last 10 Laps">
            {last10.length === 0 ? (
              <div style={{ fontSize: 12, color: F1.muted2 }}>No completed laps yet</div>
            ) : (
              <div className="flex flex-col">
                {last10.map((l) => (
                  <div
                    key={l.lap}
                    className="flex items-center justify-between"
                    style={{ padding: "5px 2px", borderTop: `1px solid rgba(255,255,255,.04)` }}
                  >
                    <span className="f1-mono" style={{ fontSize: 11, color: F1.muted2, width: 60 }}>LAP {l.lap}</span>
                    <span style={{ flex: 1 }}>
                      <span
                        className="inline-flex items-center justify-center"
                        style={{ width: 16, height: 16, borderRadius: 4, background: COMPOUND[l.compound].col, color: COMPOUND[l.compound].text, fontSize: 9, fontWeight: 700 }}
                      >
                        {COMPOUND[l.compound].letter}
                      </span>
                    </span>
                    <span
                      className="f1-mono"
                      style={{ fontSize: 13, fontWeight: 700, color: l.timeMs === bestMs ? F1.purple : F1.text }}
                    >
                      {fmtLap(l.timeMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-[14px]">
          <Panel title="Last Lap Sectors">
            <div className="flex flex-col gap-[10px]">
              {d?.sectors.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between" style={{ fontSize: 11, color: F1.muted, marginBottom: 3 }}>
                    <span>S{i + 1}</span>
                    <span className="f1-mono" style={{ color: timingColor(s) }}>{orDash(s.value)}</span>
                  </div>
                  <div style={{ height: 8, background: F1.border, borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((s.ms ?? 0) / sectorMax) * 100}%`, background: team }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: F1.muted2, marginTop: 2 }}>Lap total {orDash(d?.lastLap.value)}</div>
            </div>
          </Panel>
          <Panel title="Driver Radio">
            <div className="flex flex-col gap-[8px]" style={{ maxHeight: 220, overflowY: "auto" }}>
              {driverRadio.length === 0 ? (
                <div style={{ fontSize: 12, color: F1.muted2 }}>No messages mentioning {d?.tla ?? "this driver"} yet</div>
              ) : (
                driverRadio.map((m, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: F1.muted, borderLeft: `3px solid ${team}`, paddingLeft: 8 }}>
                    {m.message}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function fmtLap(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

function Rival({ role, d, gap }: { role: "Ahead" | "Behind"; d: DriverState | undefined; gap: string }) {
  const setFocus = useLiveStore((s) => s.setFocus);
  const team = teamHex(d?.teamColour);
  const gapColor = role === "Ahead" ? F1.red : F1.green;
  return (
    <div
      className="f1-panel flex items-center gap-[12px]"
      style={{ padding: "12px 16px", cursor: d ? "pointer" : "default" }}
      onClick={() => d && setFocus(d.racingNumber)}
    >
      <span style={{ width: 4, height: 26, borderRadius: 2, background: d ? team : F1.border }} />
      <div className="min-w-0">
        <div className="f1-overline" style={{ fontSize: 9.5 }}>{role === "Ahead" ? "CAR AHEAD" : "CAR BEHIND"}</div>
        {d ? (
          <div className="flex items-center gap-[8px]">
            <span className="f1-mono" style={{ fontWeight: 700, fontSize: 15 }}>{d.tla}</span>
            <span className="truncate" style={{ fontSize: 12.5, color: F1.muted }}>P{d.position} · {d.fullName}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: F1.muted2 }}>{role === "Ahead" ? "Race leader" : "Last on track"}</div>
        )}
      </div>
      <div className="ml-auto f1-mono" style={{ fontWeight: 700, fontSize: 18, color: d ? gapColor : F1.muted2 }}>{gap}</div>
    </div>
  );
}

function Stat({ label, value, mono, big, color }: { label: string; value: string; mono?: boolean; big?: boolean; color?: string }) {
  return (
    <div className="text-right">
      <div className="f1-overline" style={{ fontSize: 9.5 }}>{label}</div>
      <div className={mono ? "f1-mono" : "f1-cond"} style={{ fontWeight: 700, fontSize: big ? 30 : 18, lineHeight: 1.2, color: color ?? F1.text }}>
        {value}
      </div>
    </div>
  );
}
