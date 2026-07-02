"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLiveStore, useFocusNumber } from "@/lib/liveStore";
import { useCircuit, project, trackPath, rotate, buildMarshalSectorPaths } from "@/lib/circuit";
import { activeYellowSectors } from "@/lib/flags";
import { Panel } from "@/components/ui/Panel";
import { F1, teamHex, contrastText } from "@/lib/design";

const SVG_NS = "http://www.w3.org/2000/svg";

export function TrackMapPanel() {
  const circuitKey = useLiveStore((s) => s.state?.session.circuitKey ?? null);
  const circuitName = useLiveStore((s) => s.state?.session.circuitName ?? "");
  const startDate = useLiveStore((s) => s.state?.session.startDate ?? "");
  const trackStatus = useLiveStore((s) => s.state?.trackStatus ?? "Unknown");
  const raceControl = useLiveStore((s) => s.state?.raceControl);
  const focus = useFocusNumber();
  const focusRef = useRef<string | null>(focus);
  focusRef.current = focus;

  const year = startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear();
  const geo = useCircuit(circuitKey, year);
  const sectorPaths = useMemo(() => (geo ? buildMarshalSectorPaths(geo) : []), [geo]);
  const yellowSectors = useMemo(() => activeYellowSectors(raceControl ?? []), [raceControl]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dotsRef = useRef<Map<string, { cur: { x: number; y: number }; target: { x: number; y: number }; colour: string; tla: string; visible: boolean }>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!geo) return;
    const unsub = useLiveStore.subscribe((state) => {
      const drivers = state.state?.drivers;
      if (!drivers) return;
      const dots = dotsRef.current;
      for (const [num, d] of Object.entries(drivers)) {
        const pos = d.trackPosition;
        if (!pos) continue;
        const p = rotate(pos.x, pos.y, geo.rotation);
        const visible = pos.status === "OnTrack" && !d.retired && !d.stopped;
        const existing = dots.get(num);
        if (existing) {
          existing.target = p;
          existing.colour = teamHex(d.teamColour);
          existing.visible = visible;
        } else {
          dots.set(num, { cur: p, target: p, colour: teamHex(d.teamColour), tla: d.tla, visible });
        }
      }
    });
    return unsub;
  }, [geo]);

  useEffect(() => {
    if (!geo) return;
    const layer = svgRef.current?.querySelector("#cars");
    if (!layer) return;
    const els = new Map<string, { g: SVGGElement; r: SVGRectElement; t: SVGTextElement }>();

    const tick = () => {
      const dots = dotsRef.current;
      const foc = focusRef.current;
      for (const [num, dot] of dots) {
        dot.cur.x += (dot.target.x - dot.cur.x) * 0.2;
        dot.cur.y += (dot.target.y - dot.cur.y) * 0.2;
        let el = els.get(num);
        if (!el) {
          const g = document.createElementNS(SVG_NS, "g");
          const r = document.createElementNS(SVG_NS, "rect");
          r.setAttribute("rx", "40");
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("font-size", "150");
          t.setAttribute("font-weight", "700");
          t.setAttribute("text-anchor", "middle");
          t.setAttribute("font-family", "Martian Mono, monospace");
          t.textContent = dot.tla;
          g.appendChild(r);
          g.appendChild(t);
          layer.appendChild(g);
          el = { g, r, t };
          els.set(num, el);
        }
        const isFocus = num === foc;
        const w = isFocus ? 620 : 500;
        const h = isFocus ? 300 : 250;
        el.r.setAttribute("x", String(-w / 2));
        el.r.setAttribute("y", String(-h / 2));
        el.r.setAttribute("width", String(w));
        el.r.setAttribute("height", String(h));
        el.r.setAttribute("fill", dot.colour);
        el.r.setAttribute("stroke", isFocus ? "#fff" : "rgba(0,0,0,.5)");
        el.r.setAttribute("stroke-width", isFocus ? "40" : "20");
        el.t.setAttribute("fill", contrastText(dot.colour));
        el.t.setAttribute("dy", "52");
        el.g.setAttribute("transform", `translate(${dot.cur.x.toFixed(1)} ${dot.cur.y.toFixed(1)})`);
        el.g.setAttribute("opacity", dot.visible ? "1" : "0.15");
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      els.forEach((e) => e.g.remove());
    };
  }, [geo]);

  const legend = (
    <div className="flex gap-[12px]" style={{ fontSize: 11, color: F1.muted }}>
      <span className="flex items-center gap-[5px]"><span style={{ width: 9, height: 9, borderRadius: "50%", background: F1.green }} />DRS zone</span>
      <span className="flex items-center gap-[5px]"><span style={{ width: 9, height: 2, background: F1.amber }} />Sector</span>
    </div>
  );

  const body = !geo ? (
    <div className="flex items-center justify-center" style={{ height: 360, color: F1.muted2, fontSize: 13 }}>
      {circuitKey === null ? "No circuit data" : "Loading circuit…"}
    </div>
  ) : (
    <TrackSvg
      geo={geo}
      svgRef={svgRef}
      sectorPaths={sectorPaths}
      yellowSectors={yellowSectors}
      trackStatus={trackStatus}
    />
  );

  return (
    <Panel title="Track Map" meta={circuitName} right={legend} style={{ gridArea: "track" }} bodyStyle={{ height: 360, padding: "6px 14px 12px" }}>
      {body}
    </Panel>
  );
}

function TrackSvg({
  geo,
  svgRef,
  sectorPaths,
  yellowSectors,
  trackStatus,
}: {
  geo: NonNullable<ReturnType<typeof useCircuit>>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  sectorPaths: { number: number; d: string }[];
  yellowSectors: Set<number>;
  trackStatus: string;
}) {
  const proj = project(geo);
  const d = trackPath(geo);
  const wholeTrack = ["SCDeployed", "VSC", "VSCEnding", "Red"].includes(trackStatus);
  const asphalt = wholeTrack ? (trackStatus === "Red" ? "#5a1414" : "#5a4a14") : "#22314C";

  return (
    <svg ref={svgRef} viewBox={`${proj.minX} ${proj.minY} ${proj.width} ${proj.height}`} className="h-full w-full">
      <path d={d} fill="none" stroke="#0A1120" strokeWidth={320} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={asphalt} strokeWidth={230} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={4} strokeDasharray="10 26" strokeLinecap="round" />
      {sectorPaths
        .filter((s) => yellowSectors.has(s.number))
        .map((s) => (
          <path key={s.number} className="f1-blink" d={s.d} fill="none" stroke={F1.amber} strokeWidth={250} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      <g id="cars" />
    </svg>
  );
}
