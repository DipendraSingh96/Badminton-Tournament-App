"use client";

import { useContext } from "react";
import { bandCoverage, type Span } from "@/engine";
import { bandName, hallName, setHallWindow, type PlanDraft } from "@/lib/tournament/draft";
import { stepOf } from "@/lib/tournament/snap";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { IssuesContext, pathKey } from "./fields";
import { formatMoney } from "./labels";
import type { Update } from "./plan-editor";
import { TimeWindowTrack, ViewRangeContext, type Boundary } from "./time-window";

/**
 * A hall's hours as a draggable window, with its rate bands shaded behind it
 * and the boundaries between bands draggable. Used on the timeline and in
 * the hall's settings, so both edit the same values as the typed fields.
 */
export function HallTrack({
  draft,
  hallIndex,
  update,
  className,
  detailed = false,
  onSelectBand,
  hoverGuide = false,
}: {
  draft: PlanDraft;
  hallIndex: number;
  update: Update;
  className?: string;
  /** Band names with rates and per-unit wording, gaps and overlaps marked. */
  detailed?: boolean;
  onSelectBand?: (index: number) => void;
  /** Before the hours are drawn, a line follows the pointer with the time drawing would start at. */
  hoverGuide?: boolean;
}) {
  const hall = draft.frame.halls[hallIndex]!;
  const issues = useContext(IssuesContext);
  const { range } = useContext(ViewRangeContext);
  const open = minutesOfDay(hall.from);
  const close = minutesOfDay(hall.to);
  const window = open !== null && close !== null && close > open ? { from: open, to: close } : null;
  const unit = hall.unitMinutes;
  const step = stepOf(unit);
  const name = hallName(hall, hallIndex);
  const hallPath = (key: string) => pathKey(["frame", "halls", hallIndex, key]);
  const invalid = issues.has(hallPath("to")) || issues.has(hallPath("from"));
  const span = Math.max(1, range.end - range.start);
  const pct = (m: number) => `${((m - range.start) / span) * 100}%`;

  const bands = hall.bands
    .map((band, index) => ({ band, index, from: minutesOfDay(band.from), to: minutesOfDay(band.to) }))
    .filter((b): b is typeof b & Span => b.from !== null && b.to !== null && b.to > b.from)
    .sort((a, b) => a.from - b.from);

  // Boundaries where one band ends exactly as the next begins.
  const boundaries: Boundary[] = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const a = bands[i]!;
    const b = bands[i + 1]!;
    if (a.to !== b.from) continue;
    boundaries.push({
      id: `${a.band.id}:${b.band.id}`,
      value: a.to,
      bounds: { min: a.from + step, max: b.to - step },
      label: `${name}: ${bandName(a.band, a.index)} to ${bandName(b.band, b.index)}`,
      onChange: (value) =>
        update((d) => {
          const h = d.frame.halls[hallIndex]!;
          h.bands[a.index]!.to = clock(value);
          h.bands[b.index]!.from = clock(value);
        }),
    });
  }

  const coverage = window ? bandCoverage(window, bands) : { gaps: [], overlaps: [] };
  const per = unit === 60 ? "per hour" : unit ? `per ${unit} min` : "per unit";
  const setWindow = (from: string, to: string) => update((d) => setHallWindow(d.frame.halls[hallIndex]!, from, to));

  return (
    <TimeWindowTrack
      name={`${name} hours`}
      window={window}
      unit={unit}
      origin={open}
      className={className}
      invalid={invalid}
      hoverGuide={hoverGuide}
      emptyHint={`Drag to set ${name}'s hours`}
      onDraw={(w) => setWindow(clock(w.from), clock(w.to))}
      onChange={(w) => setWindow(clock(w.from), clock(w.to))}
      onDelete={() => setWindow("", "")}
      onTap={
        onSelectBand
          ? (minute) => {
              const hit = bands.find((b) => b.from <= minute && minute < b.to);
              if (hit) onSelectBand(hit.index);
            }
          : undefined
      }
      boundaries={boundaries}
      background={
        <>
          {bands.map(({ band, index, from, to }, i) => (
            <span
              key={band.id}
              className={`absolute inset-y-0 flex items-center overflow-hidden border-l border-foreground/20 px-2 ${
                detailed ? "text-xs font-medium" : "text-xs text-muted-foreground"
              } ${i % 2 === 0 ? "bg-foreground/[0.05]" : "bg-foreground/[0.11]"}`}
              style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
              title={`${bandName(band, index)}: ${band.from}–${band.to}${band.rate !== null ? `, ${formatMoney(band.rate)} ${per}` : ""}`}
            >
              <span className="truncate">
                {bandName(band, index)}
                {band.rate !== null ? ` · ${formatMoney(band.rate)}${detailed ? ` ${per}` : ""}` : ""}
              </span>
            </span>
          ))}
          {detailed
            ? coverage.gaps.map((gap) => (
                <span
                  key={`gap-${gap.from}`}
                  className="hatch absolute inset-y-0 grid place-items-center bg-destructive/15 text-xs font-medium text-over-text"
                  style={{ left: pct(gap.from), width: `calc(${pct(gap.to)} - ${pct(gap.from)})` }}
                  title={`Gap ${clock(gap.from)} to ${clock(gap.to)}`}
                >
                  Gap
                </span>
              ))
            : null}
          {detailed
            ? coverage.overlaps.map((overlap) => (
                <span
                  key={`overlap-${overlap.from}`}
                  className="absolute inset-y-0 border-2 border-destructive bg-destructive/20"
                  style={{ left: pct(overlap.from), width: `calc(${pct(overlap.to)} - ${pct(overlap.from)})` }}
                  title={`Overlap ${clock(overlap.from)} to ${clock(overlap.to)}`}
                />
              ))
            : null}
        </>
      }
    />
  );
}
