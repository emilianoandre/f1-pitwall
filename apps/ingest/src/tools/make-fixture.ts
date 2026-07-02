// Produce a small committable fixture from a full recording by dropping the
// high-volume telemetry topics (CarData, Position) that don't affect timing
// classification. Usage:
//   pnpm --filter @f1-dash/ingest exec tsx src/tools/make-fixture.ts --in <file> --out <file> [--drop CarData,Position]

import { readRecording } from "../recording/reader.js";
import { RecordingWriter } from "../recording/writer.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const inFile = arg("in");
const outFile = arg("out");
if (!inFile || !outFile) {
  console.error("usage: make-fixture --in <file> --out <file> [--drop CarData,Position]");
  process.exit(1);
}
const drop = new Set((arg("drop") ?? "CarData,Position").split(",").map((s) => s.trim()));

const writer = new RecordingWriter(outFile);
let kept = 0;
let dropped = 0;

for await (const line of readRecording(inFile)) {
  if (line.kind === "snapshot") {
    const state = { ...line.state };
    for (const topic of drop) delete state[topic];
    writer.write({ ...line, state });
    kept += 1;
  } else if (drop.has(line.topic)) {
    dropped += 1;
  } else {
    writer.write(line);
    kept += 1;
  }
}

await writer.close();
console.log(`fixture: kept ${kept} lines, dropped ${dropped} (${[...drop].join(",")}) → ${outFile}`);
