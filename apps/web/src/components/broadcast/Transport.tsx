"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { playerControl } from "@/lib/playerApi";
import { F1, raceClock } from "@/lib/design";

const SPEEDS = [0.5, 1, 2, 4, 10, 30];

export function Transport() {
  const player = useLiveStore((s) => s.player);
  const [dragFrac, setDragFrac] = useState<number | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
  }, []);

  if (!player || !player.loaded) return null;

  const span = Math.max(1, player.endMs - player.startMs);
  const liveFrac = (player.playheadMs - player.startMs) / span;
  const frac = dragFrac ?? liveFrac;
  const elapsedSec = (frac * span) / 1000;
  const totalSec = span / 1000;

  const onScrub = (f: number) => {
    setDragFrac(f);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => void playerControl({ action: "seek", fraction: f }), 60);
  };
  const commit = (f: number) => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
    void playerControl({ action: "seek", fraction: f });
    setTimeout(() => setDragFrac(null), 250);
  };

  const speedBtn = (active: boolean) =>
    ({
      cursor: "pointer",
      fontSize: 11.5,
      fontWeight: 600,
      padding: "5px 9px",
      borderRadius: 1,
      border: `1px solid ${active ? "rgba(225,6,0,.5)" : F1.border}`,
      background: active ? "rgba(225,6,0,.16)" : F1.panel2,
      color: active ? F1.accent2 : F1.muted,
    }) as const;

  return (
    <div
      className="mb-[14px] flex items-center gap-[16px]"
      style={{ background: F1.panel, border: `1px solid ${F1.border}`, borderRadius: 3, padding: "12px 18px" }}
    >
      <button
        onClick={() => void playerControl({ action: player.playing ? "pause" : "play" })}
        className="flex items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: F1.accent, color: "#fff", fontSize: 16, cursor: "pointer", flex: "none" }}
        aria-label={player.playing ? "pause" : "play"}
      >
        {player.playing ? "❚❚" : "▶"}
      </button>

      <div className="f1-mono" style={{ fontSize: 13, color: F1.muted, flex: "none", width: 120 }}>
        {raceClock(elapsedSec)} <span style={{ color: F1.muted2 }}>/ {raceClock(totalSec)}</span>
      </div>

      <input
        type="range"
        className="f1-range flex-1"
        min={0}
        max={1}
        step={0.0005}
        value={frac}
        style={{ ["--pct" as string]: `${frac * 100}%` }}
        onChange={(e) => onScrub(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
        aria-label="timeline scrubber"
      />

      <div className="flex gap-[5px]" style={{ flex: "none" }}>
        {SPEEDS.map((sp) => (
          <button key={sp} style={speedBtn(player.speed === sp)} onClick={() => void playerControl({ action: "speed", speed: sp })}>
            {sp}×
          </button>
        ))}
      </div>
    </div>
  );
}
