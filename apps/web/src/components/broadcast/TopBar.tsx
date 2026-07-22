"use client";

import { useLiveStore } from "@/lib/liveStore";
import { setIngestMode } from "@/lib/playerApi";
import { useSessionClock } from "@/lib/useSessionClock";
import { F1 } from "@/lib/design";
import type { TrackStatus } from "@f1-dash/types";

function flagChip(status: TrackStatus | undefined) {
  switch (status) {
    case "SCDeployed":
      return { label: "SAFETY CAR", bg: "rgba(255,196,0,.16)", bd: "rgba(255,196,0,.5)", fg: F1.amber };
    case "VSC":
    case "VSCEnding":
      return { label: "VSC", bg: "rgba(255,196,0,.16)", bd: "rgba(255,196,0,.5)", fg: F1.amber };
    case "Red":
      return { label: "RED FLAG", bg: "rgba(225,6,0,.18)", bd: "rgba(225,6,0,.55)", fg: F1.accent2 };
    case "Yellow":
      return { label: "YELLOW", bg: "rgba(255,196,0,.14)", bd: "rgba(255,196,0,.45)", fg: F1.amber };
    default:
      return { label: "GREEN", bg: "rgba(52,208,88,.14)", bd: "rgba(52,208,88,.4)", fg: F1.green };
  }
}

export function TopBar() {
  const mode = useLiveStore((s) => s.mode);
  const feedConnected = useLiveStore((s) => s.feedConnected);
  const openf1Connected = useLiveStore((s) => s.openf1Connected);
  const dataSource = useLiveStore((s) => s.dataSource);
  const session = useLiveStore((s) => s.state?.session);
  const trackStatus = useLiveStore((s) => s.state?.trackStatus);
  const setScreen = useLiveStore((s) => s.setScreen);
  const clock = useSessionClock();

  const flag = flagChip(trackStatus);
  const isLive = mode === "live";

  const seg = (active: boolean) =>
    ({
      cursor: "pointer",
      border: "none",
      borderRadius: 1,
      padding: "6px 14px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: ".06em",
      background: active ? F1.elev : "transparent",
      color: active ? F1.text : F1.muted2,
    }) as const;

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-[18px] py-[16px]"
      style={{ background: "linear-gradient(180deg,var(--f1-bg2) 72%,transparent)" }}
    >
      <button
        onClick={() => setScreen("picker")}
        className="f1-panel flex items-center justify-center"
        style={{ width: 38, height: 38, color: F1.muted, fontSize: 17 }}
        aria-label="back"
      >
        ←
      </button>

      <div style={{ minWidth: 210 }}>
        <div className="flex items-center gap-[9px]">
          <span className="f1-cond" style={{ fontWeight: 500, fontSize: 17 }}>
            {session?.meetingName || "No session"}
          </span>
          <span
            className="f1-overline"
            style={{ fontSize: 10, color: F1.muted, border: `1px solid ${F1.border2}`, padding: "2px 7px", borderRadius: 6 }}
          >
            {session?.name || "—"}
          </span>
          {session?.partLabel && (
            <span
              className="f1-overline"
              style={{ fontSize: 10, fontWeight: 700, color: F1.accent2, border: `1px solid ${F1.accent}`, background: "rgba(225,6,0,.14)", padding: "2px 7px", borderRadius: 6 }}
            >
              {session.partLabel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: F1.muted }}>{session?.circuitName}</div>
      </div>

      {/* Live / Replay toggle */}
      <div className="flex flex-col items-start" style={{ gap: 4 }}>
        <div className="flex" style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 1, padding: 4 }}>
          <button style={seg(isLive)} onClick={() => void setIngestMode("live")}>
            <span
              className="f1-blink inline-block align-middle"
              style={{ width: 7, height: 7, borderRadius: "50%", marginRight: 7, background: !isLive ? F1.muted2 : feedConnected ? F1.green : F1.amber }}
            />
            LIVE
          </button>
          <button style={seg(!isLive)} onClick={() => void setIngestMode("player")}>
            REPLAY
          </button>
        </div>
        {/* Shown per data-source-flag: "f1" -> F1TV only, "openf1" -> OpenF1
            only, "mix" -> both. Neither shows outside live mode or before
            the flag's resolved. */}
        {isLive && (dataSource === "f1" || dataSource === "mix") && (
          <span
            className="f1-overline"
            style={{ fontSize: 9.5, color: feedConnected ? F1.green : F1.amber, paddingLeft: 2 }}
          >
            {feedConnected ? "F1TV connected" : "F1TV disconnected"}
          </span>
        )}
        {isLive && (dataSource === "openf1" || dataSource === "mix") && (
          <span
            className="f1-overline"
            style={{ fontSize: 9.5, color: openf1Connected ? F1.green : F1.muted2, paddingLeft: 2 }}
          >
            {openf1Connected ? "OpenF1 connected" : "OpenF1 disconnected"}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-[14px]">
        <div className="text-right">
          <div className="f1-overline" style={{ fontSize: 10, letterSpacing: ".12em" }}>LAP</div>
          <div className="f1-mono" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>
            {clock.currentLap ?? "–"}
            <span style={{ color: F1.muted2, fontWeight: 400 }}>/{clock.totalLaps ?? "–"}</span>
          </div>
        </div>
        <div style={{ width: 1, height: 34, background: F1.border }} />
        <div className="text-right">
          <div className="f1-overline" style={{ fontSize: 10, letterSpacing: ".12em" }}>REMAINING</div>
          <div className="f1-mono" style={{ fontWeight: 500, fontSize: 18, lineHeight: 1, color: F1.muted }}>
            {clock.remaining}
          </div>
        </div>
        <div
          className="f1-cond"
          style={{ fontWeight: 700, fontSize: 13, letterSpacing: ".08em", padding: "7px 12px", borderRadius: 2, background: flag.bg, border: `1px solid ${flag.bd}`, color: flag.fg }}
        >
          {flag.label}
        </div>
      </div>
    </div>
  );
}
