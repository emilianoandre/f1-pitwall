import { readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  listSessions,
  downloadSession,
  pathToId,
  type DownloadProgress,
} from "../recording/download.js";

export interface RecordingEntry {
  id: string;
  name: string;
  downloaded: boolean;
  path?: string;
  year?: number;
  sizeBytes?: number;
}

export interface DownloadJob {
  id: string;
  status: "downloading" | "done" | "error";
  progress: DownloadProgress;
  error?: string;
}

/** Manages downloaded recordings on disk + archive-available sessions + downloads. */
export class RecordingRegistry {
  private jobs = new Map<string, DownloadJob>();
  private sessionCache = new Map<number, { at: number; entries: RecordingEntry[] }>();

  constructor(private readonly dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  }

  fileFor(id: string): string {
    return join(this.dataDir, `${id}.jsonl`);
  }

  isDownloaded(id: string): boolean {
    return existsSync(this.fileFor(id));
  }

  /** Downloaded recordings found on disk. */
  listDownloaded(): RecordingEntry[] {
    const out: RecordingEntry[] = [];
    for (const f of readdirSync(this.dataDir)) {
      if (!f.endsWith(".jsonl")) continue;
      const id = f.slice(0, -".jsonl".length);
      out.push({
        id,
        name: prettyName(id),
        downloaded: true,
        year: yearFromId(id),
        sizeBytes: statSync(join(this.dataDir, f)).size,
      });
    }
    return out;
  }

  /**
   * Merge downloaded + archive-available sessions for a year. Archive listing is
   * cached 1h. Entries already downloaded are marked downloaded.
   */
  async list(year: number): Promise<RecordingEntry[]> {
    const downloaded = this.listDownloaded();
    const downloadedIds = new Set(downloaded.map((d) => d.id));

    let archive: RecordingEntry[] = [];
    const cached = this.sessionCache.get(year);
    if (cached && Date.now() - cached.at < 3_600_000) {
      archive = cached.entries;
    } else {
      const sessions = await listSessions(year);
      archive = sessions.map((s) => ({
        id: pathToId(s.path),
        name: `${s.meeting} — ${s.session}`,
        downloaded: false,
        path: s.path,
        year: s.year,
      }));
      this.sessionCache.set(year, { at: Date.now(), entries: archive });
    }

    // Prefer archive entries (they have nice names + path); mark downloaded.
    const merged = new Map<string, RecordingEntry>();
    for (const a of archive) merged.set(a.id, { ...a, downloaded: downloadedIds.has(a.id) });
    for (const d of downloaded) {
      const existing = merged.get(d.id);
      if (existing) existing.sizeBytes = d.sizeBytes;
      // Only surface an orphan download under the year it belongs to.
      else if (d.year === year) merged.set(d.id, d);
    }
    return [...merged.values()];
  }

  /** Start (or resume the status of) a download for an archive path. */
  startDownload(path: string): DownloadJob {
    const id = pathToId(path);
    const existing = this.jobs.get(id);
    if (existing && existing.status === "downloading") return existing;
    if (this.isDownloaded(id)) {
      const done: DownloadJob = {
        id,
        status: "done",
        progress: { topicsDone: 1, topicsTotal: 1, currentTopic: "done" },
      };
      this.jobs.set(id, done);
      return done;
    }

    const job: DownloadJob = {
      id,
      status: "downloading",
      progress: { topicsDone: 0, topicsTotal: 1, currentTopic: "starting" },
    };
    this.jobs.set(id, job);

    void downloadSession(path, this.fileFor(id), (p) => {
      job.progress = p;
    })
      .then(() => {
        job.status = "done";
      })
      .catch((err: unknown) => {
        job.status = "error";
        job.error = (err as Error).message;
      });

    return job;
  }

  getJob(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }
}

/** Leading season year from an id like "2024_2024-06-23_...". */
function yearFromId(id: string): number | undefined {
  const m = /^(\d{4})[_-]/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/** Turn a slug like "2024_2024-06-23_Spanish_Grand_Prix_2024-06-23_Race" into a label. */
function prettyName(id: string): string {
  const m = /_([A-Za-z_]+_Grand_Prix)_.*_([A-Za-z_0-9]+)$/.exec(id);
  if (m) return `${m[1]!.replace(/_/g, " ")} — ${m[2]!.replace(/_/g, " ")}`;
  return id.replace(/_/g, " ");
}
