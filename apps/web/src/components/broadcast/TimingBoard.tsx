"use client";

import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { F1, teamHex, contrastText, COMPOUND, timingColor, orDash } from "@/lib/design";
import type { DriverState } from "@f1-dash/types";

function Row({ num }: { num: string }) {
  const d = useLiveStore((s) => s.state?.drivers[num]);
  const focus = useFocusNumber();
  const setFocus = useLiveStore((s) => s.setFocus);
  if (!d) return null;

  const team = teamHex(d.teamColour);
  const isFocus = focus === num;
  const comp = COMPOUND[d.currentCompound];
  const intMs = d.intervalMs;
  const intColor = intMs !== null && intMs < 1000 ? F1.green : F1.text;

  return (
    <div
      onClick={() => setFocus(num)}
      className="flex items-center gap-[9px] px-[12px] cursor-pointer"
      style={{
        padding: "6px 12px",
        borderTop: "1px solid rgba(255,255,255,.04)",
        background: isFocus ? `${team}22` : "transparent",
      }}
    >
      <span
        className="f1-cond flex items-center justify-center"
        style={{ width: 26, height: 22, flex: "none", fontWeight: 700, fontSize: 14, borderRadius: 2, background: team, color: contrastText(team) }}
      >
        {d.position}
      </span>
      <span style={{ width: 10, fontSize: 11, textAlign: "center", color: F1.muted2 }}>{d.pitOut ? "" : ""}</span>
      <span className="f1-mono" style={{ fontWeight: 700, fontSize: 13.5, width: 38 }}>{d.tla}</span>
      <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, color: F1.muted }}>{d.fullName}</span>
      {d.bestLap.overallBest && (
        <span
          title="Fastest lap"
          style={{ fontSize: 9, fontWeight: 700, color: F1.purple, border: `1px solid ${F1.purple}88`, borderRadius: 2, padding: "1px 4px" }}
        >
          FL
        </span>
      )}
      {d.carData?.drs && (
        <span style={{ fontSize: 9, fontWeight: 700, color: F1.green, border: `1px solid rgba(52,208,88,.5)`, borderRadius: 2, padding: "1px 4px" }}>DRS</span>
      )}
      {d.inPit && (
        <span style={{ fontSize: 9, fontWeight: 700, color: F1.amber, border: `1px solid rgba(255,196,0,.5)`, borderRadius: 2, padding: "1px 4px" }}>PIT</span>
      )}
      <span
        className="flex items-center justify-center"
        style={{ width: 16, height: 16, borderRadius: 4, flex: "none", background: comp.col, color: comp.text, fontSize: 9, fontWeight: 700 }}
      >
        {comp.letter}
      </span>
      <span className="f1-mono text-right" style={{ width: 56, fontSize: 12, color: intColor }}>
        {statusOrInterval(d)}
      </span>
      <span className="f1-mono text-right" style={{ width: 56, fontSize: 12, color: timingColor(d.lastLap) }}>
        {orDash(d.lastLap.value)}
      </span>
    </div>
  );
}

function statusOrInterval(d: DriverState): string {
  if (d.retired) return "OUT";
  if (d.position === 1) return "LEADER";
  return orDash(d.interval);
}

export function TimingBoard() {
  const order = useLiveStore((s) => s.state?.order) ?? [];

  return (
    <div className="f1-panel flex flex-col overflow-hidden" style={{ gridArea: "board" }}>
      <div
        className="flex items-center justify-between"
        style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${F1.border}` }}
      >
        <span className="f1-cond" style={{ fontWeight: 500, fontSize: 15 }}>Live Timing</span>
        <div className="flex gap-[14px] f1-overline" style={{ fontSize: 9.5 }}>
          <span style={{ width: 56, textAlign: "right" }}>INTERVAL</span>
          <span style={{ width: 56, textAlign: "right" }}>LAST LAP</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {order.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: F1.muted2 }}>
            Waiting for timing…
          </div>
        ) : (
          order.map((num) => <Row key={num} num={num} />)
        )}
      </div>
    </div>
  );
}
