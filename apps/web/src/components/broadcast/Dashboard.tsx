"use client";

import { useLiveStore } from "@/lib/liveStore";
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { TrackMapPanel } from "./TrackMapPanel";
import { TimingBoard } from "./TimingBoard";
import { Telemetry } from "./Telemetry";
import { TireStrategy } from "./TireStrategy";
import { Weather } from "./Weather";
import { RadioPanel } from "./RadioPanel";
import { HeadToHead } from "./HeadToHead";
import { LapComparison } from "./LapComparison";
import { IdleView } from "@/components/IdleView";
import { F1 } from "@/lib/design";

export function Dashboard() {
  const hasData = useLiveStore((s) => (s.state?.order.length ?? 0) > 0);
  // F1's feed never explicitly clears TimingData/DriverList between events —
  // a finished session's data lingers in the raw store until the next one's
  // own snapshot overwrites it. In live mode, hasData alone can't tell a
  // currently-running/upcoming session apart from a stale one from a past
  // race weekend, so it's gated on the session's own scheduled window too
  // (see isSessionWindowActive in apps/ingest/src/state/transform.ts).
  const sessionActive = useLiveStore((s) => s.state?.session.started ?? false);
  const mode = useLiveStore((s) => s.mode);
  const recordingLoaded = useLiveStore((s) => s.player?.loaded ?? false);
  const setScreen = useLiveStore((s) => s.setScreen);
  const compareMode = useLiveStore((s) => s.compareMode);

  const showPanels =
    (mode === "live" && hasData && sessionActive) || (mode === "player" && recordingLoaded);

  return (
    <div className="mx-auto" style={{ maxWidth: 1640, padding: "0 22px 34px" }}>
      <TopBar />
      {mode === "player" && <Transport />}

      {showPanels ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "minmax(0,1.32fr) minmax(0,1fr) 336px",
            gridTemplateAreas: compareMode
              ? `"track track board" "compare compare board" "tele timing board" "tire tire board" "weather radio board"`
              : `"track track board" "tele timing board" "tire tire board" "weather radio board"`,
            gap: 14,
          }}
        >
          <TrackMapPanel />
          <TimingBoard />
          {compareMode && <LapComparison />}
          <Telemetry />
          <HeadToHead />
          <TireStrategy />
          <Weather />
          <RadioPanel />
        </div>
      ) : mode === "live" ? (
        <IdleView />
      ) : (
        <div className="flex flex-col items-center gap-[16px]" style={{ padding: "80px 0", textAlign: "center" }}>
          <p className="f1-cond" style={{ fontSize: 22, color: F1.text }}>No recording loaded</p>
          <p style={{ maxWidth: 440, fontSize: 13, color: F1.muted }}>
            Go back and pick a session, or switch to Live.
          </p>
          <button
            onClick={() => setScreen("picker")}
            className="f1-cond"
            style={{ background: F1.accent, color: "#fff", padding: "12px 26px", borderRadius: 1, fontSize: 15, border: "none", cursor: "pointer" }}
          >
            Choose a session
          </button>
        </div>
      )}
    </div>
  );
}
