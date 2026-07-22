"use client";

import { useMemo, useState } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, timingColor, orDash } from "@/lib/design";
import type { DriverState, SegmentStatus } from "@f1-dash/types";

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

/** m:ss.mmm formatting for a raw ms value (sector/lap TimedValue.value comes
 * pre-formatted from the feed; a live running sum doesn't, so this covers
 * just that case). */
function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(3);
  return minutes > 0 ? `${minutes}:${seconds.padStart(6, "0")}` : seconds;
}

function formatDelta(deltaMs: number): string {
  const sign = deltaMs < 0 ? "-" : "+";
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}`;
}

/** Delta line comparing a fresh (currently-being-timed) sector against the
 * same sector in the driver's own standing best lap — never a mix of
 * independently-best sectors from different laps (see bestLapSectors in
 * apps/ingest/src/state/derived.ts). Always rendered at a fixed height, even
 * when there's nothing to show (hidden via visibility, not unmounted) — a
 * driver going on/off track must never change row height. */
function DeltaLine({ deltaMs }: { deltaMs: number | null }) {
  const faster = deltaMs !== null && deltaMs < 0;
  return (
    <span
      className="f1-mono"
      style={{
        display: "block",
        fontSize: 9.5,
        height: 13,
        lineHeight: "13px",
        color: faster ? F1.green : F1.amber,
        visibility: deltaMs === null ? "hidden" : "visible",
      }}
    >
      {deltaMs !== null ? formatDelta(deltaMs) : "+0.000"}
    </span>
  );
}

/** Sum of whichever sectors have landed so far in the lap currently being
 * timed — not a live ticking clock, just a running total that jumps up each
 * time a sector completes. */
function currentLapMs(d: DriverState): number | null {
  let sum = 0;
  let any = false;
  for (let i = 0; i < 3; i++) {
    if (d.sectorsFresh[i] && d.sectors[i]?.ms !== null && d.sectors[i]?.ms !== undefined) {
      sum += d.sectors[i]!.ms!;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Cumulative delta between the sectors completed so far this lap and the
 * *same* sectors from the driver's best lap this qualifying segment — e.g.
 * with only S1+S2 landed, compares S1+S2 against S1+S2 of the best lap,
 * never the full best-lap time. Null unless every completed-so-far sector
 * has a same-index reference to compare against. */
function cumulativeDelta(d: DriverState): number | null {
  let currentSum = 0;
  let bestSum = 0;
  let any = false;
  for (let i = 0; i < 3; i++) {
    if (!d.sectorsFresh[i]) continue;
    const cur = d.sectors[i]?.ms;
    const best = d.bestLapSectors[i];
    if (cur === null || cur === undefined || best === null || best === undefined) return null;
    currentSum += cur;
    bestSum += best;
    any = true;
  }
  return any ? currentSum - bestSum : null;
}

interface SessionBestEntry {
  tla: string;
  value: string;
}

export function SectorTimes() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
  const [showMiniSectors, setShowMiniSectors] = useState(true);
  // Expands every row uniformly to show the live delta/current-lap-time
  // lines, or hides them uniformly — the alternative to a per-row automatic
  // show/hide (which changed row height every time a driver went on/off
  // track) is a single, deliberate, user-controlled toggle.
  const [qualyMode, setQualyMode] = useState(true);

  // Whichever driver currently holds overallBest for a sector *is* the
  // session's fastest for it — the feed computes this flag itself, so no
  // separate accumulation is needed here.
  const sessionBest = useMemo<Array<SessionBestEntry | null>>(() => {
    const best: Array<SessionBestEntry | null> = [null, null, null];
    for (const num of order) {
      const d = drivers?.[num];
      if (!d) continue;
      d.sectors.forEach((s, i) => {
        if (s.overallBest && s.ms !== null) best[i] = { tla: d.tla, value: s.value };
      });
    }
    return best;
  }, [order, drivers]);

  return (
    <Panel
      title="Sector Times"
      meta="Last completed lap"
      right={
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            onClick={() => setQualyMode((v) => !v)}
            className="f1-overline"
            style={{
              cursor: "pointer",
              fontSize: 9.5,
              padding: "4px 9px",
              borderRadius: 1,
              border: `1px solid ${qualyMode ? F1.purple : F1.border2}`,
              background: qualyMode ? "rgba(196,107,255,.14)" : "transparent",
              color: qualyMode ? F1.purple : F1.muted,
            }}
          >
            Qualy mode
          </button>
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
        </div>
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
      {/* Pinned session-best reference row — hidden in Qualy mode, since that
          mode is specifically about comparing each driver to their own best
          lap; a cross-driver session-best reference sits alongside that
          confusingly. Shown in the plain view otherwise, outside the
          scrollable list below so it stays visible regardless of scroll. */}
      {!qualyMode && (
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: COLS,
            gap: 4,
            padding: "5px 8px",
            background: "rgba(196,107,255,.08)",
            borderTop: `1px solid ${F1.purple}44`,
            borderBottom: `1px solid ${F1.purple}44`,
          }}
        >
          <span className="f1-overline" style={{ fontSize: 9.5, fontWeight: 700, color: F1.purple }}>BEST</span>
          {sessionBest.map((entry, i) => (
            <div key={i}>
              <span className="f1-mono" style={{ fontSize: 11.5, fontWeight: 700, color: F1.purple }}>
                {orDash(entry?.value)}
              </span>
              {entry && (
                <span className="f1-overline" style={{ fontSize: 9, color: F1.muted2, marginLeft: 5 }}>
                  {entry.tla}
                </span>
              )}
            </div>
          ))}
          <span />
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {order.map((num) => {
          const d = drivers?.[num];
          if (!d) return null;
          const liveMs = currentLapMs(d);
          const cumDelta = cumulativeDelta(d);
          const onTrackColor = cumDelta !== null && cumDelta < 0 ? F1.green : F1.amber;
          return (
            <div
              key={num}
              className="grid items-center"
              style={{ gridTemplateColumns: COLS, gap: 4, padding: "5px 8px", borderTop: "1px solid rgba(255,255,255,.04)" }}
            >
              <span className="f1-mono" style={{ fontWeight: 700, fontSize: 12 }}>{d.tla}</span>
              {d.sectors.map((s, i) => {
                const best = d.bestLapSectors[i];
                // Comparable-to-own-best-lap only when this sector is fresh
                // (belongs to the lap currently being timed) — never colored
                // from the feed's own overallBest/personalBest flags here,
                // since those mix independently-best sectors across laps,
                // which is exactly the comparison this feature must avoid.
                const comparable = d.sectorsFresh[i] && best !== null && s.ms !== null;
                const deltaMs = comparable ? s.ms! - best! : null;
                const color = comparable ? (deltaMs! < 0 ? F1.green : F1.amber) : timingColor(s);
                return (
                  <div key={i}>
                    <span className="f1-mono" style={{ fontSize: 11.5, color }}>{orDash(s.value)}</span>
                    {qualyMode && <DeltaLine deltaMs={deltaMs} />}
                    {showMiniSectors && <SegmentDots segments={s.segments} />}
                  </div>
                );
              })}
              <div style={{ textAlign: "right" }}>
                <span className="f1-mono" style={{ fontSize: 11.5, color: timingColor(d.lastLap) }}>{orDash(d.lastLap.value)}</span>
                {qualyMode && (
                  <div
                    className="f1-mono"
                    style={{
                      fontSize: 9.5,
                      height: 13,
                      lineHeight: "13px",
                      color: onTrackColor,
                      visibility: liveMs !== null ? "visible" : "hidden",
                    }}
                  >
                    on track {liveMs !== null ? formatMs(liveMs) : "0:00.000"}
                    {cumDelta !== null && ` (${formatDelta(cumDelta)})`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
