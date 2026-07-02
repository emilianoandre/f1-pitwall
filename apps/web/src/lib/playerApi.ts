"use client";

import type { RecordingEntry, DownloadStatus, PlayerStatus, IngestMode } from "@f1-dash/types";
import { INGEST_URL } from "./sse";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${INGEST_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function listRecordings(year: number): Promise<RecordingEntry[]> {
  const res = await fetch(`${INGEST_URL}/api/recordings?year=${year}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { recordings?: RecordingEntry[] };
  return data.recordings ?? [];
}

export function startDownload(path: string): Promise<DownloadStatus> {
  return post<DownloadStatus>("/api/recordings/download", { path });
}

export async function getDownloadStatus(id: string): Promise<DownloadStatus | null> {
  const res = await fetch(`${INGEST_URL}/api/download/${id}`);
  if (!res.ok) return null;
  return res.json() as Promise<DownloadStatus>;
}

export function loadRecording(id: string): Promise<PlayerStatus> {
  return post<PlayerStatus>("/api/player/load", { id });
}

export function setIngestMode(mode: IngestMode): Promise<{ mode: IngestMode; connected: boolean }> {
  return post("/api/mode", { mode });
}

export function playerControl(
  body:
    | { action: "play" }
    | { action: "pause" }
    | { action: "seek"; fraction?: number; valueMs?: number }
    | { action: "speed"; speed: number },
): Promise<PlayerStatus> {
  return post<PlayerStatus>("/api/player/control", body);
}
