"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EstimatedSchedule, Round, Stage } from "@/engine";
import { bandName, courtHours, courtNumber, hallName, type PlanDraft } from "@/lib/tournament/draft";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { STAGE_LABELS, categoryName, formatMoney } from "./labels";
import { formatClock } from "./workings";

// The day as one timeline: a lane per hall, a row per court, and the
// estimated schedule over it. Times are minutes since midnight in the
// tournament's time zone, as the venue is entered.

/** Stage colours, strongest for the final. */
export const STAGE_COLOURS: Record<Stage, string> = {
  group: "bg-chart-3",
  knockout: "bg-chart-2",
  bronze: "bg-chart-4",
  final: "bg-chart-1",
};

/** Playback runs the whole day in this many seconds: a viewing speed, not a tournament value. */
const PLAYBACK_SECONDS = 30;
const KEY_STEP = 5;

export function roundLabel(round: Round): string | null {
  if (!round) return null;
  if (round.type === "wave") return `Wave ${round.wave}`;
  if (round.size === 4) return "Semi-finals";
  if (round.size === 8) return "Quarter-finals";
  return `Round of ${round.size}`;
}

/** A segment of the estimate in local minutes. */
export interface LocalSegment {
  courtId: string;
  from: number;
  to: number;
  stage: Stage;
  label: string;
  matches: number;
}

/** The estimate's segments in local minutes, labelled for display. */
export function localSegments(draft: PlanDraft, schedule: EstimatedSchedule | null): LocalSegment[] {
  if (!schedule) return [];
  const local = (iso: string) => minutesOfDay(formatClock(iso, draft.frame.timeZone))!;
  return schedule.courts.flatMap((court) =>
    court.segments.map((s) => {
      const round = roundLabel(s.round);
      const stage = s.stage === "knockout" && round ? round : STAGE_LABELS[s.stage];
      const parts = [stage, s.stage === "group" ? round : null, categoryName(draft, s.categoryId)].filter(Boolean);
      return {
        courtId: court.courtId,
        from: local(s.from),
        to: local(s.to),
        stage: s.stage,
        label: parts.join(" · "),
        matches: s.matches,
      };
    }),
  );
}

export type CourtStatus =
  | { kind: "playing"; stage: Stage; label: string }
  | { kind: "free" }
  | { kind: "notBooked" };

/** What each court is doing at a moment. */
export function courtStatuses(draft: PlanDraft, segments: LocalSegment[], minute: number): Map<string, CourtStatus> {
  const statuses = new Map<string, CourtStatus>();
  for (const hall of draft.frame.halls) {
    for (const court of hall.courts) {
      const hours = courtHours(hall, court);
      const from = minutesOfDay(hours.from);
      const to = minutesOfDay(hours.to);
      const playing = segments.find((s) => s.courtId === court.id && s.from <= minute && minute < s.to);
      statuses.set(
        court.id,
        playing
          ? { kind: "playing", stage: playing.stage, label: playing.label }
          : from !== null && to !== null && from <= minute && minute < to
            ? { kind: "free" }
            : { kind: "notBooked" },
      );
    }
  }
  return statuses;
}

/** The day's span from the halls entered so far; null until a hall has hours. */
export function dayRange(draft: PlanDraft): { start: number; end: number } | null {
  const spans = draft.frame.halls
    .map((h) => [minutesOfDay(h.from), minutesOfDay(h.to)] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null && s[1] > s[0]);
  if (spans.length === 0) return null;
  return { start: Math.min(...spans.map((s) => s[0])), end: Math.max(...spans.map((s) => s[1])) };
}

export function Timeline({
  draft,
  schedule,
  segments,
  playhead,
  onSeek,
  playing,
  onPlayingChange,
}: {
  draft: PlanDraft;
  schedule: EstimatedSchedule | null;
  segments: LocalSegment[];
  playhead: number | null;
  onSeek: (minute: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  const range = dayRange(draft);
  const start = range?.start;
  const end = range?.end;
  const track = useRef<HTMLDivElement>(null);
  const tz = draft.frame.timeZone;
  const local = (iso: string | null) => (iso ? minutesOfDay(formatClock(iso, tz)) : null);

  // Playback: move the playhead forward until the end of the day.
  const position = useRef(playhead);
  useEffect(() => {
    position.current = playhead;
  }, [playhead]);
  useEffect(() => {
    if (!playing || start === undefined || end === undefined) return;
    let frame = 0;
    let last = performance.now();
    const perMs = (end - start) / (PLAYBACK_SECONDS * 1000);
    const tick = (time: number) => {
      const next = Math.min(end, (position.current ?? start) + (time - last) * perMs);
      last = time;
      position.current = next;
      onSeek(next);
      if (next >= end) onPlayingChange(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, start, end, onSeek, onPlayingChange]);

  const ticks = useMemo(() => {
    if (start === undefined || end === undefined) return [];
    const out: number[] = [];
    for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) out.push(m);
    return out;
  }, [start, end]);

  if (!range) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Set a hall&apos;s hours to see the day.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const span = range.end - range.start;
  const clamp = (m: number) => Math.min(Math.max(m, range.start), range.end);
  const pct = (m: number) => `${((clamp(m) - range.start) / span) * 100}%`;
  const width = (from: number, to: number) => `${((clamp(to) - clamp(from)) / span) * 100}%`;
  const buffer = draft.frame.bufferMinutes ?? 0;
  const playingEnd = range.end - buffer;
  const finish = local(schedule?.finish ?? null);
  const worstFinish = local(schedule?.worstFinish ?? null);
  const now = playhead ?? range.start;

  function seekFrom(event: PointerEvent<HTMLElement>) {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    onSeek(Math.round(range!.start + ratio * span));
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const moves: Record<string, number> = {
      ArrowRight: now + KEY_STEP,
      ArrowUp: now + KEY_STEP,
      ArrowLeft: now - KEY_STEP,
      ArrowDown: now - KEY_STEP,
      Home: range!.start,
      End: range!.end,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onPlayingChange(false);
    onSeek(clamp(Math.round(next)));
  }

  const markers = [
    buffer > 0 ? { at: playingEnd, label: "Play must end", dashed: false } : null,
    finish !== null ? { at: finish, label: "Finish", dashed: false } : null,
    worstFinish !== null && worstFinish !== finish ? { at: worstFinish, label: "Worst case", dashed: true } : null,
  ].filter((m): m is { at: number; label: string; dashed: boolean } => m !== null);

  const usedStages = (["group", "knockout", "bronze", "final"] as const).filter((s) =>
    segments.some((x) => x.stage === s),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Timeline</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm tabular-nums">{clock(Math.round(now))}</span>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={playing}
              onClick={() => {
                if (!playing && now >= range.end) onSeek(range.start);
                onPlayingChange(!playing);
              }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />} {playing ? "Pause" : "Play"}
            </Button>
          </span>
        </CardTitle>
        <CardDescription>
          {schedule
            ? "Estimate: matches placed in order on the first free court, at typical length. Rest between matches isn't modelled yet. Move the playhead to see each court's match on the venue."
            : "Complete the plan to see the estimated schedule. The venue is shown as entered."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {schedule && schedule.unplaced > 0 ? (
          <p className="text-sm text-destructive">
            {schedule.unplaced} {schedule.unplaced === 1 ? "match doesn't" : "matches don't"} fit in the day.
          </p>
        ) : null}

        <div className="flex gap-3">
          {/* Labels, row for row with the track. */}
          <div className="flex w-22 shrink-0 flex-col" aria-hidden="true">
            <div className="h-7" />
            {draft.frame.halls.map((hall, h) => (
              <div key={hall.id} className="flex flex-col gap-1 pt-3">
                <div className="h-5 truncate text-sm leading-5 font-medium">{hallName(hall, h)}</div>
                {hall.courts.map((court, c) => (
                  <div key={court.id} className="h-5 text-xs leading-5 text-muted-foreground tabular-nums">
                    Court {courtNumber(draft.frame.halls, h, c)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            {/* The axis is also the seek bar. */}
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Time on the timeline"
              aria-valuemin={range.start}
              aria-valuemax={range.end}
              aria-valuenow={Math.round(now)}
              aria-valuetext={clock(Math.round(now))}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onPlayingChange(false);
                seekFrom(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e);
              }}
              className="relative h-7 cursor-ew-resize touch-none rounded-sm border-b outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ticks.map((m) => (
                <span
                  key={m}
                  className="absolute bottom-1 -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums"
                  style={{ left: pct(m) }}
                >
                  {clock(m)}
                </span>
              ))}
            </div>

            {draft.frame.halls.map((hall, h) => (
              <div key={hall.id} role="group" aria-label={hallName(hall, h)} className="flex flex-col gap-1 pt-3">
                <div className="relative h-5 text-[11px] text-muted-foreground">
                  {hall.bands.map((band, b) => {
                    const from = minutesOfDay(band.from);
                    const to = minutesOfDay(band.to);
                    if (from === null || to === null || to <= from) return null;
                    const rate = band.rate !== null ? ` · ${formatMoney(band.rate)}` : "";
                    return (
                      <span
                        key={band.id}
                        className="absolute top-0 truncate border-l px-1 leading-5"
                        style={{ left: pct(from), width: width(from, to) }}
                        title={`${bandName(band, b)}: ${band.from}–${band.to}${rate} per court hour`}
                      >
                        {bandName(band, b)}
                        {rate}
                      </span>
                    );
                  })}
                  {minutesOfDay(hall.from) === null || minutesOfDay(hall.to) === null ? (
                    <span className="leading-5">Hours not set</span>
                  ) : null}
                </div>
                {hall.courts.map((court) => {
                  const hours = courtHours(hall, court);
                  const from = minutesOfDay(hours.from);
                  const to = minutesOfDay(hours.to);
                  return (
                    <div key={court.id} className="relative h-5">
                      {hall.bands.map((band, b) => {
                        const bf = minutesOfDay(band.from);
                        const bt = minutesOfDay(band.to);
                        if (bf === null || bt === null || bt <= bf) return null;
                        return (
                          <span
                            key={band.id}
                            aria-hidden="true"
                            className={`absolute inset-y-0 ${b % 2 === 0 ? "bg-foreground/[0.03]" : "bg-foreground/[0.08]"}`}
                            style={{ left: pct(bf), width: width(bf, bt) }}
                          />
                        );
                      })}
                      {from !== null && to !== null && to > from ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1 rounded-sm bg-muted ring-1 ring-foreground/10"
                          style={{ left: pct(from), width: width(from, to) }}
                        />
                      ) : null}
                      {segments
                        .filter((s) => s.courtId === court.id)
                        .map((s, i) => (
                          <span
                            key={i}
                            className={`absolute inset-y-0.5 rounded-sm border-r border-card ring-1 ring-foreground/25 ring-inset ${STAGE_COLOURS[s.stage]}`}
                            style={{ left: pct(s.from), width: width(s.from, s.to) }}
                            title={`${clock(s.from)}–${clock(s.to)} ${s.label} (${s.matches} ${s.matches === 1 ? "match" : "matches"})`}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Buffer, markers and playhead over every lane. */}
            {buffer > 0 ? (
              <span
                aria-hidden="true"
                className="hatch pointer-events-none absolute top-7 bottom-0"
                style={{ left: pct(playingEnd), width: width(playingEnd, range.end) }}
              />
            ) : null}
            {markers.map((m, i) => {
              // Labels stack so close markers don't overlap, and sit left of lines near the end of the day.
              const nearEnd = (m.at - range.start) / span > 0.75;
              return (
                <span
                  key={m.label}
                  className={`pointer-events-none absolute top-7 bottom-0 border-l ${m.dashed ? "border-dashed border-foreground/60" : "border-foreground"}`}
                  style={{ left: pct(m.at) }}
                >
                  <span
                    className={`absolute rounded-sm bg-card px-1 text-[10px] leading-3.5 whitespace-nowrap ${nearEnd ? "right-1" : "left-1"}`}
                    style={{ top: `${i * 14}px` }}
                  >
                    {m.label} {clock(m.at)}
                  </span>
                </span>
              );
            })}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
              style={{ left: pct(now) }}
            >
              <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-foreground" />
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {usedStages.map((stage) => (
            <span key={stage} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${STAGE_COLOURS[stage]}`} aria-hidden="true" />
              {STAGE_LABELS[stage]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted ring-1 ring-foreground/10" aria-hidden="true" />
            Court available
          </span>
          {buffer > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="hatch size-2.5 rounded-sm ring-1 ring-foreground/20" aria-hidden="true" />
              Buffer
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
