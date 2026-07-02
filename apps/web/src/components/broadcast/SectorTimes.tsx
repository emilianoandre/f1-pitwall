"use client";

import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, timingColor, orDash } from "@/lib/design";

const COLS = "44px 1fr 1fr 1fr 66px";

export function SectorTimes() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);

  return (
    <Panel title="Sector Times" meta="Last completed lap" style={{ gridArea: "timing" }} bodyStyle={{ paddingLeft: 12, paddingRight: 12 }}>
      <div className="grid f1-overline" style={{ gridTemplateColumns: COLS, gap: 4, fontSize: 9.5, padding: "0 8px 6px" }}>
        <span>DRIVER</span>
        <span>S1</span>
        <span>S2</span>
        <span>S3</span>
        <span style={{ textAlign: "right" }}>LAST</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {order.map((num) => {
          const d = drivers?.[num];
          if (!d) return null;
          return (
            <div
              key={num}
              className="grid items-center"
              style={{ gridTemplateColumns: COLS, gap: 4, padding: "5px 8px", borderTop: "1px solid rgba(255,255,255,.04)" }}
            >
              <span className="f1-mono" style={{ fontWeight: 700, fontSize: 12 }}>{d.tla}</span>
              {d.sectors.map((s, i) => (
                <span key={i} className="f1-mono" style={{ fontSize: 11.5, color: timingColor(s) }}>{orDash(s.value)}</span>
              ))}
              <span className="f1-mono" style={{ fontSize: 11.5, textAlign: "right", color: timingColor(d.lastLap) }}>{orDash(d.lastLap.value)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
