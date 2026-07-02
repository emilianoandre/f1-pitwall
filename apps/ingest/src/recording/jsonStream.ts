// Parser for the F1 static archive ".jsonStream" format.
// Each line is a session-relative timestamp "HH:MM:SS.mmm" immediately followed
// by JSON (no separator). Example:
//   00:00:12.345{"Lines":{"1":{"Position":"1"}}}

export interface StreamEntry {
  /** Offset from session start, in ms. */
  offsetMs: number;
  data: unknown;
}

const TS_RE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

/** Parse one .jsonStream line into an offset + payload, or null if malformed. */
export function parseStreamLine(line: string): StreamEntry | null {
  const trimmed = line.trimStart();
  const m = TS_RE.exec(trimmed);
  if (!m) return null;
  const [, hh, mm, ss, mmm] = m;
  const offsetMs =
    Number(hh) * 3_600_000 + Number(mm) * 60_000 + Number(ss) * 1000 + Number(mmm);
  const rest = trimmed.slice(m[0].length);
  try {
    return { offsetMs, data: JSON.parse(rest) };
  } catch {
    return null;
  }
}

/** Parse a whole .jsonStream body into ordered entries. */
export function parseStream(body: string): StreamEntry[] {
  const out: StreamEntry[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = parseStreamLine(line);
    if (entry) out.push(entry);
  }
  return out;
}
