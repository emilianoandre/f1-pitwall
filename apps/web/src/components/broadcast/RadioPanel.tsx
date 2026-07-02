"use client";

import { useMemo, useRef, useState } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { F1, teamHex } from "@/lib/design";
import type { RaceControlMessage, TeamRadioClip } from "@f1-dash/types";

function timeOnly(utc: string): string {
  const t = Date.parse(utc);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(11, 19);
}

function rcColor(m: RaceControlMessage): string {
  const f = (m.flag ?? "").toUpperCase();
  if (f.includes("RED")) return F1.red;
  if (f.includes("YELLOW")) return F1.amber;
  if (f.includes("GREEN")) return F1.green;
  if (f.includes("BLUE")) return "#4FA0F5";
  if (m.category === "SafetyCar") return F1.amber;
  return F1.muted2;
}

/**
 * Best-available text for a radio clip. The feed has no audio transcript, so we
 * surface the closest race-control message mentioning that driver (same source
 * as the driver-detail radio) within a few minutes of the clip.
 */
function textForClip(clip: TeamRadioClip, messages: RaceControlMessage[]): string | null {
  const clipT = Date.parse(clip.utc);
  // Prefer the most recent race-control message mentioning this driver at or
  // before the clip; fall back to the closest mention overall.
  let latestBefore: { msg: string; t: number } | null = null;
  let closest: { msg: string; dt: number } | null = null;
  for (const m of messages) {
    if (!m.message.includes(clip.tla)) continue;
    const t = Date.parse(m.utc);
    if (!Number.isFinite(t)) continue;
    if (t <= clipT && (!latestBefore || t > latestBefore.t)) latestBefore = { msg: m.message, t };
    const dt = Math.abs(t - clipT);
    if (!closest || dt < closest.dt) closest = { msg: m.message, dt };
  }
  return latestBefore?.msg ?? closest?.msg ?? null;
}

function TeamRadioTab({ clips, messages }: { clips: TeamRadioClip[]; messages: RaceControlMessage[] }) {
  const [team, setTeam] = useState<string>("ALL");
  const [view, setView] = useState<"audio" | "transcript">("audio");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Unique teams present, in first-seen order.
  const teams = useMemo(() => {
    const seen = new Map<string, string>(); // name → colour
    for (const c of clips) if (!seen.has(c.teamName)) seen.set(c.teamName, c.teamColour);
    return [...seen.entries()].map(([name, colour]) => ({ name, colour }));
  }, [clips]);

  const filtered = useMemo(() => {
    const list = team === "ALL" ? clips : clips.filter((c) => c.teamName === team);
    return [...list].reverse(); // newest first
  }, [clips, team]);

  const play = (url: string) => {
    if (!audioRef.current) return;
    if (playing === url) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }
    audioRef.current.src = url;
    void audioRef.current.play().catch(() => {});
    setPlaying(url);
  };

  const chip = (active: boolean, colour?: string) =>
    ({
      cursor: "pointer",
      fontSize: 10.5,
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 2,
      whiteSpace: "nowrap",
      border: `1px solid ${active ? (colour ? teamHex(colour) : F1.border2) : F1.border}`,
      background: active ? (colour ? `${teamHex(colour)}26` : F1.elev) : "transparent",
      color: active ? F1.text : F1.muted,
    }) as const;

  const viewBtn = (active: boolean) =>
    ({
      cursor: "pointer",
      border: "none",
      borderRadius: 1,
      padding: "3px 10px",
      fontSize: 10.5,
      fontWeight: 600,
      background: active ? F1.elev : "transparent",
      color: active ? F1.text : F1.muted2,
    }) as const;

  return (
    <>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} />
      {/* Audio / Transcript toggle */}
      <div className="flex items-center justify-between" style={{ padding: "0 2px 8px" }}>
        <div className="flex" style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 1, padding: 3 }}>
          <button style={viewBtn(view === "audio")} onClick={() => setView("audio")}>Audio</button>
          <button style={viewBtn(view === "transcript")} onClick={() => setView("transcript")}>Transcript</button>
        </div>
      </div>
      {/* Team filter */}
      <div className="flex flex-wrap gap-[5px]" style={{ padding: "0 2px 8px" }}>
        <button style={chip(team === "ALL")} onClick={() => setTeam("ALL")}>All teams</button>
        {teams.map((t) => (
          <button key={t.name} style={chip(team === t.name, t.colour)} onClick={() => setTeam(t.name)}>
            <span className="inline-block align-middle" style={{ width: 7, height: 7, borderRadius: "50%", background: teamHex(t.colour), marginRight: 5 }} />
            {t.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-[7px] overflow-y-auto" style={{ maxHeight: 220 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: F1.muted2, padding: "10px 0" }}>
            {clips.length === 0 ? "No team radio yet" : "No clips for this team"}
          </div>
        ) : (
          filtered.map((c, i) => {
            const team = teamHex(c.teamColour);
            const isPlaying = playing === c.audioUrl;
            const transcript = view === "transcript" ? textForClip(c, messages) : null;
            return (
              <div key={`${c.utc}-${i}`} className="f1-rise flex items-start gap-[10px]" style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 3, padding: "6px 9px" }}>
                <button
                  onClick={() => play(c.audioUrl)}
                  className="flex items-center justify-center"
                  style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", border: "none", cursor: "pointer", background: isPlaying ? F1.accent : team, color: "#fff", fontSize: 11, marginTop: 1 }}
                  aria-label={isPlaying ? "pause" : "play"}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: team, flex: "none" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[8px]">
                    <span className="f1-mono" style={{ fontWeight: 700, fontSize: 12, color: team }}>{c.tla}</span>
                    <span style={{ fontSize: 10.5, color: F1.muted2 }}>{c.teamName}</span>
                    <span style={{ fontSize: 10, color: F1.muted2, marginLeft: "auto" }}>{timeOnly(c.utc)}</span>
                  </div>
                  {view === "transcript" &&
                    (transcript ? (
                      <div style={{ fontSize: 12, color: F1.muted, lineHeight: 1.4, marginTop: 3 }}>{transcript}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: F1.muted2, fontStyle: "italic", marginTop: 3 }}>
                        No transcript text available — play the clip to listen
                      </div>
                    ))}
                </div>
                {isPlaying && <span className="f1-blink" style={{ fontSize: 9, color: F1.accent2, flex: "none" }}>●</span>}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function RaceControlTab({ messages }: { messages: RaceControlMessage[] }) {
  const ordered = [...messages].reverse();
  return (
    <div className="flex flex-col gap-[8px] overflow-y-auto" style={{ maxHeight: 250 }}>
      {ordered.length === 0 ? (
        <div style={{ fontSize: 12, color: F1.muted2, padding: "10px 0" }}>No messages yet</div>
      ) : (
        ordered.map((m, i) => {
          const color = rcColor(m);
          return (
            <div key={`${m.utc}-${i}`} className="f1-rise flex gap-[10px]">
              <span style={{ width: 3, borderRadius: 2, background: color, flex: "none" }} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-[8px]" style={{ marginBottom: 2 }}>
                  <span className="f1-mono" style={{ fontWeight: 700, fontSize: 11, color }}>{m.category || "MSG"}</span>
                  <span style={{ fontSize: 10, color: F1.muted2 }}>{timeOnly(m.utc)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: F1.muted, lineHeight: 1.4 }}>{m.message}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function RadioPanel() {
  const clips = useLiveStore((s) => s.state?.teamRadio) ?? [];
  const messages = useLiveStore((s) => s.state?.raceControl) ?? [];
  const [tab, setTab] = useState<"radio" | "control">("radio");

  const tabBtn = (active: boolean) =>
    ({
      cursor: "pointer",
      background: "transparent",
      border: "none",
      borderBottom: `2px solid ${active ? F1.accent : "transparent"}`,
      color: active ? F1.text : F1.muted2,
      fontSize: 13,
      fontWeight: 600,
      padding: "2px 2px 6px",
    }) as const;

  return (
    <div className="f1-panel flex flex-col overflow-hidden" style={{ gridArea: "radio" }}>
      <div className="flex items-center gap-[16px]" style={{ padding: "12px 16px 6px", borderBottom: `1px solid ${F1.border}` }}>
        <button className="f1-cond" style={tabBtn(tab === "radio")} onClick={() => setTab("radio")}>
          Team Radio <span style={{ color: F1.muted2, fontWeight: 400 }}>({clips.length})</span>
        </button>
        <button className="f1-cond" style={tabBtn(tab === "control")} onClick={() => setTab("control")}>
          Race Control <span style={{ color: F1.muted2, fontWeight: 400 }}>({messages.length})</span>
        </button>
        <span className="f1-blink ml-auto" style={{ width: 7, height: 7, borderRadius: "50%", background: F1.red }} />
      </div>
      <div style={{ padding: "10px 14px 14px" }}>
        {tab === "radio" ? <TeamRadioTab clips={clips} messages={messages} /> : <RaceControlTab messages={messages} />}
      </div>
    </div>
  );
}
