"use client";

import { useEffect, useState } from "react";

export interface CircuitGeometry {
  x: number[];
  y: number[];
  rotation: number;
  corners: Array<{ number: number; trackPosition: { x: number; y: number } }>;
  marshalSectors: Array<{ number: number; trackPosition: { x: number; y: number } }>;
}

/** Rotate a point around the origin by `deg` degrees (feed + map share this frame). */
export function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export interface Projection {
  minX: number;
  minY: number;
  width: number;
  height: number;
  rotation: number;
}

/** Compute a rotated bounding box for the track outline, with padding. */
export function project(geo: CircuitGeometry, pad = 500): Projection {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < geo.x.length; i++) {
    const p = rotate(geo.x[i]!, geo.y[i]!, geo.rotation);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    rotation: geo.rotation,
  };
}

/** Build the SVG path string for the (rotated) track outline. */
export function trackPath(geo: CircuitGeometry): string {
  let d = "";
  for (let i = 0; i < geo.x.length; i++) {
    const p = rotate(geo.x[i]!, geo.y[i]!, geo.rotation);
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
  }
  return d + "Z";
}

export interface MarshalSectorPath {
  number: number;
  d: string;
}

/** Nearest polyline index to a track coordinate. */
function nearestIndex(geo: CircuitGeometry, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < geo.x.length; i++) {
    const dx = geo.x[i]! - x;
    const dy = geo.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Split the track polyline into per-marshal-sector sub-paths, so a flagged
 * sector can be highlighted. Each marshal sector spans from its start point to
 * the next sector's start point along the (rotated) outline.
 */
export function buildMarshalSectorPaths(geo: CircuitGeometry): MarshalSectorPath[] {
  const sectors = (geo.marshalSectors ?? [])
    .map((s) => ({ number: s.number, index: nearestIndex(geo, s.trackPosition.x, s.trackPosition.y) }))
    .sort((a, b) => a.index - b.index);
  if (sectors.length === 0) return [];

  const n = geo.x.length;
  const out: MarshalSectorPath[] = [];
  for (let s = 0; s < sectors.length; s++) {
    const start = sectors[s]!.index;
    const end = sectors[(s + 1) % sectors.length]!.index;
    let d = "";
    let first = true;
    // Walk from start to end, wrapping around the polyline end if needed.
    for (let i = start; ; i = (i + 1) % n) {
      const p = rotate(geo.x[i]!, geo.y[i]!, geo.rotation);
      d += `${first ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
      first = false;
      if (i === end) break;
    }
    out.push({ number: sectors[s]!.number, d });
  }
  return out;
}

/** Fetch circuit geometry from our cached API route. */
export function useCircuit(key: number | null, year: number): CircuitGeometry | null {
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    fetch(`/api/circuit/${key}/${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.x)) setGeo(data as CircuitGeometry);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, year]);
  return geo;
}
