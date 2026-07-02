// Record a live F1 session to JSONL. Usage:
//   pnpm --filter @f1-dash/ingest record [--out data/recordings/<name>.jsonl]
// Ctrl-C to stop; the file is flushed and closed cleanly.

import { connectLive } from "../feed/live.js";
import { RecordingWriter } from "../recording/writer.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

function defaultName(): string {
  // Avoids argless `new Date()`; uses explicit epoch for a sortable slug.
  const iso = new Date(Date.now()).toISOString().replace(/[:.]/g, "-");
  return `data/recordings/live-${iso}.jsonl`;
}

const out = arg("out", defaultName());
const writer = new RecordingWriter(out);
let messageCount = 0;

console.log(`recording to ${out} — Ctrl-C to stop`);

const handle = connectLive(
  {
    onSnapshot(state) {
      writer.write({ kind: "snapshot", ts: Date.now(), state });
      console.log(`snapshot (${Object.keys(state).length} topics)`);
    },
    onMessage(topic, data) {
      writer.write({ kind: "update", ts: Date.now(), topic, data });
      messageCount += 1;
      if (messageCount % 500 === 0) console.log(`… ${messageCount} updates`);
    },
    onConnected(connected) {
      console.log(connected ? "connected" : "disconnected");
    },
  },
  { log: (m) => console.log(m) },
);

const shutdown = async () => {
  console.log(`\nstopping — ${writer.lineCount} lines written to ${out}`);
  handle.close();
  await writer.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
