import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { isRecordingLine, type RecordingLine } from "./format.js";

/** Async-iterate a JSONL recording, yielding parsed lines and skipping garbage. */
export async function* readRecording(path: string): AsyncGenerator<RecordingLine> {
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isRecordingLine(parsed)) yield parsed;
  }
}

/** Read an entire recording into memory (for small fixtures/tests). */
export async function readRecordingAll(path: string): Promise<RecordingLine[]> {
  const out: RecordingLine[] = [];
  for await (const line of readRecording(path)) out.push(line);
  return out;
}
