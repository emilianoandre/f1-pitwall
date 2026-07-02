"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordingEntry } from "@f1-dash/types";
import { useLiveStore } from "@/lib/liveStore";
import { listRecordings, startDownload, getDownloadStatus, loadRecording, setIngestMode } from "@/lib/playerApi";
import { F1 } from "@/lib/design";

// Current season first — also the default selection. Archive data goes back to 2023.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2023 + 1 }, (_, i) => CURRENT_YEAR - i);

interface GpGroup {
  meeting: string;
  circuit: string;
  sessions: { entry: RecordingEntry; session: string }[];
}

function splitName(name: string) {
  const i = name.indexOf(" — ");
  return i >= 0 ? { meeting: name.slice(0, i), session: name.slice(i + 3) } : { meeting: name, session: "" };
}

interface NextRace {
  name: string;
  circuit: string;
  country: string;
}

export function SessionPicker() {
  const setScreen = useLiveStore((s) => s.setScreen);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [items, setItems] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [next, setNext] = useState<NextRace | null>(null);

  useEffect(() => {
    setLoading(true);
    void listRecordings(year).then((r) => {
      setItems(r);
      setLoading(false);
    });
  }, [year]);

  useEffect(() => {
    fetch(`/api/schedule`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const now = Date.now();
        const races = d?.races ?? [];
        for (const race of races) {
          const rs = race.sessions?.find((s: { name: string }) => s.name === "Race");
          const t = rs?.start ? Date.parse(rs.start) : 0;
          if (t > now - 4 * 3_600_000) {
            setNext({ name: race.name, circuit: race.circuit, country: race.country });
            return;
          }
        }
      })
      .catch(() => {});
  }, []);

  const groups = useMemo<GpGroup[]>(() => {
    const map = new Map<string, GpGroup>();
    for (const entry of items) {
      const { meeting, session } = splitName(entry.name);
      let g = map.get(meeting);
      if (!g) {
        g = { meeting, circuit: "", sessions: [] };
        map.set(meeting, g);
      }
      g.sessions.push({ entry, session });
    }
    return [...map.values()];
  }, [items]);

  const pollDownload = useCallback(
    (id: string) =>
      new Promise<void>((resolve) => {
        const tick = async () => {
          const st = await getDownloadStatus(id);
          if (!st || st.status === "done") return resolve();
          if (st.status === "error") {
            setProgress((p) => ({ ...p, [id]: "error" }));
            return resolve();
          }
          setProgress((p) => ({ ...p, [id]: `${st.progress.topicsDone}/${st.progress.topicsTotal}` }));
          setTimeout(() => void tick(), 500);
        };
        void tick();
      }),
    [],
  );

  const openSession = async (r: RecordingEntry) => {
    setBusy(r.id);
    try {
      if (!r.downloaded) {
        if (!r.path) return;
        setProgress((p) => ({ ...p, [r.id]: "…" }));
        await startDownload(r.path);
        await pollDownload(r.id);
      }
      await loadRecording(r.id);
      setScreen("dashboard");
    } finally {
      setBusy(null);
    }
  };

  const goLive = async () => {
    await setIngestMode("live");
    setScreen("dashboard");
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 1180, padding: "34px 32px 80px" }}>
      {/* Brand bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: 34 }}>
        <div className="flex items-center gap-[14px]">
          <div
            className="f1-cond flex items-center justify-center"
            style={{ width: 46, height: 46, borderRadius: 3, background: "linear-gradient(135deg,var(--f1-accent),#7A0400)", fontWeight: 700, fontSize: 22, boxShadow: "0 6px 18px rgba(225,6,0,.35)" }}
          >
            P
          </div>
          <div>
            <div className="f1-cond" style={{ fontWeight: 700, fontSize: 20, letterSpacing: ".02em" }}>PitWall</div>
            <div style={{ fontSize: 12, color: F1.muted, letterSpacing: ".04em" }}>Race Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-[8px]" style={{ fontSize: 12.5, color: F1.muted }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: F1.green }} />
          Systems nominal
        </div>
      </div>

      {/* Live hero */}
      <div style={{ fontSize: 12, letterSpacing: ".16em", color: F1.accent2, fontWeight: 600, marginBottom: 10 }}>
        LIVE FEED
      </div>
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: 3, border: `1px solid ${F1.border}`, background: "linear-gradient(115deg,var(--f1-panel) 0%,#1A0C0C 55%,#2A0D0D 100%)", boxShadow: "0 20px 50px -20px rgba(0,0,0,.7)" }}
      >
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(500px 300px at 88% 120%, rgba(232,56,79,.16), transparent 60%)" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-[24px]" style={{ padding: "34px 36px" }}>
          <div style={{ maxWidth: 560 }}>
            <div className="inline-flex items-center gap-[8px]" style={{ background: "rgba(232,56,79,.16)", border: "1px solid rgba(232,56,79,.4)", color: "#ff9aa6", padding: "6px 12px", borderRadius: 1, fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", marginBottom: 18 }}>
              <span className="f1-blink" style={{ width: 8, height: 8, borderRadius: "50%", background: F1.red }} />
              LIVE FEED · CONNECT ANY TIME
            </div>
            <h1 className="f1-cond" style={{ fontWeight: 700, fontSize: 42, lineHeight: 1.05, margin: "0 0 8px" }}>
              {next?.name ?? "Formula 1"}
            </h1>
            <div style={{ color: F1.muted, fontSize: 16, marginBottom: 4 }}>
              {next ? `${next.circuit}${next.country ? ` · ${next.country}` : ""}` : "Official timing feed"}
            </div>
            <div style={{ color: F1.muted2, fontSize: 14 }}>Positions, telemetry & radio when a session is running</div>
          </div>
          <div className="flex flex-col items-start gap-[12px]">
            <button
              onClick={() => void goLive()}
              className="f1-cond f1-lift flex items-center gap-[10px]"
              style={{ cursor: "pointer", border: "none", background: F1.accent, color: "#fff", fontWeight: 500, fontSize: 15.5, padding: "14px 30px", borderRadius: 1, boxShadow: "0 10px 26px -8px rgba(225,6,0,.7)" }}
            >
              <span style={{ fontSize: 19 }}>▶</span> Enter live session
            </button>
            <div style={{ fontSize: 12.5, color: F1.muted }}>Falls back to the schedule when idle</div>
          </div>
        </div>
      </div>

      {/* Season archive */}
      <div className="flex flex-wrap items-center justify-between gap-[12px]" style={{ margin: "36px 0 16px" }}>
        <div className="f1-cond" style={{ fontWeight: 700, fontSize: 22 }}>Season Archive</div>
        <div className="flex items-center gap-[14px]">
          <span style={{ fontSize: 12.5, color: F1.muted }}>{groups.length} events · {year}</span>
          <div className="flex" style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 1, padding: 4 }}>
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className="f1-mono"
                style={{ cursor: "pointer", border: "none", borderRadius: 1, padding: "5px 10px", fontSize: 12, background: y === year ? F1.elev : "transparent", color: y === year ? F1.text : F1.muted2 }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: F1.muted2 }}>Loading sessions…</div>
      ) : (
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
          {groups.map((g) => {
            const dl = g.sessions.filter((s) => s.entry.downloaded).length;
            return (
              <div key={g.meeting} className="f1-lift" style={{ background: F1.panel2, border: `1px solid ${F1.border}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: 5, background: F1.accent }} />
                <div style={{ padding: "14px 16px 16px" }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                    <span className="f1-overline" style={{ fontSize: 11 }}>{year}</span>
                    {dl > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: F1.green, border: "1px solid rgba(52,208,88,.4)", padding: "2px 7px", borderRadius: 6 }}>
                        {dl} saved
                      </span>
                    )}
                  </div>
                  <div className="f1-cond" style={{ fontWeight: 500, fontSize: 17, marginBottom: 10 }}>{g.meeting}</div>
                  <div className="flex flex-wrap gap-[6px]">
                    {g.sessions.map(({ entry, session }) => (
                      <button
                        key={entry.id}
                        onClick={() => void openSession(entry)}
                        disabled={busy !== null}
                        className="f1-lift"
                        style={{
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "5px 9px",
                          borderRadius: 2,
                          border: `1px solid ${entry.downloaded ? "rgba(52,208,88,.4)" : F1.border}`,
                          background: entry.downloaded ? "rgba(52,208,88,.12)" : F1.panel,
                          color: entry.downloaded ? F1.green : F1.muted,
                        }}
                        title={entry.downloaded ? "Play (downloaded)" : "Download & play"}
                      >
                        {busy === entry.id ? (progress[entry.id] ?? "…") : shortSession(session)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortSession(s: string): string {
  return s
    .replace("Practice ", "FP")
    .replace("Sprint Qualifying", "SQ")
    .replace("Qualifying", "Quali")
    .replace("Sprint", "Sprint");
}
