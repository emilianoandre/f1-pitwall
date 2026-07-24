"use client";

import { useMemo, useState } from "react";
import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { F1, teamHex, contrastText, COMPOUND, timingColor, orDash } from "@/lib/design";
import type { DriverState, Sector, SegmentStatus } from "@f1-dash/types";

/** Exact status palette from the Live Timing design handoff — kept separate
 * from the app-wide F1 tokens because the handoff calls these out as values
 * the whole feature depends on being exact (purple/green/yellow/neutral/loss). */
const SECTOR = {
  purple: "#b163ff",
  green: "#36d97a",
  yellow: "#f2c14e",
  neutral: "#3a3f4a",
  loss: "#ff5d5d",
} as const;

const SEGMENT_COLOR: Record<SegmentStatus, string> = {
  none: SECTOR.neutral,
  yellow: SECTOR.yellow,
  green: SECTOR.green,
  purple: SECTOR.purple,
  pit: F1.muted2,
  stopped: SECTOR.loss,
};

/** Collapse a sector's mini-sector statuses into a single representative
 * status, worst-first: any yellow (down on best) anywhere in the sector
 * means the whole sector must not read as green/purple, since that would
 * overstate how the sector actually went. This is what makes the whole
 * sector-time color and the mini-sector strip always agree — never show a
 * green sector time above yellow mini-sectors. */
function aggregateSectorStatus(segments: SegmentStatus[]): SegmentStatus {
  if (segments.some((s) => s === "stopped")) return "stopped";
  if (segments.some((s) => s === "pit")) return "pit";
  if (segments.some((s) => s === "yellow")) return "yellow";
  if (segments.some((s) => s === "green")) return "green";
  if (segments.some((s) => s === "purple")) return "purple";
  return "none";
}

/** The single source of truth for a sector's color — mini-sector dots, the
 * sector-time number, and the collapsed-row pips all derive from this, so
 * they can never disagree. Falls back to the feed's own personalBest/
 * overallBest flags only when there's no real mini-sector data at all. */
function sectorColor(s: Sector): string {
  if (s.ms === null) return "#4a4f5a";
  const agg = aggregateSectorStatus(s.segments);
  return agg !== "none" ? SEGMENT_COLOR[agg] : timingColor(s);
}

function SegmentDots({ segments }: { segments: SegmentStatus[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="flex" style={{ gap: 2, marginBottom: 5 }}>
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            height: 6,
            borderRadius: 2,
            flex: "1 1 0",
            background: SEGMENT_COLOR[s],
            boxShadow: s === "none" ? `inset 0 0 0 1px ${F1.border2}` : "none",
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

/** green if faster than personal best, yellow if slower — independent of
 * the segment-derived sectorColor() above, which answers a different
 * question ("how did this sector go") vs. this ("better or worse than PB"). */
function deltaColor(deltaMs: number): string {
  return deltaMs < 0 ? SECTOR.green : SECTOR.yellow;
}

/** Delta line comparing a fresh (currently-being-timed) sector against the
 * same sector in the driver's own standing best lap this qualifying segment
 * — never a mix of independently-best sectors from different laps, and
 * never a lap from a previous Q1/Q2/Q3 segment (see bestLapSectors in
 * apps/ingest/src/state/derived.ts). Always rendered at a fixed height, even
 * when there's nothing to show (hidden via visibility, not unmounted) — a
 * driver going on/off track must never change row height. */
function DeltaLine({ deltaMs }: { deltaMs: number | null }) {
  return (
    <span
      className="f1-mono"
      style={{
        display: "block",
        fontSize: 10.5,
        fontWeight: 700,
        height: 13,
        lineHeight: "13px",
        color: deltaMs !== null ? deltaColor(deltaMs) : SECTOR.green,
        visibility: deltaMs === null ? "hidden" : "visible",
      }}
    >
      {deltaMs !== null ? formatDelta(deltaMs) : "+0.000"}
    </span>
  );
}

/** 4px gain/loss track with a center tick — green fill growing right from
 * center when faster, red (loss) fill growing left when slower. Width caps
 * at 0.5s so a single huge delta can't blow out the bar. */
function GainLossBar({ deltaMs }: { deltaMs: number | null }) {
  const pct = deltaMs === null ? 0 : Math.min(Math.abs(deltaMs) / 500, 1) * 50;
  return (
    <div style={{ height: 4, background: "#15151b", borderRadius: 2, marginTop: 5, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#2f303a" }} />
      {deltaMs !== null && deltaMs < 0 && (
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: `${pct}%`, background: SECTOR.green, borderRadius: "0 2px 2px 0" }} />
      )}
      {deltaMs !== null && deltaMs > 0 && (
        <div style={{ position: "absolute", right: "50%", top: 0, bottom: 0, width: `${pct}%`, background: SECTOR.loss, borderRadius: "2px 0 0 2px" }} />
      )}
    </div>
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
  const onTrackColor = cumDelta !== null ? deltaColor(cumDelta) : SECTOR.yellow;

  return (
    <div style={{ paddingLeft: 35, paddingRight: 8, paddingBottom: 4 }}>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {d.sectors.map((s, i) => {
          const best = d.bestLapSectors[i];
          // Comparable-to-own-best-lap only when this sector is fresh
          // (belongs to the lap currently being timed) — never mixed with
          // a sector from a different, slower lap (see bestLapSectors in
          // apps/ingest/src/state/derived.ts).
          const comparable = d.sectorsFresh[i] && best !== null && s.ms !== null;
          const deltaMs = comparable ? s.ms! - best! : null;
          const pending = s.ms === null;
          return (
            <div key={i}>
              {showMiniSectors && <SegmentDots segments={s.segments} />}
              <div className="flex items-baseline gap-[8px]">
                <span className="f1-mono" style={{ fontSize: 14, fontWeight: 700, color: sectorColor(s) }}>{orDash(s.value)}</span>
                <DeltaLine deltaMs={deltaMs} />
              </div>
              <GainLossBar deltaMs={pending ? null : deltaMs} />
              {qualyMode && typeof best === "number" && (
                <div className="f1-mono" style={{ fontSize: 9.5, color: "#5b6270", marginTop: 4 }}>
                  PB {formatMs(best)}
                </div>
              )}
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
            marginTop: 6,
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

/** 3 small boxes giving an instant read of the lap shape when the full
 * sector breakdown is collapsed — same per-sector color as the expanded
 * view (sectorColor), just condensed. */
function CompactPips({ sectors }: { sectors: [Sector, Sector, Sector] }) {
  return (
    <div className="flex" style={{ gap: 2, width: 32, flex: "none" }}>
      {sectors.map((s, i) => (
        <span
          key={i}
          style={{ width: 9, height: 6, borderRadius: 2, flex: "none", background: s.ms === null ? "#26262e" : sectorColor(s) }}
        />
      ))}
    </div>
  );
}

/** RUN/PIT/OUT/STOP — derived from the feed's own inPit/pitOut/stopped
 * flags. The feed has no separate "heading into the pits" signal distinct
 * from inPit, so unlike the design reference there's no IN state here. */
function lapState(d: DriverState): "RUN" | "PIT" | "OUT" | "STOP" {
  if (d.stopped) return "STOP";
  if (d.inPit) return "PIT";
  if (d.pitOut) return "OUT";
  return "RUN";
}

const FLAG_COLOR: Record<string, string> = { PIT: SECTOR.yellow, OUT: SECTOR.green, STOP: SECTOR.loss };

/** `compact` swaps the bordered text chip for a small colored dot — used in
 * the collapsed row, which is too narrow (fixed 336px column) to fit a full
 * text badge alongside the new pips + running-delta cluster. Same state,
 * same color, just a tighter footprint. */
function FlagChip({ state, compact }: { state: "RUN" | "PIT" | "OUT" | "STOP"; compact?: boolean }) {
  if (state === "RUN") return null;
  const color = FLAG_COLOR[state];
  if (compact) {
    return <span title={state} style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "none" }} />;
  }
  return (
    <span
      className="f1-mono"
      style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color, border: `1px solid ${color}`, borderRadius: 3, padding: "2px 5px", flex: "none" }}
    >
      {state}
    </span>
  );
}

type GapMode = "leader" | "interval" | "best";

function gapColumnValue(d: DriverState, mode: GapMode, sessionBestLapMs: number | null): { text: string; color: string } {
  if (d.retired) return { text: "OUT", color: F1.muted2 };
  if (mode === "best") {
    if (d.bestLap.ms === null) return { text: "–", color: F1.muted2 };
    if (d.bestLap.overallBest) return { text: "BEST", color: SECTOR.purple };
    if (sessionBestLapMs === null) return { text: "–", color: F1.muted2 };
    return { text: `+${((d.bestLap.ms - sessionBestLapMs) / 1000).toFixed(3)}`, color: SECTOR.yellow };
  }
  if (d.position === 1) return { text: "LEADER", color: F1.green };
  if (mode === "leader") {
    return { text: orDash(d.gapToLeader), color: d.gapToLeaderMs !== null && d.gapToLeaderMs < 1000 ? F1.green : F1.text };
  }
  return { text: orDash(d.interval), color: d.intervalMs !== null && d.intervalMs < 1000 ? F1.green : F1.text };
}

function Row({
  num,
  showBestLap,
  compareMode,
  showSectors,
  showMiniSectors,
  qualyMode,
  gapMode,
  sessionBestLapMs,
}: {
  num: string;
  showBestLap: boolean;
  compareMode: boolean;
  showSectors: boolean;
  showMiniSectors: boolean;
  qualyMode: boolean;
  gapMode: GapMode;
  sessionBestLapMs: number | null;
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
  const isLeader = d.position === 1;
  const comp = COMPOUND[d.currentCompound];
  const gap = gapColumnValue(d, gapMode, sessionBestLapMs);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
      <div
        onClick={() => (compareMode ? toggleCompareDriver(num) : setFocus(num))}
        className="flex items-center gap-[6px] px-[12px] cursor-pointer"
        style={{
          padding: "6px 12px",
          background: isFocus || isSelected ? `${team}22` : isLeader ? `linear-gradient(90deg, ${team}1A, transparent)` : "transparent",
          borderLeft: `2px solid ${isLeader ? team : "transparent"}`,
        }}
      >
        <span
          className="f1-cond flex items-center justify-center"
          style={{ width: 24, height: 22, flex: "none", fontWeight: 700, fontSize: 14, borderRadius: 2, background: team, color: contrastText(team) }}
        >
          {d.position}
        </span>
        <span className="f1-mono" style={{ fontWeight: 700, fontSize: 13.5, width: 34, flex: "none" }}>{d.tla}</span>
        {showSectors ? (
          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, color: F1.muted }}>{d.fullName}</span>
        ) : (
          <>
            <CompactPips sectors={d.sectors} />
            <span
              className="f1-mono"
              style={{ fontSize: 10, fontWeight: 700, width: 38, flex: "none", color: (() => { const cd = cumulativeDelta(d); return cd === null ? "#4a4f5a" : deltaColor(cd); })() }}
            >
              {(() => { const cd = cumulativeDelta(d); return cd === null ? "–" : formatDelta(cd); })()}
            </span>
            <span className="flex-1" style={{ minWidth: 0 }} />
          </>
        )}
        {showSectors && isSelected && (
          <span
            title="Selected for comparison"
            style={{ fontSize: 9, fontWeight: 700, color: team, border: `1px solid ${team}88`, borderRadius: 2, padding: "1px 4px" }}
          >
            {compareIndex + 1}
          </span>
        )}
        {showSectors && d.bestLap.overallBest && (
          <span
            title="Fastest lap"
            style={{ fontSize: 9, fontWeight: 700, color: SECTOR.purple, border: `1px solid ${SECTOR.purple}88`, borderRadius: 2, padding: "1px 4px" }}
          >
            FL
          </span>
        )}
        {showSectors && d.carData?.drs && (
          <span style={{ fontSize: 9, fontWeight: 700, color: F1.green, border: `1px solid rgba(52,208,88,.5)`, borderRadius: 2, padding: "1px 4px" }}>DRS</span>
        )}
        <FlagChip state={lapState(d)} compact={!showSectors} />
        <span
          className="flex items-center justify-center"
          style={{ width: 16, height: 16, borderRadius: 4, flex: "none", background: comp.col, color: comp.text, fontSize: 9, fontWeight: 700 }}
        >
          {comp.letter}
        </span>
        <span className="f1-mono text-right" style={{ width: 54, fontSize: 12, flex: "none", color: gap.color }}>
          {gap.text}
        </span>
        <span className="f1-mono text-right" style={{ width: 54, fontSize: 12, flex: "none", color: timingColor(showBestLap ? d.bestLap : d.lastLap) }}>
          {orDash(showBestLap ? d.bestLap.value : d.lastLap.value)}
        </span>
      </div>
      {showSectors && <SectorBreakdown d={d} showMiniSectors={showMiniSectors} qualyMode={qualyMode} />}
    </div>
  );
}

const LEGEND: { color: string; label: string }[] = [
  { color: SECTOR.purple, label: "Session best" },
  { color: SECTOR.green, label: "Personal best" },
  { color: SECTOR.yellow, label: "Down on best" },
  { color: SECTOR.neutral, label: "No change" },
];

function Legend() {
  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: 14, marginTop: 10, padding: "9px 11px", background: "#0a0a0d", border: "1px solid #17171d", borderRadius: 4, fontSize: 10, color: "#9a9aa2" }}
    >
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: l.color, flex: "none" }} />
          {l.label}
        </span>
      ))}
      <span className="f1-mono" style={{ marginLeft: "auto" }}>
        <span style={{ color: SECTOR.green }}>-0.088</span>/<span style={{ color: SECTOR.yellow }}>+0.144</span> = Δ vs personal best
      </span>
    </div>
  );
}

export function TimingBoard() {
  const order = useLiveStore((s) => s.state?.order) ?? [];
  const drivers = useLiveStore((s) => s.state?.drivers);
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
  const [gapMode, setGapMode] = useState<GapMode>("interval");

  const sessionBestLapMs = useMemo(() => {
    let best: number | null = null;
    for (const num of order) {
      const ms = drivers?.[num]?.bestLap.ms;
      if (ms !== null && ms !== undefined && (best === null || ms < best)) best = ms;
    }
    return best;
  }, [order, drivers]);

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

  const tabStyle = (active: boolean) =>
    ({
      cursor: "pointer",
      userSelect: "none",
      textTransform: "uppercase",
      padding: "3px 8px",
      borderRadius: 2,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: ".05em",
      background: active ? F1.elev : "transparent",
      color: active ? F1.text : F1.muted2,
      border: `1px solid ${active ? F1.border2 : "transparent"}`,
    }) as const;

  return (
    <div className="f1-panel flex flex-col overflow-hidden" style={{ gridArea: "board" }}>
      <div
        className="flex flex-col"
        style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${F1.border}`, gap: 8 }}
      >
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", rowGap: 6 }}>
          <div className="flex items-center gap-[10px]">
            <span className="f1-cond" style={{ fontWeight: 500, fontSize: 15 }}>Live Timing</span>
            <button onClick={() => setCompareMode(!compareMode)} className="f1-cond" style={toggleStyle(compareMode, F1.accent)}>
              COMPARE
            </button>
            <button onClick={() => setShowSectors(!showSectors)} className="f1-cond" style={toggleStyle(showSectors, F1.purple)}>
              SECTOR TIMES
            </button>
          </div>
          <div className="flex items-center gap-[14px]" style={{ marginLeft: "auto" }}>
            <div className="flex" style={{ gap: 4 }}>
              <span onClick={() => setGapMode("leader")} className="f1-overline" style={tabStyle(gapMode === "leader")}>GAP</span>
              <span onClick={() => setGapMode("interval")} className="f1-overline" style={tabStyle(gapMode === "interval")}>INTERVAL</span>
              <span onClick={() => setGapMode("best")} className="f1-overline" style={tabStyle(gapMode === "best")}>BEST LAP</span>
            </div>
            <span className="f1-overline" style={{ fontSize: 9.5, width: 54, textAlign: "right" }}>{showBestLap ? "BEST LAP" : "LAST LAP"}</span>
          </div>
        </div>
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
            onClick={() => showSectors && setShowMiniSectors((v) => !v)}
            className="f1-overline"
            style={{
              cursor: showSectors ? "pointer" : "not-allowed",
              fontSize: 9.5,
              padding: "4px 9px",
              borderRadius: 1,
              border: `1px solid ${showMiniSectors && showSectors ? F1.accent : F1.border2}`,
              background: showMiniSectors && showSectors ? "rgba(225,6,0,.14)" : "transparent",
              color: showMiniSectors && showSectors ? F1.accent2 : F1.muted,
              opacity: showSectors ? 1 : 0.4,
              pointerEvents: showSectors ? "auto" : "none",
            }}
          >
            {showMiniSectors ? "Hide" : "Show"} mini sectors
          </button>
        </div>
        {showSectors && <Legend />}
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
              gapMode={gapMode}
              sessionBestLapMs={sessionBestLapMs}
            />
          ))
        )}
      </div>
    </div>
  );
}
