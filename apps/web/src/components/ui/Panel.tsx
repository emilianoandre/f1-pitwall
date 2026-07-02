"use client";

import type { ReactNode, CSSProperties } from "react";

/** Broadcast panel: dark surface, 1px border, 3px radius, condensed title. */
export function Panel({
  title,
  meta,
  right,
  accent,
  children,
  className = "",
  style,
  bodyClassName = "",
  bodyStyle,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  /** Optional team-color tick before the title. */
  accent?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div className={`f1-panel overflow-hidden ${className}`} style={style}>
      {(title || right) && (
        <div className="flex items-center justify-between px-[18px] pt-[14px] pb-[4px]">
          <div className="flex items-center gap-[10px]">
            {accent && (
              <span
                className="inline-block"
                style={{ width: 4, height: 16, borderRadius: 2, background: accent }}
              />
            )}
            {title && (
              <span className="f1-cond" style={{ fontWeight: 500, fontSize: 15 }}>
                {title}
              </span>
            )}
            {meta && (
              <span style={{ fontSize: 11, color: "var(--f1-muted)" }}>{meta}</span>
            )}
          </div>
          {right}
        </div>
      )}
      <div className={`px-4 pb-4 pt-[6px] ${bodyClassName}`} style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}
