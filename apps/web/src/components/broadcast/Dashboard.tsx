"use client";

import { useState } from "react";
import { useLiveStore } from "@/lib/liveStore";
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { TrackMapPanel } from "./TrackMapPanel";
import { TimingBoard } from "./TimingBoard";
import { Telemetry } from "./Telemetry";
import { SectorTimes } from "./SectorTimes";
import { TireStrategy } from "./TireStrategy";
import { Weather } from "./Weather";
import { RadioPanel } from "./RadioPanel";
import { HeadToHead } from "./HeadToHead";
import { MiniSectorsPanel } from "./MiniSectorsPanel";
import { IdleView } from "@/components/IdleView";
import { F1 } from "@/lib/design";

export function Dashboard() {
  const hasData = useLiveStore((s) => (s.state?.order.length ?? 0) > 0);
  const mode = useLiveStore((s) => s.mode);
  const recordingLoaded = useLiveStore((s) => s.player?.loaded ?? false);
  const setScreen = useLiveStore((s) => s.setScreen);
  const [showMiniSectors, setShowMiniSectors] = useState(false);

  const showPanels = hasData || (mode === "player" && recordingLoaded);

  return (
    <div className="mx-auto" style={{ maxWidth: 1640, padding: "0 22px 34px" }}>
      <TopBar />
      {mode === "player" && <Transport />}

      {showPanels ? (
        <>
          <div className="flex justify-end" style={{ margin: "0 0 10px" }}>
            <button
              onClick={() => setShowMiniSectors((v) => !v)}
              className="f1-overline"
              style={{
                cursor: "pointer",
                fontSize: 10.5,
                padding: "6px 12px",
                borderRadius: 1,
                border: `1px solid ${showMiniSectors ? F1.accent : F1.border2}`,
                background: showMiniSectors ? "rgba(225,6,0,.14)" : "transparent",
                color: showMiniSectors ? F1.accent2 : F1.muted,
              }}
            >
              {showMiniSectors ? "Hide" : "Show"} standings & mini sectors
            </button>
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "minmax(0,1.32fr) minmax(0,1fr) 336px",
              gridTemplateAreas: showMiniSectors
                ? `"track track board" "extra extra board" "tele timing board" "tire tire board" "weather radio h2h"`
                : `"track track board" "tele timing board" "tire tire board" "weather radio h2h"`,
              gap: 14,
            }}
          >
            <TrackMapPanel />
            <TimingBoard />
            {showMiniSectors && <MiniSectorsPanel />}
            <Telemetry />
            <SectorTimes />
            <TireStrategy />
            <Weather />
            <RadioPanel />
            <HeadToHead />
          </div>
        </>
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
