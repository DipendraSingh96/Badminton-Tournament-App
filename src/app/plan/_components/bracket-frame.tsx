"use client";

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { KnockoutMatch } from "@/engine";
import { IconButton } from "./fields";

// What the two knockout pages share (the Draw stage's KO stage and Live's
// Knockout stage): the tree's frame with its connecting lines, and its zoom.

/** Full: each match with its code, time and court. Compact: the two names only, so more of the tree is in view. */
export type BracketZoom = "full" | "compact";

const ZOOM_KEY = "badminton:bracket-zoom";

function loadZoom(): BracketZoom {
  try {
    return window.localStorage.getItem(ZOOM_KEY) === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

/** The bracket's zoom, remembered on this device. */
export function useBracketZoom(): [BracketZoom, (zoom: BracketZoom) => void] {
  const [zoom, setZoom] = useState<BracketZoom>(loadZoom);
  return [
    zoom,
    (next) => {
      setZoom(next);
      try {
        window.localStorage.setItem(ZOOM_KEY, next);
      } catch {
        // Not remembered; full next time.
      }
    },
  ];
}

/** True inside a compact bracket: a match box shows its two sides and nothing else. */
export const BracketCompactContext = createContext(false);
export function useBracketCompact(): boolean {
  return useContext(BracketCompactContext);
}

/** Zoom out to the names only; zoom in for each match's code, time and court. */
export function BracketZoomButtons({ zoom, onZoom }: { zoom: BracketZoom; onZoom: (zoom: BracketZoom) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton label="Names only, to see more of the knockout" disabled={zoom === "compact"} onClick={() => onZoom("compact")}>
        <MagnifyingGlassMinusIcon />
      </IconButton>
      <IconButton label="Each match's time and court" disabled={zoom === "full"} onClick={() => onZoom("full")}>
        <MagnifyingGlassPlusIcon />
      </IconButton>
    </div>
  );
}

/** A round's column: an equal share of the width, never narrower than a readable box. */
export const BRACKET_COLUMN = "flex min-w-36 flex-1 basis-0 flex-col gap-3";

/** The matches a match takes its winners from ("Winner QF1" → "QF1"), for its box's `data-feeds`. */
export function feedsOf(match: KnockoutMatch): string | undefined {
  const codes = [match.home, match.away].flatMap((slot) => /^Winner (\S+)$/.exec(slot)?.[1] ?? []);
  return codes.length > 0 ? codes.join(",") : undefined;
}

/**
 * The knockout tree's frame. The rounds are its columns; every match box
 * inside carries `data-bracket-match` (its code) and `data-feeds` (the
 * matches whose winners play it), and a line is drawn from each of those to
 * it, as on any knockout chart: out of the feeder's right side, and into this
 * match's left. Losers' matches (the bronze) have no lines. With too many
 * rounds to fit, it scrolls sideways with its scrollbar in view.
 */
export function BracketFrame({ compact, redraw, children }: { compact: boolean; redraw: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ key: string; d: string }[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const boxes = new Map<string, DOMRect>();
      for (const m of el.querySelectorAll<HTMLElement>("[data-bracket-match]")) boxes.set(m.dataset.bracketMatch!, m.getBoundingClientRect());
      const next: { key: string; d: string }[] = [];
      for (const m of el.querySelectorAll<HTMLElement>("[data-feeds]")) {
        const to = m.getBoundingClientRect();
        const x2 = Math.round(to.left - box.left);
        const y2 = Math.round(to.top + to.height / 2 - box.top);
        for (const code of m.dataset.feeds!.split(",")) {
          const from = boxes.get(code);
          if (!from) continue;
          const x1 = Math.round(from.right - box.left);
          const y1 = Math.round(from.top + from.height / 2 - box.top);
          const mid = Math.round((x1 + x2) / 2);
          next.push({ key: `${code}>${m.dataset.bracketMatch}`, d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}` });
        }
      }
      setLines((before) => (JSON.stringify(before) === JSON.stringify(next) ? before : next));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [compact, redraw]);
  return (
    <BracketCompactContext value={compact}>
      <div className="bracket-scroll overflow-x-auto pb-2">
        <div ref={root} className="relative flex gap-6">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
            {lines.map((line) => (
              <path key={line.key} data-bracket-line d={line.d} fill="none" className="stroke-foreground/35" strokeWidth={1.5} strokeLinejoin="round" />
            ))}
          </svg>
          {children}
        </div>
      </div>
    </BracketCompactContext>
  );
}
