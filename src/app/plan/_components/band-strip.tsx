"use client";

import { bandCoverage, type Span } from "@/engine";
import { bandName, type HallDraft } from "@/lib/tournament/draft";
import { clock, minutesOfDay } from "@/lib/tournament/time";

const HATCH =
  "bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklch,var(--foreground)_14%,transparent)_6px_8px)]";

/**
 * The hall's day as a bar: each rate band in proportion to its time, with
 * gaps and overlaps marked. Clicking a band selects its row for editing.
 */
export function BandStrip({ hall, onSelectBand }: { hall: HallDraft; onSelectBand: (index: number) => void }) {
  const open = minutesOfDay(hall.from);
  const close = minutesOfDay(hall.to);
  if (open === null || close === null || close <= open) {
    return (
      <div className="grid h-14 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Set the hall&apos;s hours to see its rate bands across the day.
      </div>
    );
  }

  const length = close - open;
  const pct = (minutes: number) => `${((Math.min(Math.max(minutes, open), close) - open) / length) * 100}%`;
  const bands = hall.bands
    .map((band, index) => ({ band, index, from: minutesOfDay(band.from), to: minutesOfDay(band.to) }))
    .filter((b): b is typeof b & Span => b.from !== null && b.to !== null && b.to > b.from);
  const coverage = bandCoverage({ from: open, to: close }, bands);
  const ticks = [...new Set([open, close, ...bands.flatMap((b) => [b.from, b.to])])]
    .filter((m) => m >= open && m <= close)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-14 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
        {bands.map(({ band, index, from, to }) => (
          <button
            key={band.id}
            type="button"
            onClick={() => onSelectBand(index)}
            className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-background px-2 text-xs font-medium transition-colors hover:brightness-95 ${
              index % 2 === 0 ? "bg-secondary" : `bg-accent ${HATCH}`
            }`}
            style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
            title={`${bandName(band, index)}: ${band.from} to ${band.to}`}
          >
            <span className="truncate">
              {bandName(band, index)}
              {band.rate !== null ? ` · £${band.rate.toFixed(2)} per court per hour` : ""}
            </span>
          </button>
        ))}
        {coverage.gaps.map((gap) => (
          <div
            key={`gap-${gap.from}`}
            className={`absolute inset-y-0 grid place-items-center bg-destructive/15 text-xs font-medium text-destructive ${HATCH}`}
            style={{ left: pct(gap.from), width: `calc(${pct(gap.to)} - ${pct(gap.from)})` }}
          >
            <span className="truncate px-1">Gap</span>
          </div>
        ))}
        {coverage.overlaps.map((overlap) => (
          <div
            key={`overlap-${overlap.from}`}
            className="pointer-events-none absolute inset-y-0 border-2 border-destructive bg-destructive/20"
            style={{ left: pct(overlap.from), width: `calc(${pct(overlap.to)} - ${pct(overlap.from)})` }}
            title={`Overlap ${clock(overlap.from)} to ${clock(overlap.to)}`}
          />
        ))}
      </div>
      <div className="relative h-4 text-xs text-muted-foreground tabular-nums">
        {ticks.map((m) => (
          <span
            key={m}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: pct(m) }}
          >
            {clock(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
