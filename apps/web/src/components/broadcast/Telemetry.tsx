"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex } from "@/lib/design";

function Meter({ label, value, color, unit }: { label: string; value: number; color: string; unit: string }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between" style={{ fontSize: 10.5, color: F1.muted, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="f1-mono" style={{ color: F1.text }}>{Math.round(value)}{unit}</span>
      </div>
      <div style={{ height: 7, borderRadius: 1, background: F1.border, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color, transition: "width .1s linear" }} />
      </div>
    </div>
  );
}

function SpeedTrace({ samples }: { samples: number[] }) {
  const W = 320;
  const H = 66;
  const max = 340;
  const pts = samples.map((v, i) => {
    const x = samples.length <= 1 ? 0 : (i / (samples.length - 1)) * W;
    const y = H - (Math.max(0, Math.min(max, v)) / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={F1.border} strokeWidth={0.5} />
      ))}
      {pts.length > 1 && (
        <polyline points={pts.join(" ")} fill="none" stroke={F1.accent2} strokeWidth={1.6} strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function Telemetry() {
  const num = useFocusNumber();
  const d = useLiveStore((s) => (num ? s.state?.drivers[num] : undefined));
  const setScreen = useLiveStore((s) => s.setScreen);

  // Ring buffer of the focus driver's speed (~11s at 10Hz).
  const traceRef = useRef<number[]>([]);
  const lastNum = useRef<string | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = useLiveStore.subscribe((st) => {
      const cur = st.focus && st.state?.drivers[st.focus] ? st.focus : st.state?.order[0];
      if (!cur) return;
      if (cur !== lastNum.current) {
        lastNum.current = cur;
        traceRef.current = [];
      }
      const sp = st.state?.drivers[cur]?.carData?.speed;
      if (typeof sp === "number") {
        const buf = traceRef.current;
        buf.push(sp);
        if (buf.length > 110) buf.shift();
        force((n) => (n + 1) % 1000);
      }
    });
    return unsub;
  }, []);

  const team = teamHex(d?.teamColour);
  const car = d?.carData;

  return (
    <Panel
      accent={team}
      title="Telemetry"
      style={{ gridArea: "tele" }}
      right={
        <div className="flex items-center gap-[10px]">
          <span className="f1-mono" style={{ fontWeight: 700, fontSize: 13 }}>{d?.tla ?? "—"}</span>
          <button
            onClick={() => setScreen("driver")}
            style={{ cursor: "pointer", background: "transparent", border: `1px solid ${F1.border2}`, color: F1.accent2, fontSize: 11.5, padding: "5px 12px", borderRadius: 1 }}
          >
            Driver detail →
          </button>
        </div>
      }
    >
      <div className="flex items-end gap-[18px]" style={{ marginBottom: 14 }}>
        <div>
          <div className="f1-mono" style={{ fontWeight: 700, fontSize: 44, lineHeight: 1 }}>{Math.round(car?.speed ?? 0)}</div>
          <div style={{ fontSize: 11, color: F1.muted, letterSpacing: ".1em" }}>KM/H</div>
        </div>
        <div className="ml-auto text-center" style={{ background: F1.panel2, border: `1px solid ${F1.border2}`, borderRadius: 3, padding: "6px 16px" }}>
          <div style={{ fontSize: 10, color: F1.muted2, letterSpacing: ".1em" }}>GEAR</div>
          <div className="f1-cond" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1 }}>{car?.gear ?? "–"}</div>
        </div>
        <div className="text-center" style={{ padding: "8px 14px", borderRadius: 3, border: `1px solid ${car?.drs ? "rgba(40,199,111,.5)" : F1.border}`, background: car?.drs ? "rgba(40,199,111,.14)" : F1.panel2 }}>
          <div style={{ fontSize: 10, color: F1.muted2, letterSpacing: ".1em" }}>DRS</div>
          <div className="f1-cond" style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.6, color: car?.drs ? F1.green : F1.muted2 }}>{car?.drs ? "OPEN" : "—"}</div>
        </div>
      </div>

      <div className="flex gap-[14px]" style={{ marginBottom: 12 }}>
        <Meter label="THROTTLE" value={car?.throttle ?? 0} color={F1.green} unit="%" />
        <Meter label="BRAKE" value={car?.brake ?? 0} color={F1.red} unit="%" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Meter label="RPM" value={(car?.rpm ?? 0) / 120} color="linear-gradient(90deg,var(--f1-accent),var(--f1-amber) 82%,var(--f1-red))" unit="" />
      </div>

      <SpeedTrace samples={traceRef.current} />
      <div style={{ fontSize: 10.5, color: F1.muted2, marginTop: 2, textAlign: "right" }}>Speed trace · last ~11s</div>
    </Panel>
  );
}
