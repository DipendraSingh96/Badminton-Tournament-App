import type { Hall } from "./types";

/** A stretch of time, in any one unit (minutes of the day, or epoch ms). */
export interface Span {
  from: number;
  to: number;
}

export interface Coverage {
  /** Parts of the span no band covers. */
  gaps: Span[];
  /** Parts covered by more than one band. */
  overlaps: Span[];
}

/**
 * How a set of bands covers a span: the gaps left uncovered and the stretches
 * covered twice. Bands reaching outside the span are not reported here.
 */
export function bandCoverage(span: Span, bands: Span[]): Coverage {
  const sorted = [...bands].sort((a, b) => a.from - b.from || a.to - b.to);
  const gaps: Span[] = [];
  const overlaps: Span[] = [];
  let cursor = span.from;
  for (const band of sorted) {
    if (band.from > cursor) gaps.push({ from: cursor, to: Math.min(band.from, span.to) });
    if (band.from < cursor) overlaps.push({ from: band.from, to: Math.min(band.to, cursor) });
    cursor = Math.max(cursor, band.to);
  }
  if (cursor < span.to) gaps.push({ from: cursor, to: span.to });
  return {
    gaps: gaps.filter((g) => g.to > g.from),
    overlaps: overlaps.filter((o) => o.to > o.from),
  };
}

/** The day runs from the earliest hall opening to the latest hall closing (UTC ISO). */
export function dayBounds(halls: Hall[]): { start: string; end: string } {
  const opens = halls.map((h) => Date.parse(h.from));
  const closes = halls.map((h) => Date.parse(h.to));
  return {
    start: new Date(Math.min(...opens)).toISOString(),
    end: new Date(Math.max(...closes)).toISOString(),
  };
}

/** Umpires across the venue: the sum of umpires on every court. */
export function totalUmpires(halls: Hall[]): number {
  return halls.reduce((sum, hall) => sum + hall.courts.reduce((s, c) => s + c.umpires, 0), 0);
}
