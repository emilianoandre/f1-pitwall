"use client";

import { useEffect } from "react";
import type { SseEvent } from "@f1-dash/types";
import { useLiveStore } from "./liveStore";

interface BufferedEvent {
  ts: number;
  arrivedAt: number;
  event: Extract<SseEvent, { state: unknown }>;
}

/**
 * Subscribe to the ingest SSE stream. Player status is applied immediately (so
 * transport controls feel instant). Session state is buffered by `delayMs` in
 * live mode for broadcast-sync; in player mode the playhead is the clock, so
 * state drains immediately.
 */
export function useLiveConnection(): void {
  const setState = useLiveStore((s) => s.setState);
  const setConnected = useLiveStore((s) => s.setConnected);
  const setFeedConnected = useLiveStore((s) => s.setFeedConnected);
  const setOpenf1Connected = useLiveStore((s) => s.setOpenf1Connected);
  const setPlayer = useLiveStore((s) => s.setPlayer);
  const setMode = useLiveStore((s) => s.setMode);

  useEffect(() => {
    const buffer: BufferedEvent[] = [];
    // Same-origin proxy (/api/ingest/sse) — avoids CORS and keeps the stream
    // behind the app's own login gate instead of hitting ingest directly.
    const es = new EventSource("/api/ingest/sse");

    const handle = (raw: string) => {
      let event: SseEvent;
      try {
        event = JSON.parse(raw) as SseEvent;
      } catch {
        return;
      }
      // Mode + player status apply immediately (drive the UI chrome).
      setMode(event.mode);
      setFeedConnected(event.connected);
      setOpenf1Connected(event.openf1Connected);
      if ("player" in event) setPlayer(event.player ?? null);
      if (event.type === "player") {
        // No session data available (idle live feed, or player before its
        // first frame) — clear stale state so the idle view shows.
        setState(null, event.ts);
        return;
      }
      buffer.push({ ts: event.ts, arrivedAt: Date.now(), event });
    };

    es.addEventListener("snapshot", (e) => handle((e as MessageEvent).data));
    es.addEventListener("update", (e) => handle((e as MessageEvent).data));
    es.addEventListener("player", (e) => handle((e as MessageEvent).data));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const drain = setInterval(() => {
      const { delayMs, player } = useLiveStore.getState();
      // In player mode the playhead is authoritative — no artificial delay.
      const effectiveDelay = player ? 0 : delayMs;
      const cutoff = Date.now() - effectiveDelay;
      let latest: BufferedEvent | null = null;
      while (buffer.length && buffer[0]!.arrivedAt <= cutoff) {
        latest = buffer.shift()!;
      }
      if (latest) setState(latest.event.state, latest.ts);
    }, 100);

    return () => {
      clearInterval(drain);
      es.close();
    };
  }, [setState, setConnected, setFeedConnected, setOpenf1Connected, setPlayer, setMode]);
}
