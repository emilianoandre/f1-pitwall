"use client";

import type { RecordingEntry, DownloadStatus, PlayerStatus, IngestMode } from "@f1-dash/types";

// Same-origin proxy — avoids CORS; Vercel/server forwards to the ingest host.
const INGEST_API = "/api/ingest";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${INGEST_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function listRecordings(year: number): Promise<RecordingEntry[]> {
  const res = await fetch(`${INGEST_API}/recordings?year=${year}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { recordings?: RecordingEntry[] };
  return data.recordings ?? [];
}

export function startDownload(path: string): Promise<DownloadStatus> {
  return post<DownloadStatus>("/recordings/download", { path });
}

export async function getDownloadStatus(id: string): Promise<DownloadStatus | null> {
  const res = await fetch(`${INGEST_API}/download/${id}`);
  if (!res.ok) return null;
  return res.json() as Promise<DownloadStatus>;
}

export function loadRecording(id: string): Promise<PlayerStatus> {
  return post<PlayerStatus>("/player/load", { id });
}

export function setIngestMode(mode: IngestMode): Promise<{ mode: IngestMode; connected: boolean }> {
  return post("/mode", { mode });
}

export function playerControl(
  body:
    | { action: "play" }
    | { action: "pause" }
    | { action: "seek"; fraction?: number; valueMs?: number }
    | { action: "speed"; speed: number },
): Promise<PlayerStatus> {
  return post<PlayerStatus>("/player/control", body);
}
