// Common interface implemented by both the live SignalR feed and the replay source.
// Downstream code (store, server) depends only on this, so live/replay are swappable.

export type FeedMessage = (topic: string, data: unknown, ts: string) => void;
export type FeedSnapshot = (state: Record<string, unknown>) => void;

export interface FeedCallbacks {
  /** An incremental topic update (already inflated + normalized). */
  onMessage: FeedMessage;
  /** A full-state snapshot for all topics (initial connect or reconnect). */
  onSnapshot: FeedSnapshot;
  /** Connection state changed (live source only; replay reports true once). */
  onConnected?: (connected: boolean) => void;
}

export interface FeedHandle {
  close(): void;
}

export type FeedSourceKind = "live" | "replay";
