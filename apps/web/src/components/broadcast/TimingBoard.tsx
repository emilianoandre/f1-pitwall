"use client";

import { useState } from "react";
import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { F1, teamHex, contrastText, COMPOUND, timingColor, orDash } from "@/lib/design";
import type { DriverState, SegmentStatus } from "@f1-dash/types";

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
 * same sector in the driver's own standing best lap this qualifying segment
 * — never a mix of independently-best sectors from different laps, and
 * never a lap from a previous Q1/Q2/Q3 segment (see bestLapSectors in
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

function SectorBreakdown({ d, showMiniSectors, qualyMode }: { d: DriverState; showMiniSectors: boolean; qualyMode: boolean }) {
  const liveMs = currentLapMs(d);
  const cumDelta = cumulativeDelta(d);
  const onTrackColor = cumDelta !== null && cumDelta < 0 ? F1.green : F1.amber;

  return (
    <div style={{ paddingLeft: 35, paddingRight: 8, paddingBottom: 4 }}>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {d.sectors.map((s, i) => {
          const best = d.bestLapSectors[i];
          // Comparable-to-own-best-lap only when this sector is fresh
          // (belongs to the lap currently being timed) — never colored from
          // the feed's own overallBest/personalBest flags here, since those
          // mix independently-best sectors across laps, which is exactly
          // the comparison this feature must avoid.
          const comparable = d.sectorsFresh[i] && best !== null && s.ms !== null;
          const deltaMs = comparable ? s.ms! - best! : null;
          const color = comparable ? (deltaMs! < 0 ? F1.green : F1.amber) : timingColor(s);
          return (
            <div key={i}>
              <span className="f1-mono" style={{ fontSize: 11, color }}>{orDash(s.value)}</span>
              {qualyMode && <DeltaLine deltaMs={deltaMs} />}
              {showMiniSectors && <SegmentDots segments={s.segments} />}
            </div>
          );
        })}
      </div>
      {qualyMode && (
        <div
          className="f1-mono"
          style={{
            fontSize: 9.5,
            height: 13,
            lineHeight: "13px",
            marginTop: 3,
            color: onTrackColor,
            visibility: liveMs !== null ? "visible" : "hidden",
          }}
        >
          on track {liveMs !== null ? formatMs(liveMs) : "0:00.000"}
          {cumDelta !== null && ` (${formatDelta(cumDelta)})`}
        </div>
      )}
    </div>
  );
}

function Row({
  num,
  showBestLap,
  compareMode,
  showSectors,
  showMiniSectors,
  qualyMode,
}: {
  num: string;
  showBestLap: boolean;
  compareMode: boolean;
  showSectors: boolean;
  showMiniSectors: boolean;
  qualyMode: boolean;
}) {
  const d = useLiveStore((s) => s.state?.drivers[num]);
  const focus = useFocusNumber();
  const setFocus = useLiveStore((s) => s.setFocus);
  const compareSelection = useLiveStore((s) => s.compareSelection);
  const toggleCompareDriver = useLiveStore((s) => s.toggleCompareDriver);
  if (!d) return null;

  const team = teamHex(d.teamColour);
  const compareIndex = compareSelection.indexOf(num);
  const isFocus = !compareMode && focus === num;
  const isSelected = compareMode && compareIndex >= 0;
  const comp = COMPOUND[d.currentCompound];
  const intMs = d.intervalMs;
  const intColor = intMs !== null && intMs < 1000 ? F1.green : F1.text;

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
      <div
        onClick={() => (compareMode ? toggleCompareDriver(num) : setFocus(num))}
        className="flex items-center gap-[9px] px-[12px] cursor-pointer"
        style={{
          padding: "6px 12px",
          background: isFocus || isSelected ? `${team}22` : "transparent",
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
        {isSelected && (
          <span
            title="Selected for comparison"
            style={{ fontSize: 9, fontWeight: 700, color: team, border: `1px solid ${team}88`, borderRadius: 2, padding: "1px 4px" }}
          >
            {compareIndex + 1}
          </span>
        )}
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
        <span className="f1-mono text-right" style={{ width: 56, fontSize: 12, color: timingColor(showBestLap ? d.bestLap : d.lastLap) }}>
          {orDash(showBestLap ? d.bestLap.value : d.lastLap.value)}
        </span>
      </div>
      {showSectors && <SectorBreakdown d={d} showMiniSectors={showMiniSectors} qualyMode={qualyMode} />}
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
  const sessionType = useLiveStore((s) => s.state?.session.type);
  const showBestLap = sessionType === "Practice" || sessionType === "Qualifying";
  const compareMode = useLiveStore((s) => s.compareMode);
  const setCompareMode = useLiveStore((s) => s.setCompareMode);
  // Lifted to the shared store (not local state) — Dashboard reflows the
  // whole grid (Live Timing expands to take over columns 2+3) when this
  // toggles, so it needs to read it too.
  const showSectors = useLiveStore((s) => s.showSectorTimes);
  const setShowSectors = useLiveStore((s) => s.setShowSectorTimes);
  const [showMiniSectors, setShowMiniSectors] = useState(true);
  const [qualyMode, setQualyMode] = useState(true);

  const toggleStyle = (active: boolean, color: string) =>
    ({
      cursor: "pointer",
      border: `1px solid ${active ? color : F1.border2}`,
      borderRadius: 2,
      padding: "3px 9px",
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: ".04em",
      background: active ? color : "transparent",
      color: active ? "#fff" : F1.muted2,
    }) as const;

  return (
    <div className="f1-panel flex flex-col overflow-hidden" style={{ gridArea: "board" }}>
      <div
        className="flex flex-col"
        style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${F1.border}`, gap: 8 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[10px]">
            <span className="f1-cond" style={{ fontWeight: 500, fontSize: 15 }}>Live Timing</span>
            <button onClick={() => setCompareMode(!compareMode)} className="f1-cond" style={toggleStyle(compareMode, F1.accent)}>
              COMPARE
            </button>
            <button onClick={() => setShowSectors(!showSectors)} className="f1-cond" style={toggleStyle(showSectors, F1.purple)}>
              SECTOR TIMES
            </button>
          </div>
          <div className="flex gap-[14px] f1-overline" style={{ fontSize: 9.5 }}>
            <span style={{ width: 56, textAlign: "right" }}>INTERVAL</span>
            <span style={{ width: 56, textAlign: "right" }}>{showBestLap ? "BEST LAP" : "LAST LAP"}</span>
          </div>
        </div>
        {showSectors && (
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
        )}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {order.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: F1.muted2 }}>
            Waiting for timing…
          </div>
        ) : (
          order.map((num) => (
            <Row
              key={num}
              num={num}
              showBestLap={showBestLap}
              compareMode={compareMode}
              showSectors={showSectors}
              showMiniSectors={showMiniSectors}
              qualyMode={qualyMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
