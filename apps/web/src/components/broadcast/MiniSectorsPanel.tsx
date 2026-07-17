"use client";

import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, contrastText } from "@/lib/design";
import type { SegmentStatus } from "@f1-dash/types";

const SEGMENT_COLOR: Record<SegmentStatus, string> = {
  none: "transparent",
  yellow: F1.amber,
  green: F1.green,
  purple: F1.purple,
  pit: F1.muted2,
  stopped: F1.red,
};

function SegmentDots({ segments }: { segments: SegmentStatus[] }) {
  return (
    <div className="flex" style={{ gap: 2 }}>
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 5,
            borderRadius: 1,
            background: SEGMENT_COLOR[s],
            border: s === "none" ? `1px solid ${F1.border2}` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function MiniSectorsPanel() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);

  return (
    <Panel
      title="Standings & Mini Sectors"
      meta="Live segment status per sector"
      style={{ gridArea: "extra" }}
      bodyStyle={{ paddingLeft: 12, paddingRight: 12 }}
    >
      <div
        className="grid f1-overline"
        style={{ gridTemplateColumns: "34px 44px 1fr 1fr 1fr", gap: 10, fontSize: 9.5, padding: "0 8px 6px" }}
      >
        <span>POS</span>
        <span>DRIVER</span>
        <span>SECTOR 1</span>
        <span>SECTOR 2</span>
        <span>SECTOR 3</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
        {order.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: F1.muted2 }}>
            Waiting for timing…
          </div>
        ) : (
          order.map((num) => {
            const d = drivers?.[num];
            if (!d) return null;
            const team = teamHex(d.teamColour);
            return (
              <div
                key={num}
                className="grid items-center"
                style={{ gridTemplateColumns: "34px 44px 1fr 1fr 1fr", gap: 10, padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,.04)" }}
              >
                <span
                  className="f1-cond flex items-center justify-center"
                  style={{ width: 26, height: 20, fontWeight: 700, fontSize: 12.5, borderRadius: 2, background: team, color: contrastText(team) }}
                >
                  {d.position}
                </span>
                <span className="f1-mono" style={{ fontWeight: 700, fontSize: 12 }}>{d.tla}</span>
                {d.sectors.map((s, i) => (
                  <SegmentDots key={i} segments={s.segments} />
                ))}
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
