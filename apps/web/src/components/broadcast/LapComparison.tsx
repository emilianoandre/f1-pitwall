"use client";

import { useLiveStore } from "@/lib/liveStore";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, contrastText } from "@/lib/design";

const LAPS_SHOWN = 10;

/** m:ss.mmm lap-time formatting — LapHistoryPoint only carries a raw ms
 * value, unlike the live TimedValue fields elsewhere which come pre-formatted. */
function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(3);
  return minutes > 0 ? `${minutes}:${seconds.padStart(6, "0")}` : seconds;
}

export function LapComparison() {
  const compareMode = useLiveStore((s) => s.compareMode);
  const compareSelection = useLiveStore((s) => s.compareSelection);
  const drivers = useLiveStore((s) => s.state?.drivers);
  const lapHistory = useLiveStore((s) => s.state?.lapHistory);

  if (!compareMode) return null;

  const columns = compareSelection.map((num) => ({
    num,
    driver: drivers?.[num],
    laps: (lapHistory?.[num] ?? []).slice(-LAPS_SHOWN),
  }));

  const lapNumbers = Array.from(new Set(columns.flatMap((c) => c.laps.map((l) => l.lap)))).sort(
    (a, b) => a - b,
  );

  return (
    <Panel title="Lap Comparison" style={{ gridArea: "compare" }}>
      {columns.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12.5, color: F1.muted2 }}>
          Select up to 3 drivers in Live Timing to compare their last {LAPS_SHOWN} laps.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="f1-mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", color: F1.muted2, fontWeight: 400, fontSize: 10.5 }}>
                  LAP
                </th>
                {columns.map(({ num, driver }) => {
                  const team = teamHex(driver?.teamColour);
                  return (
                    <th key={num} style={{ padding: "4px 8px", textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 7px",
                          borderRadius: 2,
                          background: team,
                          color: contrastText(team),
                          fontWeight: 700,
                          fontSize: 11.5,
                        }}
                      >
                        {driver?.tla ?? "—"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lapNumbers.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} style={{ padding: "16px 0", textAlign: "center", color: F1.muted2 }}>
                    No completed laps yet.
                  </td>
                </tr>
              ) : (
                lapNumbers.map((lap) => {
                  const timesMs = columns.map((c) => c.laps.find((l) => l.lap === lap)?.timeMs ?? null);
                  const fastestMs = Math.min(...timesMs.filter((ms): ms is number => ms !== null));
                  return (
                    <tr key={lap} style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
                      <td style={{ padding: "4px 8px", color: F1.muted2 }}>{lap}</td>
                      {timesMs.map((ms, i) => (
                        <td
                          key={columns[i]?.num ?? i}
                          style={{
                            padding: "4px 8px",
                            textAlign: "right",
                            color: ms !== null && ms === fastestMs ? F1.green : F1.text,
                          }}
                        >
                          {ms !== null ? formatLapTime(ms) : "–"}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
