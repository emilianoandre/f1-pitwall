"use client";

import { useMemo } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, COMPOUND } from "@/lib/design";
import { stintDegradationSPerLap } from "@/lib/pace";
import type { Stint } from "@f1-dash/types";

/** Convert stints (compound + age) into cumulative lap ranges. */
function stintRanges(stints: Stint[]): { comp: Stint["compound"]; start: number; end: number }[] {
  let lap = 0;
  return stints.map((st) => {
    const start = lap;
    lap += Math.max(1, st.age);
    return { comp: st.compound, start, end: lap };
  });
}

/** Degradation readout: green ≈ flat, amber mild, red heavy. */
function DegCell({ deg }: { deg: number | null }) {
  if (deg === null) {
    return <span className="f1-mono" style={{ width: 66, textAlign: "right", fontSize: 10, color: F1.muted2 }}>—</span>;
  }
  const color = deg > 0.15 ? F1.red : deg > 0.06 ? F1.amber : F1.green;
  const sign = deg >= 0 ? "+" : "";
  return (
    <span className="f1-mono" style={{ width: 66, textAlign: "right", fontSize: 10.5, color }}>
      {sign}{deg.toFixed(2)}s/lap
    </span>
  );
}

export function TireStrategy() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
  const lapHistory = useLiveStore((s) => s.state?.lapHistory);
  const pitStops = useLiveStore((s) => s.state?.pitStops) ?? [];
  const clock = useLiveStore((s) => s.state?.clock);
  const total = clock?.totalLaps && clock.totalLaps > 0 ? clock.totalLaps : 60;
  const currentLap = clock?.currentLap ?? 0;

  const fastestStopS = useMemo(
    () => (pitStops.length ? Math.min(...pitStops.map((p) => p.durationS)) : null),
    [pitStops],
  );
  const recentStops = useMemo(() => [...pitStops].reverse(), [pitStops]);

  return (
    <Panel
      title="Tire Strategy"
      meta="Stints · degradation · pit stops"
      style={{ gridArea: "tire" }}
      right={
        <div className="flex gap-[10px]" style={{ fontSize: 10.5, color: F1.muted }}>
          {(["SOFT", "MEDIUM", "HARD"] as const).map((c) => (
            <span key={c} className="flex items-center gap-[4px]">
              <span style={{ width: 9, height: 9, borderRadius: 2, background: COMPOUND[c].col }} />
              {c[0]! + c.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      }
    >
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "minmax(0,1fr) 190px" }}>
        {/* Stint gantt + per-stint degradation */}
        <div>
          <div className="flex flex-col gap-[7px] overflow-y-auto" style={{ maxHeight: 240 }}>
            {order.map((num) => {
              const d = drivers?.[num];
              if (!d) return null;
              const team = teamHex(d.teamColour);
              const ranges = stintRanges(d.stints);
              const deg = stintDegradationSPerLap(lapHistory?.[num] ?? []);
              return (
                <div key={num} className="flex items-center gap-[10px]">
                  <span style={{ width: 4, height: 14, borderRadius: 2, background: team, flex: "none" }} />
                  <span className="f1-mono" style={{ fontWeight: 700, fontSize: 11.5, width: 34 }}>{d.tla}</span>
                  <div className="relative flex-1" style={{ height: 16, borderRadius: 3, overflow: "hidden", background: F1.panel2 }}>
                    {ranges.map((r, i) => {
                      const comp = COMPOUND[r.comp];
                      const left = (r.start / total) * 100;
                      const w = ((Math.min(r.end, total) - r.start) / total) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute inset-y-0 flex items-center justify-center"
                          style={{ left: `${left}%`, width: `${w}%`, background: comp.col, borderRight: `1px solid ${F1.panel}`, fontSize: 9, fontWeight: 700, color: comp.text }}
                        >
                          {w > 6 ? comp.letter : ""}
                        </div>
                      );
                    })}
                    {currentLap > 0 && (
                      <div style={{ position: "absolute", left: `${(currentLap / total) * 100}%`, top: -2, bottom: -2, width: 2, background: "#fff", boxShadow: "0 0 4px rgba(255,255,255,.8)" }} />
                    )}
                  </div>
                  <DegCell deg={deg} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between" style={{ fontSize: 9.5, color: F1.muted2, padding: "6px 66px 0 48px" }}>
            <span>Lap 1</span>
            <span>Lap {Math.round(total / 2)}</span>
            <span>Lap {total}</span>
          </div>
        </div>

        {/* Pit stop log */}
        <div style={{ borderLeft: `1px solid ${F1.border}`, paddingLeft: 14 }}>
          <div className="f1-overline" style={{ fontSize: 9.5, paddingBottom: 6 }}>
            PIT STOPS <span style={{ color: F1.muted2 }}>· pit lane time</span>
          </div>
          <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 235 }}>
            {recentStops.length === 0 ? (
              <div style={{ fontSize: 11.5, color: F1.muted2, padding: "8px 0" }}>No stops yet</div>
            ) : (
              recentStops.map((p) => {
                const d = drivers?.[p.racingNumber];
                const isFastest = p.durationS === fastestStopS;
                return (
                  <div
                    key={`${p.racingNumber}-${p.lap}`}
                    className="flex items-center gap-[8px]"
                    style={{ padding: "3px 0", borderTop: "1px solid rgba(255,255,255,.04)" }}
                  >
                    <span style={{ width: 3, height: 12, borderRadius: 2, background: teamHex(d?.teamColour ?? ""), flex: "none" }} />
                    <span className="f1-mono" style={{ fontWeight: 700, fontSize: 11 }}>{d?.tla ?? p.racingNumber}</span>
                    <span className="f1-mono" style={{ fontSize: 10, color: F1.muted2 }}>L{p.lap}</span>
                    <span className="f1-mono ml-auto" style={{ fontSize: 11.5, fontWeight: 700, color: isFastest ? F1.purple : F1.text }}>
                      {p.durationS.toFixed(1)}s
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
