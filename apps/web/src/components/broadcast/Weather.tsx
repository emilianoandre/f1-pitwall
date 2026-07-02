"use client";

import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1 } from "@/lib/design";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 3, padding: "11px 13px" }}>
      <div style={{ fontSize: 10.5, color: F1.muted2, letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
      <div className="f1-cond" style={{ fontWeight: 700, fontSize: 20 }}>
        {value}
        {sub && <span style={{ fontSize: 12, color: F1.muted, fontWeight: 400 }}>{sub}</span>}
      </div>
    </div>
  );
}

export function Weather() {
  const w = useLiveStore((s) => s.state?.weather);
  const rainPct = w?.rainfall ? 80 : Math.min(60, Math.round((w?.humidity ?? 0) / 2));

  return (
    <Panel title="Weather & Track" style={{ gridArea: "weather" }}>
      <div className="flex items-center gap-[10px]" style={{ marginBottom: 11 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 3,
            flex: "none",
            background: w?.rainfall
              ? "radial-gradient(circle at 40% 35%, #7fd8ff, #2a86c4)"
              : "radial-gradient(circle at 40% 35%, #FFD666, #F5A201)",
          }}
        />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{w?.rainfall ? "Rain · Wet" : "Dry"}</div>
          <div style={{ fontSize: 11.5, color: F1.muted }}>
            {w ? `Track ${w.trackTemp.toFixed(0)}° · Air ${w.airTemp.toFixed(0)}°` : "—"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[8px]">
        <Tile label="AIR TEMP" value={`${(w?.airTemp ?? 0).toFixed(0)}`} sub="°C" />
        <Tile label="TRACK TEMP" value={`${(w?.trackTemp ?? 0).toFixed(0)}`} sub="°C" />
        <Tile label="HUMIDITY" value={`${(w?.humidity ?? 0).toFixed(0)}`} sub="%" />
        <Tile label="WIND" value={`${(w?.windSpeed ?? 0).toFixed(1)}`} sub=" km/h" />
      </div>
      <div className="flex items-center gap-[8px]" style={{ marginTop: 9, fontSize: 12, color: F1.muted }}>
        <span>Rain</span>
        <div style={{ flex: 1, height: 6, borderRadius: 1, background: F1.border, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${rainPct}%`, background: F1.cyan }} />
        </div>
        <span className="f1-mono" style={{ fontSize: 11 }}>{rainPct}%</span>
      </div>
    </Panel>
  );
}
