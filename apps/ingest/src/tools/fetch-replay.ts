// Fetch a historical F1 session from the static archive into a JSONL recording.
//   pnpm --filter @f1-dash/ingest fetch-replay --list 2024
//   pnpm --filter @f1-dash/ingest fetch-replay --path "<sessionPath>" [--out <file>]

import { join } from "node:path";
import { listSessions, downloadSession, pathToId } from "../recording/download.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const list = arg("list");
const path = arg("path");
const dataDir = process.env.DATA_DIR ?? "data/recordings";

if (list) {
  const sessions = await listSessions(Number(list));
  let lastMeeting = "";
  for (const s of sessions) {
    if (s.meeting !== lastMeeting) {
      console.log(s.meeting);
      lastMeeting = s.meeting;
    }
    console.log(`  ${s.session}\t${s.path}`);
  }
} else if (path) {
  const out = arg("out") ?? join(dataDir, `${pathToId(path)}.jsonl`);
  console.log(`downloading ${path} → ${out}`);
  const { lines } = await downloadSession(path, out, (p) =>
    process.stdout.write(`\r  ${p.currentTopic} (${p.topicsDone}/${p.topicsTotal})    `),
  );
  console.log(`\nwrote ${lines} lines to ${out}`);
} else {
  console.error("usage: fetch-replay --path <sessionPath> [--out <file>]  |  --list <year>");
  process.exit(1);
}
