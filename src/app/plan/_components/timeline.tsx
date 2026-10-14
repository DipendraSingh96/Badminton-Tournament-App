"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { playersPerEntry, type EstimatedSchedule, type MatchInfo, type Round, type Stage, type WindowKey, type Zone } from "@/engine";
import { courtHours, courtNumber, hallName, zonePin, type PlanDraft } from "@/lib/tournament/draft";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { InfoTip } from "./fields";
import { HallTrack } from "./hall-track";
import { STAGE_LABELS, categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { TimeWindowTrack, ViewRangeContext } from "./time-window";
import { formatClock } from "./workings";

// The day as one timeline: per hall, its rate bands, its stage zones and a
// row per court with the estimated matches on it. Times are minutes since
// midnight in the tournament's time zone, as the venue is entered.

/** Stage colours, strongest for the final. */
export const STAGE_COLOURS: Record<Stage, string> = {
  group: "bg-chart-3",
  knockout: "bg-chart-2",
  bronze: "bg-chart-4",
  final: "bg-chart-1",
};

/** Zone shading across a hall's courts: the group stage and the KO stage look different. */
const ZONE_SHADING: Record<Zone, string> = { group: "zone-group", knockout: "zone-ko" };
const ZONE_LABELS: Record<Zone, string> = { group: "Group stage", knockout: "KO stage" };
/** In a sentence: "Hall A group stage", "Hall A KO stage". */
const ZONE_NAMES: Record<Zone, string> = { group: "group stage", knockout: "KO stage" };

/** Playback runs the whole day in this many seconds: a viewing speed, not a tournament value. */
const PLAYBACK_SECONDS = 30;
const KEY_STEP = 5;
/** Room an hour label needs on the axis. */
const TICK_LABEL_PX = 44;

export function roundLabel(round: Round): string | null {
  if (!round) return null;
  if (round.type === "wave") return `Wave ${round.wave}`;
  if (round.size === 4) return "Semi-finals";
  if (round.size === 8) return "Quarter-finals";
  return `Round of ${round.size}`;
}

/** "Quarter-final 1", "Semi-final 2", "Round of 16, match 3", "Final", "Bronze match". */
function knockoutName(code: string | undefined): string {
  if (!code) return "Knockout";
  if (code === "Final") return "Final";
  if (code === "Bronze") return "Bronze match";
  const quarter = /^QF(\d+)$/.exec(code);
  if (quarter) return `Quarter-final ${quarter[1]}`;
  const semi = /^SF(\d+)$/.exec(code);
  if (semi) return `Semi-final ${semi[1]}`;
  const round = /^R(\d+)-(\d+)$/.exec(code);
  return round ? `Round of ${round[1]}, match ${round[2]}` : code;
}

/** What a draw slot is called: a player, pair or team. */
function sideNoun(draft: PlanDraft, categoryId: string): string {
  if (draft.unit === "team") return "Team";
  const event = draft.categories.find((c) => c.id === categoryId)?.event;
  return event && playersPerEntry(event) === 1 ? "Player" : "Pair";
}

/** A match in words, for running it: where it sits, who plays, the rubber. */
export function matchText(draft: PlanDraft, match: MatchInfo): { where: string; sides: string; rubber: string | null } {
  const where = match.stage === "group" ? `Group ${match.group} · Wave ${match.wave}` : knockoutName(match.code);
  const noun = sideNoun(draft, match.categoryId);
  const sides =
    match.stage === "group" ? `${noun} ${match.home} v ${noun} ${match.away}` : `${match.home} v ${match.away}`;
  const rubber = match.rubber
    ? `Rubber ${match.rubber.number} of ${match.rubber.of}: ${EVENT_LABELS[match.rubber.event]}`
    : null;
  return { where, sides, rubber };
}

/** A segment of the estimate in local minutes, with each of its matches. */
export interface LocalSegment {
  courtId: string;
  from: number;
  to: number;
  stage: Stage;
  label: string;
  matches: number;
  details: { from: number; to: number; match: MatchInfo }[];
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
        details: s.details.map((d) => ({ from: local(d.from), to: local(d.to), match: d.match })),
      };
    }),
  );
}

export type CourtStatus =
  | { kind: "playing"; stage: Stage; label: string }
  | { kind: "free" }
  | { kind: "notBooked" };

/** What each court is doing at a moment: the match on it, in short. */
export function courtStatuses(draft: PlanDraft, segments: LocalSegment[], minute: number): Map<string, CourtStatus> {
  const statuses = new Map<string, CourtStatus>();
  for (const hall of draft.frame.halls) {
    for (const court of hall.courts) {
      const hours = courtHours(hall, court);
      const from = minutesOfDay(hours.from);
      const to = minutesOfDay(hours.to);
      const segment = segments.find((s) => s.courtId === court.id && s.from <= minute && minute < s.to);
      const detail = segment?.details.find((d) => d.from <= minute && minute < d.to);
      if (segment && detail) {
        const { where, sides, rubber } = matchText(draft, detail.match);
        const short = [where, sides.replace(/\b(Pair|Player|Team) /g, ""), rubber?.replace(/: .*/, ""), categoryName(draft, detail.match.categoryId)]
          .filter(Boolean)
          .join(" · ");
        statuses.set(court.id, { kind: "playing", stage: segment.stage, label: short });
      } else {
        statuses.set(
          court.id,
          from !== null && to !== null && from <= minute && minute < to ? { kind: "free" } : { kind: "notBooked" },
        );
      }
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

/** A hall's stage zone: its pin when pinned, otherwise where the estimate played the stage there. */
export interface ZoneRow {
  key: WindowKey;
  hallId: string;
  zone: Zone;
  /** "Group stage · Men's doubles, Men's singles". */
  label: string;
  window: { from: number; to: number } | null;
  pinned: boolean;
  /** Local minutes: the real end of a too-short zone, or the earliest possible start. */
  overrun: number | null;
  earliest: number | null;
}

/** Every hall's group and KO zones, in hall order. */
export function zoneRows(draft: PlanDraft, schedule: EstimatedSchedule | null): ZoneRow[] {
  if (!schedule) return [];
  const local = (iso: string) => minutesOfDay(formatClock(iso, draft.frame.timeZone))!;
  return draft.frame.halls.flatMap((hall) =>
    (["group", "knockout"] as const).flatMap((zone) => {
      const key: WindowKey = `${hall.id}:${zone}`;
      const span = schedule.windows[key];
      const pin = zonePin(draft, key);
      const pinFrom = minutesOfDay(pin?.from);
      const pinTo = minutesOfDay(pin?.to);
      const pinned = pinFrom !== null && pinTo !== null;
      if (!span && !pinned) return [];
      const categories = (span?.categoryIds ?? []).map((id) => categoryName(draft, id));
      return [
        {
          key,
          hallId: hall.id,
          zone,
          label: [ZONE_LABELS[zone], categories.join(", ")].filter(Boolean).join(" · "),
          window: pinned ? { from: pinFrom, to: pinTo } : span ? { from: local(span.from), to: local(span.to) } : null,
          pinned,
          overrun: span?.overrun ? local(span.overrun) : null,
          earliest: span?.earliest ? local(span.earliest) : null,
        },
      ];
    }),
  );
}

/** Problems with pinned zones, in words, for the summary. */
export function zoneWarnings(draft: PlanDraft, rows: ZoneRow[]): string[] {
  return rows.flatMap((row) => {
    const index = draft.frame.halls.findIndex((h) => h.id === row.hallId);
    const name = `${hallName(draft.frame.halls[index]!, index)} ${ZONE_NAMES[row.zone]}`;
    return [
      ...(row.pinned && row.overrun !== null && row.window
        ? [`${name} needs until ${clock(row.overrun)} (zone ends ${clock(row.window.to)})`]
        : []),
      ...(row.pinned && row.earliest !== null && row.window
        ? [`${name} can't start before ${clock(row.earliest)} (zone starts ${clock(row.window.from)})`]
        : []),
    ];
  });
}

interface Hovered {
  x: number;
  y: number;
  lines: string[];
}

export function Timeline({
  draft,
  update,
  schedule,
  segments,
  zones,
  playhead,
  onSeek,
  playing,
  onPlayingChange,
}: {
  draft: PlanDraft;
  update: Update;
  schedule: EstimatedSchedule | null;
  segments: LocalSegment[];
  /** Each hall's stage zones; empty until the plan is complete. */
  zones: ZoneRow[];
  playhead: number | null;
  onSeek: (minute: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  // The strips show the view range; the playhead runs over the day itself.
  const { range } = useContext(ViewRangeContext);
  const day = dayRange(draft) ?? range;
  const start = day.start;
  const end = day.end;
  const track = useRef<HTMLDivElement>(null);
  const tz = draft.frame.timeZone;
  const local = (iso: string | null) => (iso ? minutesOfDay(formatClock(iso, tz)) : null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  // Playback: move the playhead forward until the end of the day.
  const position = useRef(playhead);
  useEffect(() => {
    position.current = playhead;
  }, [playhead]);
  useEffect(() => {
    if (!playing) return;
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

  // Hour labels thin out on a narrow axis so they never collide.
  const [axisWidth, setAxisWidth] = useState(0);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAxisWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const ticks = useMemo(() => {
    const hours = Math.max(1, (range.end - range.start) / 60);
    const every = axisWidth > 0 ? Math.max(1, Math.ceil(TICK_LABEL_PX / (axisWidth / hours))) : 1;
    const out: number[] = [];
    for (let m = Math.ceil(range.start / 60) * 60; m <= range.end; m += 60 * every) out.push(m);
    return out;
  }, [range.start, range.end, axisWidth]);

  const span = Math.max(1, range.end - range.start);
  const clampView = (m: number) => Math.min(Math.max(m, range.start), range.end);
  const clampDay = (m: number) => Math.min(Math.max(m, start), end);
  const pct = (m: number) => `${((clampView(m) - range.start) / span) * 100}%`;
  const width = (from: number, to: number) => `${((clampView(to) - clampView(from)) / span) * 100}%`;
  const now = clampDay(playhead ?? start);
  const finish = local(schedule?.finish ?? null);
  const worstFinish = local(schedule?.worstFinish ?? null);

  // Buffer: pinned at its own time, or shown straight after the last match.
  const bufferLength = draft.frame.bufferMinutes ?? 0;
  const pinnedAt = minutesOfDay(draft.frame.bufferStart);
  const hasHours = dayRange(draft) !== null;
  const bufferWindow =
    pinnedAt !== null
      ? { from: pinnedAt, to: pinnedAt + bufferLength }
      : bufferLength > 0 && hasHours
        ? finish !== null
          ? { from: finish, to: finish + bufferLength }
          : { from: end - bufferLength, to: end }
        : null;
  // Its length is whole units of the hall that closes last.
  const lastHall = [...draft.frame.halls]
    .filter((h) => minutesOfDay(h.to) !== null)
    .sort((a, b) => minutesOfDay(b.to)! - minutesOfDay(a.to)!)[0];
  const bufferUnit = lastHall?.unitMinutes ?? null;

  function seekFrom(event: PointerEvent<HTMLElement>) {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    onSeek(clampDay(Math.round(range.start + ratio * span)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const moves: Record<string, number> = {
      ArrowRight: now + KEY_STEP,
      ArrowUp: now + KEY_STEP,
      ArrowLeft: now - KEY_STEP,
      ArrowDown: now - KEY_STEP,
      Home: start,
      End: end,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onPlayingChange(false);
    onSeek(clampDay(Math.round(next)));
  }

  /** The hover card's lines for a match on a court. */
  function cardLines(detail: LocalSegment["details"][number], court: string): string[] {
    const { where, sides, rubber } = matchText(draft, detail.match);
    return [
      `${categoryName(draft, detail.match.categoryId)} · ${where}`,
      sides,
      ...(rubber ? [rubber] : []),
      `${court} · ${clock(detail.from)}–${clock(detail.to)}`,
    ];
  }

  const usedStages = (["group", "knockout", "bronze", "final"] as const).filter((s) =>
    segments.some((x) => x.stage === s),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            Timeline
            <InfoTip about="the timeline">
              Drag a hall&apos;s window to set its hours, the lines between rate bands to move them, and a court&apos;s
              bar to narrow it (double-click to follow the hall again). Moves are in the hall&apos;s unit time; a new
              window starts on 10-minute steps. Each hall&apos;s Stages row has its group and KO zones: drag one to pin
              that stage&apos;s time in that hall (double-click to return it to the estimate); it turns red when its
              matches need longer or can&apos;t start yet. Hover a match to see who plays where. Drag the buffer to pin
              it.{" "}
              {schedule
                ? "Matches are an estimate: placed in order on the first free court, at typical length; rest isn't modelled yet."
                : "Complete the plan to see the estimated schedule."}
            </InfoTip>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm tabular-nums">{clock(Math.round(now))}</span>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={playing}
              disabled={!hasHours}
              onClick={() => {
                if (!playing && now >= end) onSeek(start);
                onPlayingChange(!playing);
              }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />} {playing ? "Pause" : "Play"}
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {schedule && schedule.unplaced > 0 ? (
          <p className="text-sm text-destructive">
            {schedule.unplaced} {schedule.unplaced === 1 ? "match doesn't" : "matches don't"} fit in the day.
          </p>
        ) : null}

        <div className="flex gap-3">
          {/* Labels, row for row with the tracks. */}
          <div className="flex w-22 shrink-0 flex-col" aria-hidden="true">
            <div className="h-7" />
            {draft.frame.halls.map((hall, h) => (
              <div key={hall.id} className="flex flex-col gap-1 pt-3">
                <div className="h-6 truncate text-sm leading-6 font-medium">{hallName(hall, h)}</div>
                {schedule ? <div className="h-5 text-xs leading-5 font-medium">Stages</div> : null}
                {hall.courts.map((court, c) => (
                  <div key={court.id} className="h-5 text-xs leading-5 text-muted-foreground tabular-nums">
                    Court {courtNumber(draft.frame.halls, h, c)}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-3 h-5 text-xs leading-5 font-medium">Buffer</div>
          </div>

          <div className="relative min-w-0 flex-1">
            {/* The axis is also the seek bar. */}
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Time on the timeline"
              aria-valuemin={start}
              aria-valuemax={end}
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

            {draft.frame.halls.map((hall, h) => {
              const open = minutesOfDay(hall.from);
              const close = minutesOfDay(hall.to);
              const hallBounds = open !== null && close !== null && close > open ? { min: open, max: close } : null;
              const hallZones = zones.filter((z) => z.hallId === hall.id);
              return (
                <div key={hall.id} role="group" aria-label={hallName(hall, h)} className="flex flex-col gap-1 pt-3">
                  <HallTrack draft={draft} hallIndex={h} update={update} className="h-6" />

                  {schedule ? (
                    <div className="relative h-5" role="group" aria-label={`${hallName(hall, h)} stages`}>
                      {hallZones.map((z) => {
                        const unpin = z.pinned ? () => update((d) => void delete d.stageWindows[z.key]) : undefined;
                        const marks = [
                          z.pinned && z.overrun !== null ? { at: z.overrun, label: `Needs until ${clock(z.overrun)}` } : null,
                          z.pinned && z.earliest !== null
                            ? { at: z.earliest, label: `Can't start before ${clock(z.earliest)}` }
                            : null,
                        ].filter((m): m is { at: number; label: string } => m !== null);
                        return (
                          <div key={z.key} data-path={`stageWindows.${z.key}`} className="pointer-events-none absolute inset-0">
                            <TimeWindowTrack
                              name={`${hallName(hall, h)} ${ZONE_NAMES[z.zone]}`}
                              window={z.window}
                              unit={null}
                              bounds={hallBounds ?? undefined}
                              passThrough
                              className="h-5"
                              invalid={marks.length > 0}
                              windowClassName={`${ZONE_SHADING[z.zone]} bg-muted ${z.pinned ? "" : "opacity-60"}`}
                              onChange={(w) =>
                                update((d) => void (d.stageWindows[z.key] = { from: clock(w.from), to: clock(w.to) }))
                              }
                              onDelete={unpin}
                              onReset={unpin}
                              overlay={
                                <>
                                  {z.window ? (
                                    <span
                                      className="absolute inset-y-0 flex items-center truncate px-1.5 text-[10px] font-medium"
                                      style={{ left: pct(z.window.from), width: width(z.window.from, z.window.to) }}
                                    >
                                      {z.label}
                                    </span>
                                  ) : null}
                                  {marks.map((m, i) => (
                                    <span
                                      key={m.label}
                                      className="absolute inset-y-0 border-l-2 border-destructive"
                                      style={{ left: pct(m.at) }}
                                    >
                                      <span
                                        className="absolute left-1 rounded-sm bg-destructive px-1 text-[10px] leading-4 whitespace-nowrap text-destructive-foreground"
                                        style={{ top: `${i * 16 - 2}px` }}
                                      >
                                        {m.label}
                                      </span>
                                    </span>
                                  ))}
                                </>
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {hall.courts.map((court, c) => {
                    const hours = courtHours(hall, court);
                    const from = minutesOfDay(hours.from);
                    const to = minutesOfDay(hours.to);
                    const narrowed = court.from !== null || court.to !== null;
                    const courtLabel = `Court ${courtNumber(draft.frame.halls, h, c)}`;
                    const setCourt = (w: { from: number; to: number }) =>
                      update((d) => {
                        const target = d.frame.halls[h]!.courts[c]!;
                        const follows = w.from === open && w.to === close;
                        target.from = follows ? null : clock(w.from);
                        target.to = follows ? null : clock(w.to);
                      });
                    return (
                      <TimeWindowTrack
                        key={court.id}
                        name={courtLabel}
                        window={hallBounds && from !== null && to !== null && to > from ? { from, to } : null}
                        unit={hall.unitMinutes}
                        origin={open}
                        bounds={hallBounds ?? undefined}
                        className="h-5"
                        windowClassName={narrowed ? "bg-muted" : "bg-muted/60"}
                        onChange={setCourt}
                        onReset={
                          narrowed
                            ? () =>
                                update((d) => {
                                  const target = d.frame.halls[h]!.courts[c]!;
                                  target.from = null;
                                  target.to = null;
                                })
                            : undefined
                        }
                        background={
                          <>
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
                          </>
                        }
                        overlay={
                          <>
                            {/* The hall's stage zones, shaded behind the matches. */}
                            {hallZones.map((z) =>
                              z.window ? (
                                <span
                                  key={z.key}
                                  aria-hidden="true"
                                  className={`absolute -inset-y-0.5 ${ZONE_SHADING[z.zone]}`}
                                  style={{ left: pct(z.window.from), width: width(z.window.from, z.window.to) }}
                                />
                              ) : null,
                            )}
                            {segments
                              .filter((s) => s.courtId === court.id)
                              .map((s, i) => (
                                <span
                                  key={i}
                                  tabIndex={0}
                                  role="button"
                                  aria-label={`${courtLabel}, ${clock(s.from)}–${clock(s.to)}: ${s.label}, ${s.matches} ${s.matches === 1 ? "match" : "matches"}`}
                                  className={`pointer-events-auto absolute inset-y-0.5 cursor-default rounded-sm border-r border-card ring-1 ring-foreground/25 outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring ${STAGE_COLOURS[s.stage]}`}
                                  style={{ left: pct(s.from), width: width(s.from, s.to) }}
                                  onPointerMove={(e) => {
                                    const box = e.currentTarget.getBoundingClientRect();
                                    const minute = s.from + ((e.clientX - box.left) / Math.max(1, box.width)) * (s.to - s.from);
                                    const detail =
                                      s.details.find((d) => d.from <= minute && minute < d.to) ?? s.details.at(-1)!;
                                    setHovered({ x: e.clientX, y: e.clientY, lines: cardLines(detail, courtLabel) });
                                  }}
                                  onPointerLeave={() => setHovered(null)}
                                  onFocus={(e) => {
                                    const box = e.currentTarget.getBoundingClientRect();
                                    setHovered({
                                      x: box.left,
                                      y: box.bottom,
                                      lines: s.details.flatMap((d, k) => [...(k > 0 ? [""] : []), ...cardLines(d, courtLabel)]),
                                    });
                                  }}
                                  onBlur={() => setHovered(null)}
                                />
                              ))}
                          </>
                        }
                      />
                    );
                  })}
                </div>
              );
            })}

            <div className="mt-3">
              <TimeWindowTrack
                name="Buffer"
                mode="buffer"
                window={bufferWindow}
                unit={bufferUnit}
                bounds={hasHours ? { min: start, max: end } : undefined}
                className="h-5"
                windowClassName={`hatch ${pinnedAt !== null ? "bg-muted" : ""}`}
                emptyHint="Drag to add a buffer"
                onDraw={
                  hasHours
                    ? (w) =>
                        update((d) => {
                          d.frame.bufferStart = clock(w.from);
                          d.frame.bufferMinutes = w.to - w.from;
                        })
                    : undefined
                }
                onChange={(w) =>
                  update((d) => {
                    d.frame.bufferStart = clock(w.from);
                    d.frame.bufferMinutes = w.to - w.from;
                  })
                }
                onDelete={() =>
                  update((d) => {
                    d.frame.bufferStart = null;
                    d.frame.bufferMinutes = 0;
                  })
                }
                onReset={pinnedAt !== null ? () => update((d) => void (d.frame.bufferStart = null)) : undefined}
              />
            </div>

            {/* The buffer zone, the worst-case line and the playhead over every lane. */}
            {bufferWindow ? (
              <span
                aria-hidden="true"
                className="hatch pointer-events-none absolute top-7 bottom-6 opacity-60"
                style={{ left: pct(bufferWindow.from), width: width(bufferWindow.from, bufferWindow.to) }}
              />
            ) : null}
            {worstFinish !== null ? (
              <span
                className="pointer-events-none absolute top-7 bottom-0 z-20 border-l-2 border-destructive"
                style={{ left: pct(worstFinish) }}
              >
                <span
                  className={`absolute top-0 rounded-sm bg-destructive px-1 text-[10px] leading-4 whitespace-nowrap text-destructive-foreground ${
                    (worstFinish - range.start) / span > 0.75 ? "right-1" : "left-1"
                  }`}
                >
                  Worst case {clock(worstFinish)}
                </span>
              </span>
            ) : null}
            {hasHours ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-foreground"
                style={{ left: pct(now) }}
              >
                <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-foreground" />
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {usedStages.map((stage) => (
            <span key={stage} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${STAGE_COLOURS[stage]}`} aria-hidden="true" />
              {STAGE_LABELS[stage]}
            </span>
          ))}
          {zones.length > 0 ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="zone-group size-2.5 rounded-sm ring-1 ring-foreground/30" aria-hidden="true" />
                Group stage zone
              </span>
              <span className="flex items-center gap-1.5">
                <span className="zone-ko size-2.5 rounded-sm ring-1 ring-foreground/30" aria-hidden="true" />
                KO stage zone
              </span>
            </>
          ) : null}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted ring-1 ring-foreground/30" aria-hidden="true" />
            Court available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hatch size-2.5 rounded-sm ring-1 ring-foreground/20" aria-hidden="true" />
            Buffer{pinnedAt !== null ? ` (pinned at ${clock(pinnedAt)})` : ""}
          </span>
          {worstFinish !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-destructive" aria-hidden="true" />
              Worst-case finish
            </span>
          ) : null}
        </div>

        {hovered ? (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 flex w-72 flex-col gap-0.5 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg"
            // Kept on screen: flips to the left of the pointer near the right edge.
            style={{
              left: hovered.x + 300 > window.innerWidth ? Math.max(8, hovered.x - 300) : hovered.x + 12,
              top: hovered.y + 12,
            }}
          >
            {hovered.lines.map((line, i) =>
              line === "" ? (
                <span key={i} className="my-1 border-t border-background/30" />
              ) : (
                <span key={i} className={i === 0 ? "font-semibold" : "tabular-nums"}>
                  {line}
                </span>
              ),
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
