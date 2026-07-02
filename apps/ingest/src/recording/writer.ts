import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import type { RecordingLine } from "./format.js";

/** Append-only JSONL writer, flushing one line at a time. */
export class RecordingWriter {
  private stream: WriteStream;
  private count = 0;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, { flags: "a" });
  }

  write(line: RecordingLine): void {
    this.stream.write(JSON.stringify(line) + "\n");
    this.count += 1;
  }

  get lineCount(): number {
    return this.count;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.stream.end(resolve));
  }
}
