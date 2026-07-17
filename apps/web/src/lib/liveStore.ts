"use client";

import { create } from "zustand";
import type { SessionState, PlayerStatus, IngestMode } from "@f1-dash/types";

interface LiveStore {
  state: SessionState | null;
  /** Whether the browser's own SSE connection to the app is open. */
  connected: boolean;
  /** Whether ingest's upstream feed (F1TV in live mode) is connected. Always true in player mode. */
  feedConnected: boolean;
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

  setState: (state: SessionState | null, ts: number) => void;
  setConnected: (connected: boolean) => void;
  setFeedConnected: (feedConnected: boolean) => void;
  setDelayMs: (delayMs: number) => void;
  setPlayer: (player: PlayerStatus | null) => void;
  setMode: (mode: IngestMode) => void;
  setFocus: (racingNumber: string | null) => void;
  setScreen: (screen: "picker" | "dashboard" | "driver") => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  state: null,
  connected: false,
  feedConnected: false,
  delayMs: 0,
  lastAppliedTs: null,
  mode: null,
  player: null,
  focus: null,
  screen: "picker",
  setState: (state, ts) => set({ state, lastAppliedTs: ts }),
  setConnected: (connected) => set({ connected }),
  setFeedConnected: (feedConnected) => set({ feedConnected }),
  setDelayMs: (delayMs) => set({ delayMs }),
  setPlayer: (player) => set({ player }),
  setMode: (mode) => set({ mode }),
  setFocus: (focus) => set({ focus }),
  setScreen: (screen) => set({ screen }),
}));

/** Resolve the effective focus driver: explicit selection, else current leader. */
export function useFocusNumber(): string | null {
  return useLiveStore((s) => {
    if (s.focus && s.state?.drivers[s.focus]) return s.focus;
    return s.state?.order[0] ?? null;
  });
}
