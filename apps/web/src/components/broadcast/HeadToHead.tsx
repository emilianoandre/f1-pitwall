"use client";

import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, COMPOUND, orDash } from "@/lib/design";
import { catchForecast } from "@/lib/pace";
import type { DriverState, LapHistoryPoint } from "@f1-dash/types";

type Role = "ahead" | "focus" | "behind";

function Row({ role, d, gapMs }: { role: Role; d: DriverState | undefined; gapMs: number | null }) {
  const setFocus = useLiveStore((s) => s.setFocus);
  if (!d) {
    return (
      <div style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, color: F1.muted2, border: `1px dashed ${F1.border2}`, borderRadius: 3 }}>
        {role === "ahead" ? "Race leader — nothing ahead" : "Last on track — nothing behind"}
      </div>
    );
  }
  const team = teamHex(d.teamColour);
  const isFocus = role === "focus";
  const comp = COMPOUND[d.currentCompound];
  const gapS = gapMs !== null ? `${(gapMs / 1000).toFixed(3)}s` : "—";

  return (
    <div
      onClick={() => setFocus(d.racingNumber)}
      className="flex items-center gap-[9px] cursor-pointer"
      style={{ padding: "8px 11px", borderRadius: 3, background: isFocus ? `${team}26` : F1.panel2, border: `1px solid ${isFocus ? team : F1.border}` }}
    >
      <span style={{ width: 4, height: 18, borderRadius: 2, background: team, flex: "none" }} />
      <span className="f1-mono" style={{ fontSize: 11, color: F1.muted2, width: 26 }}>P{d.position}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px]">
          <span className="f1-mono" style={{ fontWeight: 700, fontSize: 13.5 }}>{d.tla}</span>
          <span className="truncate" style={{ fontSize: 12, color: F1.muted }}>{d.fullName}</span>
        </div>
        <div className="f1-mono" style={{ fontSize: 11, color: F1.muted2 }}>{orDash(d.lastLap.value)}</div>
      </div>
      <span className="flex items-center justify-center" style={{ width: 16, height: 16, borderRadius: 4, flex: "none", background: comp.col, color: comp.text, fontSize: 9, fontWeight: 700 }}>
        {comp.letter}
      </span>
      <div className="text-right" style={{ width: 66 }}>
        {isFocus ? (
          <span className="f1-overline" style={{ fontSize: 10, color: team }}>FOCUS</span>
        ) : (
          <>
            <div className="f1-overline" style={{ fontSize: 9 }}>{role === "ahead" ? "AHEAD" : "BEHIND"}</div>
            <div className="f1-mono" style={{ fontSize: 12, color: role === "ahead" ? F1.red : F1.green }}>{gapS}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** One-line battle forecast between two consecutive cars. */
function Forecast({
  chaserTla,
  chaserHist,
  aheadHist,
  intervalMs,
}: {
  chaserTla: string | undefined;
  chaserHist: LapHistoryPoint[];
  aheadHist: LapHistoryPoint[];
  intervalMs: number | null;
}) {
  const fc = catchForecast(chaserHist, aheadHist, intervalMs);
  if (!fc || !chaserTla) return null;
  const closing = fc.ratePerLapS > 0.05;
  const losing = fc.ratePerLapS < -0.05;
  const color = fc.alreadyInDrs || closing ? F1.green : losing ? F1.red : F1.muted2;
  let text: string;
  if (fc.alreadyInDrs) text = `${chaserTla} in DRS range`;
  else if (closing)
    text = `${chaserTla} closing ${fc.ratePerLapS.toFixed(2)}s/lap${fc.lapsToDrs !== null && fc.lapsToDrs <= 20 ? ` · DRS in ~${fc.lapsToDrs} laps` : ""}`;
  else if (losing) text = `${chaserTla} losing ${Math.abs(fc.ratePerLapS).toFixed(2)}s/lap`;
  else text = "Pace evenly matched";
  return (
    <div className="flex items-center gap-[7px]" style={{ padding: "0 4px" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flex: "none" }} />
      <span className="f1-mono" style={{ fontSize: 10, color }}>{text}</span>
    </div>
  );
}

export function HeadToHead() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
  const lapHistory = useLiveStore((s) => s.state?.lapHistory);
  const focus = useFocusNumber();

  const idx = focus ? order.indexOf(focus) : -1;
  const aheadNum = idx > 0 ? order[idx - 1] : undefined;
  const behindNum = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
  const fd = focus ? drivers?.[focus] : undefined;
  const ahead = aheadNum ? drivers?.[aheadNum] : undefined;
  const behind = behindNum ? drivers?.[behindNum] : undefined;

  const focusHist = (focus && lapHistory?.[focus]) || [];
  const aheadHist = (aheadNum && lapHistory?.[aheadNum]) || [];
  const behindHist = (behindNum && lapHistory?.[behindNum]) || [];

  return (
    <Panel title="Head to Head" style={{ gridArea: "h2h" }}>
      <div className="flex flex-col gap-[8px]">
        <Row role="ahead" d={ahead} gapMs={fd?.intervalMs ?? null} />
        {ahead && fd && (
          <Forecast chaserTla={fd.tla} chaserHist={focusHist} aheadHist={aheadHist} intervalMs={fd.intervalMs} />
        )}
        <Row role="focus" d={fd} gapMs={null} />
        {behind && fd && (
          <Forecast chaserTla={behind.tla} chaserHist={behindHist} aheadHist={focusHist} intervalMs={behind.intervalMs} />
        )}
        <Row role="behind" d={behind} gapMs={behind?.intervalMs ?? null} />
      </div>
    </Panel>
  );
}
