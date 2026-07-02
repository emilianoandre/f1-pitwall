// Replay a JSONL recording to the console (smoke test for the replay source).
// Usage: pnpm --filter @f1-dash/ingest replay --file <path> [--speed 50]

import { connectReplay } from "../feed/replay.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = arg("file");
if (!file) {
  console.error("usage: replay --file <path> [--speed 50]");
  process.exit(1);
}
const speed = Number(arg("speed") ?? "10");

const counts = new Map<string, number>();
let snapshots = 0;

const handle = connectReplay(
  file,
  {
    onSnapshot(state) {
      snapshots += 1;
      console.log(`snapshot #${snapshots}: ${Object.keys(state).join(", ")}`);
    },
    onMessage(topic) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    },
    onConnected(connected) {
      if (!connected) {
        console.log("\n--- replay finished ---");
        for (const [topic, n] of [...counts].sort((a, b) => b[1] - a[1])) {
          console.log(`${topic}: ${n}`);
        }
        handle.close();
        process.exit(0);
      }
    },
  },
  { speed, log: (m) => console.log(m) },
);

process.on("SIGINT", () => {
  handle.close();
  process.exit(0);
});
