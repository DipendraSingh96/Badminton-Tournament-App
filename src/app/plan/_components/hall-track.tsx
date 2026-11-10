"use client";

import { useContext, useRef } from "react";
import { bandCoverage, type Span } from "@/engine";
import { bandName, drawBand, hallName, hoursFromBands, newId, removeBand, setHallWindow, type PlanDraft } from "@/lib/tournament/draft";
import { GRID_MINUTES, stepOf, type Window } from "@/lib/tournament/snap";
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

/**
 * A hall's rate bands on a fixed track of the day. Each band is drawn, moved
 * and resized on the track itself, and together they set the hall's hours:
 * there's no window of hours to set first. Drawing on a free part of the day
 * makes the next band.
 */
export function BandTrack({
  draft,
  hallIndex,
  update,
  className,
  selected,
  onSelectBand,
}: {
  draft: PlanDraft;
  hallIndex: number;
  update: Update;
  className?: string;
  selected: number | null;
  onSelectBand: (index: number) => void;
}) {
  const hall = draft.frame.halls[hallIndex]!;
  const { range } = useContext(ViewRangeContext);
  /** The band being drawn, and the free part of the day it's drawn in. */
  const drawing = useRef<{ id: string; gap: Window } | null>(null);
  const unit = hall.unitMinutes;
  const step = stepOf(unit);
  const name = hallName(hall, hallIndex);
  const span = Math.max(1, range.end - range.start);
  const pct = (m: number) => `${((m - range.start) / span) * 100}%`;
  const per = unit === 60 ? "per hour" : unit ? `per ${unit} min` : "per unit";
  // A time field can't show 24:00, so the day's last step is left free.
  const day: Window = { from: range.start, to: range.end - GRID_MINUTES };

  const bands = hall.bands
    .map((band, index) => ({ band, index, from: minutesOfDay(band.from), to: minutesOfDay(band.to) }))
    .filter((b): b is typeof b & Span => b.from !== null && b.to !== null && b.to > b.from)
    .sort((a, b) => a.from - b.from);

  /** The free parts of the day, between the bands. */
  const free: Window[] = [];
  let cursor = day.from;
  for (const b of bands) {
    if (b.from > cursor) free.push({ from: cursor, to: b.from });
    cursor = Math.max(cursor, b.to);
  }
  if (cursor < day.to) free.push({ from: cursor, to: day.to });

  const hours = bands.length > 0 ? { from: bands[0]!.from, to: Math.max(...bands.map((b) => b.to)) } : null;
  const coverage = hours ? bandCoverage(hours, bands) : { gaps: [], overlaps: [] };
  const next = hall.bands.findIndex((b) => b.from === "" && b.to === "");
  const nextName = next >= 0 ? bandName(hall.bands[next]!, next) : `Band ${hall.bands.length + 1}`;

  function draw(w: Window) {
    let current = drawing.current;
    if (!current) {
      // The free part the drag began in: the one the first step covers most of.
      const overlap = (g: Window) => Math.min(g.to, w.to) - Math.max(g.from, w.from);
      const gap = [...free].sort((a, b) => overlap(b) - overlap(a))[0];
      if (!gap || overlap(gap) <= 0) return;
      current = drawing.current = { id: next >= 0 ? hall.bands[next]!.id : newId(), gap };
    }
    const { id, gap } = current;
    let from = Math.max(w.from, gap.from);
    let to = Math.min(w.to, gap.to);
    // Starting or ending a step short of the neighbouring band joins it, so no sliver is left between them.
    const near = Math.max(step, 3 * GRID_MINUTES);
    if (from - gap.from < near && gap.from > day.from) from = gap.from;
    if (gap.to - to < near && gap.to < day.to) to = gap.to;
    if (to <= from) return;
    update((d) => void drawBand(d.frame.halls[hallIndex]!, clock(from), clock(to), id));
  }

  return (
    <div className={`relative ${className ?? ""}`} onPointerDownCapture={() => (drawing.current = null)}>
      <TimeWindowTrack
        name={`${name}: new band`}
        window={null}
        unit={unit}
        className="absolute inset-0"
        hoverGuide
        emptyHint={bands.length === 0 ? `Drag to set ${nextName}` : ""}
        onDraw={draw}
        onChange={() => {}}
      />
      {coverage.gaps.map((gap) => (
        <span
          key={`gap-${gap.from}`}
          className="hatch pointer-events-none absolute inset-y-0 grid place-items-center bg-destructive/15 text-xs font-medium text-over-text"
          style={{ left: pct(gap.from), width: `calc(${pct(gap.to)} - ${pct(gap.from)})` }}
        >
          <span className="truncate">Gap</span>
        </span>
      ))}
      {bands.map(({ band, index, from, to }, i) => {
        const before = Math.max(day.from, ...bands.filter((o) => o.index !== index && o.to <= from).map((o) => o.to));
        const after = Math.min(day.to, ...bands.filter((o) => o.index !== index && o.from >= to).map((o) => o.from));
        const label = bandName(band, index);
        const place = (w: Window) =>
          update((d) => {
            const h = d.frame.halls[hallIndex]!;
            Object.assign(h.bands[index]!, { from: clock(w.from), to: clock(w.to) });
            hoursFromBands(h);
          });
        return (
          <TimeWindowTrack
            key={band.id}
            name={`${name}: ${label}`}
            window={{ from, to }}
            unit={unit}
            bounds={{ min: Math.min(before, from), max: Math.max(after, to) }}
            passThrough
            className="absolute inset-0"
            windowClassName={`${i % 2 === 0 ? "bg-foreground/[0.08]" : "bg-foreground/[0.16]"} ${
              selected === index ? "ring-2 ring-foreground" : ""
            }`}
            onChange={place}
            onDelete={() => update((d) => removeBand(d.frame.halls[hallIndex]!, index))}
            onTap={() => onSelectBand(index)}
            overlay={
              <span
                className="absolute inset-y-0 flex items-center overflow-hidden px-2 text-xs font-medium"
                style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
                title={`${label}: ${band.from}–${band.to}${band.rate !== null ? `, ${formatMoney(band.rate)} ${per}` : ""}`}
              >
                <span className="truncate">
                  {label}
                  {band.rate !== null ? ` · ${formatMoney(band.rate)} ${per}` : ""}
                </span>
              </span>
            }
          />
        );
      })}
      {coverage.overlaps.map((overlap) => (
        <span
          key={`overlap-${overlap.from}`}
          className="pointer-events-none absolute inset-y-0 border-2 border-destructive bg-destructive/20"
          style={{ left: pct(overlap.from), width: `calc(${pct(overlap.to)} - ${pct(overlap.from)})` }}
        />
      ))}
    </div>
  );
}
