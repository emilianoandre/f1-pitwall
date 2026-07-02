// JSONL recording format. One JSON object per line.
//   {"kind":"snapshot","ts":1719849600000,"state":{...}}
//   {"kind":"update","ts":1719849601234,"topic":"TimingData","data":{...}}
// `ts` is ms epoch (receive time for live recordings; synthesized for fetched replays).

export interface SnapshotLine {
  kind: "snapshot";
  ts: number;
  state: Record<string, unknown>;
}

export interface UpdateLine {
  kind: "update";
  ts: number;
  topic: string;
  data: unknown;
}

export type RecordingLine = SnapshotLine | UpdateLine;

export function isRecordingLine(v: unknown): v is RecordingLine {
  if (!v || typeof v !== "object") return false;
  const k = (v as { kind?: unknown }).kind;
  return k === "snapshot" || k === "update";
}
