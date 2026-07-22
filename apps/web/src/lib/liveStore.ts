"use client";

import { create } from "zustand";
import type { SessionState, PlayerStatus, IngestMode } from "@f1-dash/types";

interface LiveStore {
  state: SessionState | null;
  /** Whether the browser's own SSE connection to the app is open. */
  connected: boolean;
  /** Whether ingest's upstream feed (F1TV in live mode) is connected. Always true in player mode. */
  feedConnected: boolean;
  /** Whether the OpenF1 supplementary feed (CarData/Position) is connected. Always false outside live mode. */
  openf1Connected: boolean;
  /** Broadcast-sync delay in ms (live mode only). */
  delayMs: number;
  lastAppliedTs: number | null;

  /** Current ingest mode reported by the server. */
  mode: IngestMode | null;
  /** Player status when in player mode; null otherwise. */
  player: PlayerStatus | null;

  /** Racing number of the focused driver (telemetry/H2H/detail); null = auto. */
  focus: string | null;
  /** Which top-level screen is showing. */
  screen: "picker" | "dashboard" | "driver";

  /** Whether the Lap Comparison panel is toggled on. */
  compareMode: boolean;
  /** Racing numbers picked for lap comparison, in selection order (max 3). */
  compareSelection: string[];

  setState: (state: SessionState | null, ts: number) => void;
  setConnected: (connected: boolean) => void;
  setFeedConnected: (feedConnected: boolean) => void;
  setOpenf1Connected: (openf1Connected: boolean) => void;
  setDelayMs: (delayMs: number) => void;
  setPlayer: (player: PlayerStatus | null) => void;
  setMode: (mode: IngestMode) => void;
  setFocus: (racingNumber: string | null) => void;
  setScreen: (screen: "picker" | "dashboard" | "driver") => void;
  setCompareMode: (on: boolean) => void;
  /** Adds (up to 3) or removes a driver from the comparison selection. */
  toggleCompareDriver: (racingNumber: string) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  state: null,
  connected: false,
  feedConnected: false,
  openf1Connected: false,
  delayMs: 0,
  lastAppliedTs: null,
  mode: null,
  player: null,
  focus: null,
  screen: "picker",
  compareMode: false,
  compareSelection: [],
  setState: (state, ts) => set({ state, lastAppliedTs: ts }),
  setConnected: (connected) => set({ connected }),
  setFeedConnected: (feedConnected) => set({ feedConnected }),
  setOpenf1Connected: (openf1Connected) => set({ openf1Connected }),
  setDelayMs: (delayMs) => set({ delayMs }),
  setPlayer: (player) => set({ player }),
  setMode: (mode) => set({ mode }),
  setFocus: (focus) => set({ focus }),
  setScreen: (screen) => set({ screen }),
  setCompareMode: (compareMode) => set({ compareMode }),
  toggleCompareDriver: (racingNumber) =>
    set((s) => {
      if (s.compareSelection.includes(racingNumber)) {
        return { compareSelection: s.compareSelection.filter((n) => n !== racingNumber) };
      }
      if (s.compareSelection.length >= 3) return {};
      return { compareSelection: [...s.compareSelection, racingNumber] };
    }),
}));

/** Resolve the effective focus driver: explicit selection, else current leader. */
export function useFocusNumber(): string | null {
  return useLiveStore((s) => {
    if (s.focus && s.state?.drivers[s.focus]) return s.focus;
    return s.state?.order[0] ?? null;
  });
}
