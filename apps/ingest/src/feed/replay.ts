import { readRecording } from "../recording/reader.js";
import type { FeedCallbacks, FeedHandle } from "./source.js";

interface ReplayOptions {
  /** Playback speed multiplier (1 = real time, 10 = 10x faster). */
  speed?: number;
  /** Loop the recording when it ends (default false). */
  loop?: boolean;
  log?: (msg: string) => void;
}

/**
 * Replay a JSONL recording through the same callbacks as the live feed,
 * preserving inter-event timing scaled by `speed`.
 */
export function connectReplay(
  file: string,
  cb: FeedCallbacks,
  opts: ReplayOptions = {},
): FeedHandle {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const log = opts.log ?? (() => {});
  let cancelled = false;
  let timer: NodeJS.Timeout | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });

  const run = async () => {
    do {
      let prevTs: number | null = null;
      cb.onConnected?.(true);
      for await (const line of readRecording(file)) {
        if (cancelled) return;
        if (prevTs !== null) {
          const wait = Math.max(0, (line.ts - prevTs) / speed);
          if (wait > 0) await sleep(wait);
          if (cancelled) return;
        }
        prevTs = line.ts;
        if (line.kind === "snapshot") {
          cb.onSnapshot(line.state);
        } else {
          cb.onMessage(line.topic, line.data, new Date(line.ts).toISOString());
        }
      }
      log("replay: reached end of recording");
    } while (opts.loop && !cancelled);
    cb.onConnected?.(false);
  };

  void run();

  return {
    close() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}
