"use client";

import { useState } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, timingColor, orDash } from "@/lib/design";
import type { SegmentStatus } from "@f1-dash/types";

const COLS = "44px 1fr 1fr 1fr 66px";

const SEGMENT_COLOR: Record<SegmentStatus, string> = {
  none: "transparent",
  yellow: F1.amber,
  green: F1.green,
  purple: F1.purple,
  pit: F1.muted2,
  stopped: F1.red,
};

function SegmentDots({ segments }: { segments: SegmentStatus[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="flex" style={{ gap: 2, marginTop: 3 }}>
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 4,
            borderRadius: 1,
            background: SEGMENT_COLOR[s],
            border: s === "none" ? `1px solid ${F1.border2}` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function SectorTimes() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
  const [showMiniSectors, setShowMiniSectors] = useState(true);

  return (
    <Panel
      title="Sector Times"
      meta="Last completed lap"
      right={
        <button
          onClick={() => setShowMiniSectors((v) => !v)}
          className="f1-overline"
          style={{
            cursor: "pointer",
            fontSize: 9.5,
            padding: "4px 9px",
            borderRadius: 1,
            border: `1px solid ${showMiniSectors ? F1.accent : F1.border2}`,
            background: showMiniSectors ? "rgba(225,6,0,.14)" : "transparent",
            color: showMiniSectors ? F1.accent2 : F1.muted,
          }}
        >
          {showMiniSectors ? "Hide" : "Show"} mini sectors
        </button>
      }
      style={{ gridArea: "timing" }}
      bodyStyle={{ paddingLeft: 12, paddingRight: 12 }}
    >
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
                <div key={i}>
                  <span className="f1-mono" style={{ fontSize: 11.5, color: timingColor(s) }}>{orDash(s.value)}</span>
                  {showMiniSectors && <SegmentDots segments={s.segments} />}
                </div>
              ))}
              <span className="f1-mono" style={{ fontSize: 11.5, textAlign: "right", color: timingColor(d.lastLap) }}>{orDash(d.lastLap.value)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
