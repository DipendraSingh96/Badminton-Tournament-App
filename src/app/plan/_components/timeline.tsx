"use client";

import {
  ArrowCounterClockwiseIcon,
  ArrowsInLineHorizontalIcon,
  ArrowsOutLineHorizontalIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PauseIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  playersPerEntry,
  type CapacityStatus,
  zoneOf,
  type EstimatedSchedule,
  type MatchInfo,
  type Round,
  type Stage,
  type Wait,
  type WindowKey,
  type Zone,
} from "@/engine";
import {
  courtHours,
  courtNumber,
  hallName,
  hasMoves,
  moveZone,
  resetZone,
  shiftZone,
  type PlanDraft,
} from "@/lib/tournament/draft";
import { sideName, sidePlayers } from "@/lib/tournament/entries";
import { EVENT_LABELS } from "@/lib/tournament/events";
import { GRID_MINUTES } from "@/lib/tournament/snap";
import { clock, minutesOfDay } from "@/lib/tournament/time";
import { InfoTip } from "./fields";
import { HallTrack } from "./hall-track";
import { STAGE_LABELS, categoryName } from "./labels";
import type { Update } from "./plan-editor";
import { TimeWindowTrack, ViewRangeContext } from "./time-window";
import { formatClock } from "./workings";

// The day as one timeline: per hall, its rate bands, its stage zones and a
// row per court with the estimated matches on it. Zones and matches can be
// moved by hand; the estimate re-times everything around them. Times are
// minutes since midnight in the tournament's time zone.

/** Stage colours, strongest for the final. */
export const STAGE_COLOURS: Record<Stage, string> = {
  group: "bg-tl-group",
  knockout: "bg-tl-knockout",
  bronze: "bg-tl-bronze",
  final: "bg-tl-final",
};

type Tone = "fits" | "tight" | "bad";
/** The worst-case line and its label, by fit status: neutral, warning or destructive. */
const WORST_TONES: Record<Tone, { line: string; label: string }> = {
  fits: { line: "border-tl-now/70", label: "bg-tl-now text-background" },
  tight: { line: "border-tight", label: "bg-tight text-tight-foreground" },
  bad: { line: "border-tl-worst", label: "bg-over-strong text-over-foreground" },
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
/** How long a refused move's note stays up. */
const NOTICE_MS = 2500;
/** Zoom: each step, and the closest view (the drawing grid this many pixels wide). Viewing values. */
const ZOOM_STEP = 1.5;
const GRID_MAX_PX = 48;
/** Room either side of the matches when fitting the view to them. */
const FIT_MARGIN = 15;
/** Tick spacings to choose from, in minutes. */
const TICK_STEPS = [15, 30, 60, 120, 180, 240];

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

/** A side of a match in words: its entry's name once drawn, otherwise its slot ("Team A1", "Winner QF1"). */
export function sideLabel(draft: PlanDraft, match: MatchInfo, slot: string): string {
  return sideName(draft, match.categoryId, slot) ?? (match.stage === "group" ? `${sideNoun(draft, match.categoryId)} ${slot}` : slot);
}

/** A match in words, for running it: where it sits, who plays, the rubber. */
export function matchText(draft: PlanDraft, match: MatchInfo): { where: string; sides: string; rubber: string | null } {
  const where = match.stage === "group" ? `Group ${match.group} · Wave ${match.wave}` : knockoutName(match.code);
  // Once the draw places entries, their names replace the slots.
  const sides = `${sideLabel(draft, match, match.home)} v ${sideLabel(draft, match, match.away)}`;
  const rubber = match.rubber
    ? `Rubber ${match.rubber.number} of ${match.rubber.of}: ${EVENT_LABELS[match.rubber.event]}`
    : null;
  return { where, sides, rubber };
}

/** One match on a court, in local minutes. */
export interface LocalSegment {
  id: string;
  courtId: string;
  from: number;
  to: number;
  stage: Stage;
  label: string;
  match: MatchInfo;
  moved: boolean;
  wait?: Wait;
  /** Runs past its court's hours. */
  late: boolean;
  /** Kept for the court cards: one detail a segment. */
  details: { from: number; to: number; match: MatchInfo }[];
  matches: number;
}

/** The estimate's matches in local minutes, labelled for display. */
export function localSegments(draft: PlanDraft, schedule: EstimatedSchedule | null): LocalSegment[] {
  if (!schedule) return [];
  const local = (iso: string) => minutesOfDay(formatClock(iso, draft.frame.timeZone))!;
  return schedule.courts.flatMap((court) =>
    court.segments.map((s) => {
      const detail = s.details[0]!;
      const round = roundLabel(s.round);
      const stage = s.stage === "knockout" && round ? round : STAGE_LABELS[s.stage];
      const parts = [stage, s.stage === "group" ? round : null, categoryName(draft, s.categoryId)].filter(Boolean);
      const from = local(s.from);
      const to = local(s.to);
      return {
        id: detail.id,
        courtId: court.courtId,
        from,
        to,
        stage: s.stage,
        label: parts.join(" · "),
        match: detail.match,
        moved: detail.moved,
        wait: detail.wait,
        late: detail.late,
        details: [{ from, to, match: detail.match }],
        matches: 1,
      };
    }),
  );
}

/** A knockout match's short name for the court: "QF 1", "SF 2", "Final", "R16 · 3". */
function knockoutShort(code: string | undefined): string {
  if (!code) return "Knockout";
  if (code === "Bronze") return "Bronze";
  const numbered = /^(QF|SF)(\d+)$/.exec(code);
  if (numbered) return `${numbered[1]} ${numbered[2]}`;
  const round = /^R(\d+)-(\d+)$/.exec(code);
  return round ? `R${round[1]} · ${round[2]}` : code;
}

/** A match laid out on a court: who's at each end, and what sits along the net. */
export interface CourtFace {
  /** One line above the net: "Wave 1 · R1/2", or the knockout match ("SF 1 · R1/2"). */
  net: string;
  /** Each end: the draw slot ("A1", "Winner QF1") and the name band above it ("Team A1", or the team's name). */
  home: string;
  away: string;
  homeLabel: string;
  awayLabel: string;
  /** Who plays at each end once the draw and line-ups say: shown in the halves instead of the slot. */
  homePlayers: string[];
  awayPlayers: string[];
}

export type CourtStatus =
  | { kind: "playing"; stage: Stage; label: string; face: CourtFace }
  | { kind: "free" }
  | { kind: "notBooked" };

/** The named players for a side in a match, for the court face. */
function playerNames(draft: PlanDraft, categoryId: string, slot: string, rubber: number | undefined): string[] {
  return sidePlayers(draft, categoryId, slot, rubber)
    .map((p) => p.name.trim())
    .filter(Boolean);
}

/** What each court is doing at a moment: the match on it, in short. */
export function courtStatuses(draft: PlanDraft, segments: LocalSegment[], minute: number): Map<string, CourtStatus> {
  const statuses = new Map<string, CourtStatus>();
  for (const hall of draft.frame.halls) {
    for (const court of hall.courts) {
      const hours = courtHours(hall, court);
      const from = minutesOfDay(hours.from);
      const to = minutesOfDay(hours.to);
      const segment = segments.find((s) => s.courtId === court.id && s.from <= minute && minute < s.to);
      if (segment) {
        const { where, sides, rubber } = matchText(draft, segment.match);
        const short = [where, sides.replace(/\b(Pair|Player|Team) /g, ""), rubber?.replace(/: .*/, ""), categoryName(draft, segment.match.categoryId)]
          .filter(Boolean)
          .join(" · ");
        const m = segment.match;
        const noun = sideNoun(draft, m.categoryId);
        const group = m.stage === "group";
        statuses.set(court.id, {
          kind: "playing",
          stage: segment.stage,
          label: short,
          face: {
            net: [group ? `Wave ${m.wave}` : knockoutShort(m.code), m.rubber ? `R${m.rubber.number}/${m.rubber.of}` : null]
              .filter(Boolean)
              .join(" · "),
            home: m.home,
            away: m.away,
            homeLabel: sideName(draft, m.categoryId, m.home) ?? (group ? `${noun} ${m.home}` : noun),
            awayLabel: sideName(draft, m.categoryId, m.away) ?? (group ? `${noun} ${m.away}` : noun),
            homePlayers: playerNames(draft, m.categoryId, m.home, m.rubber?.number),
            awayPlayers: playerNames(draft, m.categoryId, m.away, m.rubber?.number),
          },
        });
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

/** A hall's stage zone: where the estimate played that stage in that hall. */
export interface ZoneRow {
  key: WindowKey;
  hallId: string;
  zone: Zone;
  /** "Group stage · Men's doubles, Men's singles". */
  label: string;
  window: { from: number; to: number };
  /** Moved by hand: in time, or here from another hall. */
  moved: boolean;
  /** Dragged to start before what it depends on has finished: the earliest it can. */
  earliest: number | null;
  /** Matches running past their court's hours; the zone then runs until its end. */
  late: number;
}

/** Every hall's group and KO zones, in hall order. */
export function zoneRows(draft: PlanDraft, schedule: EstimatedSchedule | null): ZoneRow[] {
  if (!schedule) return [];
  const local = (iso: string) => minutesOfDay(formatClock(iso, draft.frame.timeZone))!;
  return draft.frame.halls.flatMap((hall) =>
    (["group", "knockout"] as const).flatMap((zone) => {
      const key: WindowKey = `${hall.id}:${zone}`;
      const span = schedule.windows[key];
      if (!span) return [];
      const categories = span.categoryIds.map((id) => categoryName(draft, id));
      return [
        {
          key,
          hallId: hall.id,
          zone,
          label: [ZONE_LABELS[zone], categories.join(", ")].filter(Boolean).join(" · "),
          window: { from: local(span.from), to: local(span.to) },
          moved: span.moved,
          earliest: span.earliest ? local(span.earliest) : null,
          late: span.late,
        },
      ];
    }),
  );
}

/** Problems with zones moved by hand, in words, for the summary. */
export function zoneWarnings(draft: PlanDraft, rows: ZoneRow[]): string[] {
  return rows.flatMap((row) => {
    const index = draft.frame.halls.findIndex((h) => h.id === row.hallId);
    const name = `${hallName(draft.frame.halls[index]!, index)} ${ZONE_NAMES[row.zone]}`;
    return [
      ...(row.earliest !== null ? [`${name} can't start before ${clock(row.earliest)}`] : []),
      ...(row.late > 0
        ? [`${name} runs until ${clock(row.window.to)}, past closing (${row.late} ${row.late === 1 ? "match" : "matches"})`]
        : []),
    ];
  });
}

interface Hovered {
  x: number;
  y: number;
  lines: string[];
}

/** A match being dragged: where the pointer is and where it would land. */
interface PillDrag {
  segment: LocalSegment;
  hallId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  target: { courtId: string; before: string | null } | null;
  refusal: string | null;
}

/** A zone being dragged: along its hall's timeline, or onto another hall. */
interface ZoneDrag {
  row: ZoneRow;
  startX: number;
  /** Minutes moved along the timeline, on the drawing grid. */
  delta: number;
  targetHall: string;
}

export function Timeline({
  draft,
  update,
  schedule,
  segments,
  zones,
  fit,
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
  /** The plan's fit status, as in the summary; null until the plan is complete. */
  fit: CapacityStatus | null;
  playhead: number | null;
  onSeek: (minute: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  // The strips show the view range; the playhead runs over the day itself.
  const { range, setDragging } = useContext(ViewRangeContext);
  /** A court's groups when groups keep their own courts: "A" or "A, E". */
  const groupsOn = (courtId: string) =>
    schedule?.courtGroups
      .find((c) => c.courtId === courtId)
      ?.groups.map((g) => g.group)
      .join(", ") ?? "";
  const day = dayRange(draft) ?? range;
  const start = day.start;
  const end = day.end;
  const track = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tz = draft.frame.timeZone;
  const local = (iso: string | null) => (iso ? minutesOfDay(formatClock(iso, tz)) : null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [pillDrag, setPillDrag] = useState<PillDrag | null>(null);
  const [zoneDrag, setZoneDrag] = useState<ZoneDrag | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // One tab stop per court's matches: the one last focused there, or its first.
  const [activePill, setActivePill] = useState<Record<string, string>>({});
  /** A match moved from the keyboard keeps the focus, even on another court. */
  const refocus = useRef<string | null>(null);

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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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
    const perMinute = axisWidth / Math.max(1, range.end - range.start);
    const every =
      axisWidth > 0 ? (TICK_STEPS.find((m) => m * perMinute >= TICK_LABEL_PX) ?? TICK_STEPS.at(-1)! * 2) : 60;
    const out: number[] = [];
    for (let m = Math.ceil(range.start / every) * every; m <= range.end; m += every) out.push(m);
    return out;
  }, [range.start, range.end, axisWidth]);

  const span = Math.max(1, range.end - range.start);

  // Zoom: the tracks are this many times the visible width, scrolled sideways.
  const labels = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewWidth, setViewWidth] = useState(0);
  useEffect(() => {
    const element = scroller.current;
    const side = labels.current;
    if (!element || !side) return;
    const measure = () => setViewWidth(roomFor(element, side));
    const observer = new ResizeObserver(measure);
    // The labels' width, and a scrollbar coming or going, change the room too.
    observer.observe(element);
    observer.observe(side);
    measure();
    return () => observer.disconnect();
  }, []);
  /** The scroller less the labels column and the right padding. */
  function roomFor(element: HTMLElement, side: HTMLElement): number {
    return Math.max(0, element.clientWidth - side.offsetWidth - 16);
  }
  const maxZoom = viewWidth > 0 ? Math.max(1, (GRID_MAX_PX / GRID_MINUTES) * (span / viewWidth)) : 1;
  const tracksWidth = zoom > 1 && viewWidth > 0 ? Math.round(viewWidth * zoom) : null;
  /** After a zoom, keep this minute at this point on screen. */
  const anchor = useRef<{ minute: number; x: number } | null>(null);

  /** Where the visible tracks start on screen, past the labels. */
  const viewLeft = () => labels.current?.getBoundingClientRect().right ?? 0;

  function zoomTo(next: number, at?: { minute: number; x: number }) {
    // Measured now: the room can change without the scroller resizing (a scrollbar appearing).
    const room = scroller.current && labels.current ? roomFor(scroller.current, labels.current) : viewWidth;
    setViewWidth(room);
    const box = track.current?.getBoundingClientRect();
    const clamped = Math.min(Math.max(next, 1), maxZoom);
    if (box && box.width > 0) {
      const x = at?.x ?? viewLeft() + room / 2;
      anchor.current = at ?? { minute: range.start + ((x - box.left) / box.width) * span, x };
    }
    setZoom(clamped);
  }

  useLayoutEffect(() => {
    const element = scroller.current;
    const box = track.current?.getBoundingClientRect();
    const at = anchor.current;
    anchor.current = null;
    if (!element || !box || !at) return;
    const x = box.left + ((at.minute - range.start) / span) * box.width;
    element.scrollLeft += x - at.x;
  }, [zoom, tracksWidth, range.start, span]);

  // Ctrl or Cmd with the wheel zooms at the pointer; the page itself mustn't zoom.
  const wheelZoom = useRef<(event: WheelEvent) => void>(() => {});
  useLayoutEffect(() => {
    wheelZoom.current = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = track.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const minute = range.start + ((event.clientX - box.left) / box.width) * span;
      zoomTo(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), { minute, x: event.clientX });
    };
  });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const listener = (event: WheelEvent) => wheelZoom.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);
  const clampView = (m: number) => Math.min(Math.max(m, range.start), range.end);
  const clampDay = (m: number) => Math.min(Math.max(m, start), end);
  const pct = (m: number) => `${((clampView(m) - range.start) / span) * 100}%`;
  const width = (from: number, to: number) => `${((clampView(to) - clampView(from)) / span) * 100}%`;
  const now = clampDay(playhead ?? start);
  const finish = local(schedule?.finish ?? null);
  const worstFinish = local(schedule?.worstFinish ?? null);
  // The worst case takes the plan's fit status (running past closing in the worst
  // case is what "tight" means), and is red when matches run past closing as estimated.
  const pastClosing = (schedule?.late ?? 0) > 0;
  const worstTone: Tone =
    fit === "doesNotFit" || pastClosing ? "bad" : fit === "fitsTypicalOnly" ? "tight" : "fits";
  const hallIndex = new Map(draft.frame.halls.map((h, i) => [h.id, i]));
  const hallLabel = (id: string) => hallName(draft.frame.halls[hallIndex.get(id)!]!, hallIndex.get(id)!);
  const courtHall = new Map(draft.frame.halls.flatMap((h) => h.courts.map((c) => [c.id, h.id] as const)));
  const courtOrder = draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id));
  const byCourt = new Map<string, LocalSegment[]>();
  for (const s of [...segments].sort((a, b) => a.from - b.from)) {
    byCourt.set(s.courtId, [...(byCourt.get(s.courtId) ?? []), s]);
  }
  const courtLabelOf = (courtId: string) => {
    const h = hallIndex.get(courtHall.get(courtId) ?? "") ?? 0;
    const c = draft.frame.halls[h]?.courts.findIndex((x) => x.id === courtId) ?? 0;
    return `Court ${courtNumber(draft.frame.halls, h, Math.max(0, c))}`;
  };

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

  /** Frame the matches: the first start to the worst case or the buffer's end. */
  function fitPlay() {
    if (segments.length === 0 || viewWidth === 0) return;
    if (scroller.current && labels.current) setViewWidth(roomFor(scroller.current, labels.current));
    const from = Math.min(...segments.map((s) => s.from)) - FIT_MARGIN;
    const to =
      Math.max(...segments.map((s) => s.to), worstFinish ?? 0, bufferWindow?.to ?? 0) + FIT_MARGIN;
    const next = Math.min(Math.max(span / Math.max(1, to - from), 1), maxZoom);
    // Once the tracks have their new width, the first match's start sits at the left edge.
    const at = { minute: Math.max(from, range.start), x: viewLeft() };
    if (next !== zoom) {
      anchor.current = at;
      setZoom(next);
      return;
    }
    const box = track.current?.getBoundingClientRect();
    if (box && scroller.current) scroller.current.scrollLeft += box.left + ((at.minute - range.start) / span) * box.width - at.x;
  }

  function wholeDay() {
    anchor.current = null;
    setZoom(1);
    if (scroller.current) scroller.current.scrollLeft = 0;
  }

  // Playing while zoomed in: keep the playhead in view.
  useEffect(() => {
    const element = scroller.current;
    if (!playing || zoom === 1 || !element || playhead === null) return;
    const x = ((Math.min(Math.max(playhead, range.start), range.end) - range.start) / span) * viewWidth * zoom;
    if (x < element.scrollLeft || x > element.scrollLeft + viewWidth) element.scrollLeft = Math.max(0, x - viewWidth * 0.2);
  }, [playing, playhead, zoom, viewWidth, range.start, range.end, span]);

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

  /** Minutes per pixel on the tracks. */
  const minutesPerPx = () => span / Math.max(1, track.current?.getBoundingClientRect().width ?? 1);

  function waitText(wait: Wait | undefined): string | null {
    if (!wait) return null;
    if (wait.type === "feeder") return `Waits for ${knockoutName(wait.code)}`;
    if (wait.type === "group") return `Waits for Group ${wait.group} to finish`;
    if (wait.type === "zone") return `Waits for its zone to start at ${clock(local(wait.until)!)}`;
    return `${wait.side} is playing on ${courtLabelOf(wait.courtId)} until ${clock(local(wait.until)!)}`;
  }

  /** The hover card's lines for a match on a court. */
  function cardLines(s: LocalSegment): string[] {
    const { where, sides, rubber } = matchText(draft, s.match);
    const wait = waitText(s.wait);
    return [
      `${categoryName(draft, s.match.categoryId)} · ${where}`,
      sides,
      ...(rubber ? [rubber] : []),
      `${courtLabelOf(s.courtId)} · ${clock(s.from)}–${clock(s.to)}`,
      ...(wait ? [wait] : []),
      ...(s.late ? [`Runs past ${courtLabelOf(s.courtId)}'s hours`] : []),
      ...(s.moved ? ["Moved by hand · double-click to put it back"] : []),
    ];
  }

  /** What a screen reader hears on a match: where and when, who plays, the rubber, and why it waits. */
  function pillLabel(s: LocalSegment, courtLabel: string, index: number, count: number): string {
    const { where, sides, rubber } = matchText(draft, s.match);
    const wait = waitText(s.wait);
    return [
      `${courtLabel}, ${clock(s.from)}–${clock(s.to)}`,
      `${categoryName(draft, s.match.categoryId)} · ${where}`,
      sides,
      rubber,
      wait,
      s.late ? `runs past ${courtLabel}'s hours` : null,
      s.moved ? "moved by hand" : null,
      `match ${index + 1} of ${count} on this court`,
    ]
      .filter(Boolean)
      .join(", ")
      .concat(". Arrow keys go between matches; Alt and the arrow keys move it.");
  }

  // ----- Matches: drag onto a court of the same hall, inside its stage's zone.

  /** The zone a match may be dropped in, for a hall. */
  const zoneFor = (hallId: string, stage: Stage) => zones.find((z) => z.hallId === hallId && z.zone === zoneOf(stage));

  /** Where a match would land at a point on screen, or why it can't. */
  function landing(segment: LocalSegment, x: number, y: number): Pick<PillDrag, "target" | "refusal"> {
    const fromHall = courtHall.get(segment.courtId)!;
    const row = document
      .elementsFromPoint(x, y)
      .map((e) => (e as HTMLElement).closest<HTMLElement>("[data-court-id]"))
      .find(Boolean);
    if (!row) return { target: null, refusal: null };
    const courtId = row.dataset.courtId!;
    const hallId = courtHall.get(courtId)!;
    const zone = zoneFor(hallId, segment.stage);
    const stageName = ZONE_NAMES[zoneOf(segment.stage)];
    if (hallId !== fromHall && segment.stage === "group") {
      return { target: null, refusal: `Stays in ${hallLabel(fromHall)}'s ${stageName}` };
    }
    if (!zone) return { target: null, refusal: `Stays in the ${stageName}` };
    const box = row.getBoundingClientRect();
    const minute = range.start + ((x - box.left) / Math.max(1, box.width)) * span;
    if (minute < zone.window.from - GRID_MINUTES || minute > zone.window.to + GRID_MINUTES) {
      return { target: null, refusal: `Stays in the ${stageName}` };
    }
    const others = segments
      .filter((s) => s.courtId === courtId && s.id !== segment.id)
      .sort((a, b) => a.from - b.from);
    const next = others.find((s) => (s.from + s.to) / 2 > minute);
    return { target: { courtId, before: next?.id ?? null }, refusal: null };
  }

  function moveMatch(segment: LocalSegment, target: { courtId: string; before: string | null }) {
    // Dropped where it already is: nothing to do.
    const own = segments.filter((s) => s.courtId === segment.courtId).sort((a, b) => a.from - b.from);
    const at = own.findIndex((s) => s.id === segment.id);
    if (target.courtId === segment.courtId && (target.before === own[at + 1]?.id || (target.before === null && at === own.length - 1))) {
      return;
    }
    update((d) => void (d.matchMoves[segment.id] = target));
  }

  function resetMatch(segment: LocalSegment) {
    update((d) => void delete d.matchMoves[segment.id]);
  }

  function focusPill(id: string) {
    document.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(id)}"]`)?.focus();
  }

  /** Arrow keys go between matches: along a court, or to the nearest in time on the court above or below. */
  function pillNavigate(event: KeyboardEvent<HTMLElement>, segment: LocalSegment) {
    const own = byCourt.get(segment.courtId) ?? [];
    const at = own.findIndex((s) => s.id === segment.id);
    let next: LocalSegment | undefined;
    if (event.key === "ArrowLeft") next = own[at - 1];
    if (event.key === "ArrowRight") next = own[at + 1];
    if (event.key === "Home") next = own[0];
    if (event.key === "End") next = own.at(-1);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const step = event.key === "ArrowUp" ? -1 : 1;
      for (let c = courtOrder.indexOf(segment.courtId) + step; c >= 0 && c < courtOrder.length; c += step) {
        const there = byCourt.get(courtOrder[c]!) ?? [];
        if (there.length === 0) continue;
        next = there.reduce((a, b) => (Math.abs(b.from - segment.from) < Math.abs(a.from - segment.from) ? b : a));
        break;
      }
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (next) focusPill(next.id);
  }

  function pillKeys(event: KeyboardEvent<HTMLElement>, segment: LocalSegment) {
    if ((event.key === "h" || event.key === "H") && segment.moved) {
      event.preventDefault();
      resetMatch(segment);
      return;
    }
    if (!event.altKey) {
      pillNavigate(event, segment);
      return;
    }
    const own = segments.filter((s) => s.courtId === segment.courtId).sort((a, b) => a.from - b.from);
    const at = own.findIndex((s) => s.id === segment.id);
    const hallId = courtHall.get(segment.courtId)!;
    const courts = draft.frame.halls[hallIndex.get(hallId)!]!.courts.map((c) => c.id);
    const c = courts.indexOf(segment.courtId);
    let target: { courtId: string; before: string | null } | null = null;
    if (event.key === "ArrowLeft" && at > 0) target = { courtId: segment.courtId, before: own[at - 1]!.id };
    if (event.key === "ArrowRight" && at < own.length - 1) {
      target = { courtId: segment.courtId, before: own[at + 2]?.id ?? null };
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && courts.length > 1) {
      const to = courts[(c + (event.key === "ArrowUp" ? -1 : 1) + courts.length) % courts.length]!;
      const there = segments.filter((s) => s.courtId === to).sort((a, b) => a.from - b.from);
      target = { courtId: to, before: there.find((s) => s.from >= segment.from)?.id ?? null };
    }
    if (target) {
      event.preventDefault();
      refocus.current = segment.id;
      moveMatch(segment, target);
    }
  }

  // After a keyboard move the match may be drawn on another court: give it the focus back.
  useEffect(() => {
    const id = refocus.current;
    refocus.current = null;
    if (id) focusPill(id);
  }, [segments]);

  // ----- Zones: drag along the timeline (free time) or onto another hall's Stages row.

  function zoneTarget(x: number, y: number): string | null {
    const row = document
      .elementsFromPoint(x, y)
      .map((e) => (e as HTMLElement).closest<HTMLElement>("[data-hall-stages]"))
      .find(Boolean);
    return row?.dataset.hallStages ?? null;
  }

  function dropZone(drag: ZoneDrag) {
    const { row } = drag;
    if (drag.targetHall !== row.hallId) {
      update((d) => moveZone(d, row.hallId, drag.targetHall, row.zone));
      return;
    }
    if (drag.delta === 0) return;
    const startAt = Math.round((row.window.from + drag.delta) / GRID_MINUTES) * GRID_MINUTES;
    update((d) => shiftZone(d, row.hallId, row.zone, clock(Math.max(0, startAt))));
  }

  function zoneKeys(event: KeyboardEvent<HTMLElement>, row: ZoneRow) {
    if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      update((d) => resetZone(d, row.hallId, row.zone));
      return;
    }
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const halls = draft.frame.halls.map((h) => h.id);
      const i = halls.indexOf(row.hallId);
      const to = halls[i + (event.key === "ArrowUp" ? -1 : 1)];
      if (to) {
        event.preventDefault();
        update((d) => moveZone(d, row.hallId, to, row.zone));
      }
      return;
    }
    const delta = { ArrowLeft: -GRID_MINUTES, ArrowRight: GRID_MINUTES }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    update((d) => shiftZone(d, row.hallId, row.zone, clock(Math.max(0, row.window.from + delta))));
  }

  const usedStages = (["group", "knockout", "bronze", "final"] as const).filter((s) =>
    segments.some((x) => x.stage === s),
  );
  const anyMoves = hasMoves(draft);

  return (
    <section aria-label="Timeline" className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2">
        <h2 className="heading-card flex items-center gap-2 text-xl">
            Timeline
            <InfoTip about="the timeline">
              Each hall has its hours and rate bands, a Stages row showing where its group and KO stages fall, and a
              row per court. Drag a hall&apos;s window to set its hours, the lines between bands to move them, and a
              court&apos;s bar to narrow it. Moved matches keep knockout order, and nobody plays twice at once.{" "}
              {schedule
                ? "Times are an estimate at typical length; rest isn't modelled yet."
                : "Complete the plan to see the estimated schedule."}
            </InfoTip>
        </h2>
          <span className="flex items-center gap-2">
            {anyMoves ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update((d) => {
                    d.matchMoves = {};
                    d.zoneMoves = {};
                  })
                }
              >
                <ArrowCounterClockwiseIcon /> Reset all moves
              </Button>
            ) : null}
            <span className="flex items-center" role="group" aria-label="Zoom">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={zoom <= 1}
                onClick={() => zoomTo(zoom / ZOOM_STEP)}
              >
                <MagnifyingGlassMinusIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={!hasHours || zoom >= maxZoom}
                onClick={() => zoomTo(zoom * ZOOM_STEP)}
              >
                <MagnifyingGlassPlusIcon />
              </Button>
              <Button variant="ghost" size="sm" disabled={segments.length === 0} onClick={fitPlay}>
                <ArrowsInLineHorizontalIcon /> Fit play
              </Button>
              <Button variant="ghost" size="sm" disabled={zoom === 1} onClick={wholeDay}>
                <ArrowsOutLineHorizontalIcon /> Whole day
              </Button>
            </span>
            <span className="font-display text-sm tabular-nums">{clock(Math.round(now))}</span>
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
      </div>
      <div className="flex shrink-0 flex-col gap-1 px-4 pt-2 empty:hidden">
        {schedule && schedule.late > 0 ? (
          <p className="text-sm text-over-text">
            {schedule.late} {schedule.late === 1 ? "match runs" : "matches run"} past their court&apos;s hours (outlined in
            red).
          </p>
        ) : null}
        {schedule && schedule.unplaced > 0 ? (
          <p className="text-sm text-over-text">
            {schedule.unplaced} {schedule.unplaced === 1 ? "match has" : "matches have"} no court to play on.
          </p>
        ) : null}
        {notice ? <p className="text-sm text-over-text">{notice}</p> : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto [overflow-anchor:none]">
        <div className="flex w-max min-w-full pr-4 pb-3">
          {/* Labels, row for row with the tracks; they stay put while the tracks scroll sideways. */}
          <div ref={labels} className="sticky left-0 z-40 flex w-29 shrink-0 flex-col bg-card pr-3 pl-4" aria-hidden="true">
            <div className="sticky top-0 z-10 h-7 bg-card" />
            {draft.frame.halls.map((hall, h) => (
              <div key={hall.id} className="flex flex-col gap-1 pt-3">
                <div className="h-6 truncate text-sm leading-6 font-medium">{hallName(hall, h)}</div>
                {schedule ? <div className="h-5 text-xs leading-5 font-medium">Stages</div> : null}
                {hall.courts.map((court, c) => (
                  <div key={court.id} className="h-5 truncate text-xs leading-5 text-muted-foreground tabular-nums">
                    Court {courtNumber(draft.frame.halls, h, c)}
                    {groupsOn(court.id) ? <span className="font-semibold text-foreground"> · {groupsOn(court.id)}</span> : null}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-3 h-5 text-xs leading-5 font-medium">Buffer</div>
          </div>

          <div
            className={`relative ${tracksWidth ? "shrink-0" : "min-w-0 flex-1"}`}
            style={tracksWidth ? { width: tracksWidth } : undefined}
          >
            {/* The axis is also the seek bar; it stays in view while the rows scroll. */}
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
              className="sticky top-0 z-[35] h-7 cursor-ew-resize touch-none border-b bg-card outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ticks.map((m) => (
                <span
                  key={m}
                  // Labels at the ends sit inside the axis rather than half under the row labels.
                  className={`absolute bottom-1 text-xs text-muted-foreground tabular-nums ${
                    m <= range.start ? "pl-1" : m >= range.end ? "-translate-x-full pr-1" : "-translate-x-1/2"
                  }`}
                  style={{ left: pct(m) }}
                >
                  {clock(m)}
                </span>
              ))}
              {hasHours ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 size-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 bg-tl-now"
                  style={{ left: pct(now) }}
                />
              ) : null}
            </div>

            {draft.frame.halls.map((hall, h) => {
              const open = minutesOfDay(hall.from);
              const close = minutesOfDay(hall.to);
              const hallBounds = open !== null && close !== null && close > open ? { min: open, max: close } : null;
              const hallZones = zones.filter((z) => z.hallId === hall.id);
              const dropHere = zoneDrag && zoneDrag.targetHall === hall.id && zoneDrag.row.hallId !== hall.id;
              return (
                <div key={hall.id} role="group" aria-label={hallName(hall, h)} className="flex flex-col gap-1 pt-3">
                  <HallTrack draft={draft} hallIndex={h} update={update} className="h-6" />

                  {schedule ? (
                    <div
                      data-hall-stages={hall.id}
                      role="group"
                      aria-label={`${hallName(hall, h)} stages`}
                      className={`relative h-5 rounded-sm ${dropHere ? "bg-foreground/10 ring-1 ring-foreground/40" : ""}`}
                    >
                      {hallZones.map((z) => {
                        const dragging = zoneDrag?.row.key === z.key ? zoneDrag : null;
                        const shift = dragging && dragging.targetHall === hall.id ? dragging.delta : 0;
                        const from = z.window.from + shift;
                        const to = z.window.to + shift;
                        return (
                          <span
                            key={z.key}
                            role="button"
                            tabIndex={0}
                            aria-label={`${z.label}, ${clock(z.window.from)}–${clock(z.window.to)}${z.moved ? ", moved" : ""}. Drag along the timeline to leave free time, or onto another hall.`}
                            className={`absolute inset-y-0 flex cursor-grab items-center gap-1 truncate rounded-sm px-2 text-xs font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing ${ZONE_SHADING[z.zone]} ${
                              z.earliest !== null || z.late > 0 ? "text-over-text ring-1 ring-destructive" : ""
                            } ${dragging && dragging.targetHall !== hall.id ? "opacity-40" : ""}`}
                            style={{ left: pct(from), width: width(from, to) }}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setDragging(true);
                              setZoneDrag({ row: z, startX: e.clientX, delta: 0, targetHall: hall.id });
                            }}
                            onPointerMove={(e) => {
                              if (!zoneDrag || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                              const minutes = (e.clientX - zoneDrag.startX) * minutesPerPx();
                              setZoneDrag({
                                ...zoneDrag,
                                delta: Math.round(minutes / GRID_MINUTES) * GRID_MINUTES,
                                targetHall: zoneTarget(e.clientX, e.clientY) ?? zoneDrag.row.hallId,
                              });
                            }}
                            onPointerUp={() => {
                              if (zoneDrag) dropZone(zoneDrag);
                              setZoneDrag(null);
                              setDragging(false);
                            }}
                            onPointerCancel={() => {
                              setZoneDrag(null);
                              setDragging(false);
                            }}
                            onDoubleClick={() => update((d) => resetZone(d, z.hallId, z.zone))}
                            onKeyDown={(e) => zoneKeys(e, z)}
                          >
                            {z.moved ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-foreground" /> : null}
                            <span className="truncate">{z.label}</span>
                          </span>
                        );
                      })}
                      {hallZones.map((z) =>
                        z.late > 0 && z.earliest === null ? (
                          <span
                            key={`${z.key}-late`}
                            className="pointer-events-none absolute inset-y-0 border-l-2 border-destructive"
                            style={{ left: pct(z.window.to) }}
                          >
                            <span className="absolute -top-0.5 left-1 rounded-sm bg-over-strong px-1 text-xs leading-4 whitespace-nowrap text-destructive-foreground">
                              Runs until {clock(z.window.to)}
                            </span>
                          </span>
                        ) : null,
                      )}
                      {hallZones.map((z) =>
                        z.earliest !== null ? (
                          <span
                            key={`${z.key}-earliest`}
                            className="pointer-events-none absolute inset-y-0 border-l-2 border-destructive"
                            style={{ left: pct(z.earliest) }}
                          >
                            <span className="absolute -top-0.5 left-1 rounded-sm bg-over-strong px-1 text-xs leading-4 whitespace-nowrap text-destructive-foreground">
                              Can&apos;t start before {clock(z.earliest)}
                            </span>
                          </span>
                        ) : null,
                      )}
                    </div>
                  ) : null}

                  {hall.courts.map((court, c) => {
                    const hours = courtHours(hall, court);
                    const from = minutesOfDay(hours.from);
                    const to = minutesOfDay(hours.to);
                    const narrowed = court.from !== null || court.to !== null;
                    const courtLabel = `Court ${courtNumber(draft.frame.halls, h, c)}`;
                    const target = pillDrag?.target?.courtId === court.id;
                    const allowed =
                      pillDrag &&
                      (pillDrag.segment.stage === "group" ? hall.id === pillDrag.hallId : Boolean(zoneFor(hall.id, pillDrag.segment.stage)));
                    const setCourt = (w: { from: number; to: number }) =>
                      update((d) => {
                        const courtDraft = d.frame.halls[h]!.courts[c]!;
                        const follows = w.from === open && w.to === close;
                        courtDraft.from = follows ? null : clock(w.from);
                        courtDraft.to = follows ? null : clock(w.to);
                      });
                    return (
                      <div
                        key={court.id}
                        data-court-id={court.id}
                        className={`rounded-sm transition-opacity ${pillDrag && !allowed ? "opacity-40" : ""} ${target ? "ring-1 ring-foreground/60" : ""}`}
                      >
                        <TimeWindowTrack
                          name={courtLabel}
                          window={hallBounds && from !== null && to !== null && to > from ? { from, to } : null}
                          unit={hall.unitMinutes}
                          origin={open}
                          bounds={hallBounds ?? undefined}
                          className="h-5"
                          windowClassName={narrowed ? "bg-accent" : "bg-inset"}
                          onChange={setCourt}
                          onReset={
                            narrowed
                              ? () =>
                                  update((d) => {
                                    const courtDraft = d.frame.halls[h]!.courts[c]!;
                                    courtDraft.from = null;
                                    courtDraft.to = null;
                                  })
                              : undefined
                          }
                          background={hall.bands.map((band, b) => {
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
                          overlay={
                            <>
                              {/* The hall's stage zones, shaded behind the matches. */}
                              {hallZones.map((z) => (
                                <span
                                  key={z.key}
                                  aria-hidden="true"
                                  className={`absolute -inset-y-0.5 ${ZONE_SHADING[z.zone]}`}
                                  style={{ left: pct(z.window.from), width: width(z.window.from, z.window.to) }}
                                />
                              ))}
                              {(byCourt.get(court.id) ?? []).map((s, i, own) => (
                                  <span
                                    key={s.id}
                                    data-segment-id={s.id}
                                    tabIndex={
                                      s.id === (own.some((x) => x.id === activePill[court.id]) ? activePill[court.id] : own[0]!.id)
                                        ? 0
                                        : -1
                                    }
                                    role="button"
                                    aria-label={pillLabel(s, courtLabel, i, own.length)}
                                    className={`pointer-events-auto absolute inset-y-0.5 cursor-grab touch-none rounded-[3px] border-r border-card outline-none ring-inset select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing ${STAGE_COLOURS[s.stage]} ${
                                      s.late ? "ring-2 ring-tl-worst" : "ring-1 ring-tl-outline"
                                    } ${
                                      pillDrag?.segment.id === s.id ? "opacity-30" : ""
                                    }`}
                                    style={{ left: pct(s.from), width: width(s.from, s.to) }}
                                    onPointerDown={(e) => {
                                      if (e.button !== 0) return;
                                      e.currentTarget.setPointerCapture(e.pointerId);
                                      setHovered(null);
                                      setPillDrag({
                                        segment: s,
                                        hallId: hall.id,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                        x: e.clientX,
                                        y: e.clientY,
                                        target: null,
                                        refusal: null,
                                      });
                                    }}
                                    onPointerMove={(e) => {
                                      if (pillDrag && e.currentTarget.hasPointerCapture(e.pointerId)) {
                                        setPillDrag({ ...pillDrag, x: e.clientX, y: e.clientY, ...landing(s, e.clientX, e.clientY) });
                                        return;
                                      }
                                      setHovered({ x: e.clientX, y: e.clientY, lines: cardLines(s) });
                                    }}
                                    onPointerUp={() => {
                                      // A press without a drag is a click: nothing moves.
                                      const dragged =
                                        pillDrag && Math.hypot(pillDrag.x - pillDrag.startX, pillDrag.y - pillDrag.startY) > 4;
                                      if (pillDrag && dragged) {
                                        if (pillDrag.target) moveMatch(s, pillDrag.target);
                                        else if (pillDrag.refusal) setNotice(pillDrag.refusal);
                                      }
                                      setPillDrag(null);
                                    }}
                                    onPointerCancel={() => setPillDrag(null)}
                                    onPointerLeave={() => setHovered(null)}
                                    onFocus={(e) => {
                                      setActivePill((active) =>
                                        active[court.id] === s.id ? active : { ...active, [court.id]: s.id },
                                      );
                                      const box = e.currentTarget.getBoundingClientRect();
                                      setHovered({ x: box.left, y: box.bottom, lines: cardLines(s) });
                                    }}
                                    onBlur={() => setHovered(null)}
                                    onDoubleClick={() => (s.moved ? resetMatch(s) : undefined)}
                                    onKeyDown={(e) => pillKeys(e, s)}
                                  >
                                    {s.moved ? (
                                      <span aria-hidden="true" className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-background ring-1 ring-foreground" />
                                    ) : null}
                                  </span>
                                ))}
                            </>
                          }
                        />
                      </div>
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
                className={`pointer-events-none absolute top-7 bottom-0 z-20 border-l-2 border-dashed ${WORST_TONES[worstTone].line}`}
                style={{ left: pct(worstFinish) }}
              >
                <span
                  className={`absolute top-0 rounded-sm px-1 text-xs leading-4 whitespace-nowrap ${WORST_TONES[worstTone].label} ${
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
                className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-tl-now"
                style={{ left: pct(now) }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
          {usedStages.map((stage) => (
            <span key={stage} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-sm ${STAGE_COLOURS[stage]}`} aria-hidden="true" />
              {STAGE_LABELS[stage]}
            </span>
          ))}
          {zones.length > 0 ? (
            <>
              <span className="flex items-center gap-2">
                <span className="zone-group size-2.5 rounded-sm ring-1 ring-foreground/30" aria-hidden="true" />
                Group stage zone
              </span>
              <span className="flex items-center gap-2">
                <span className="zone-ko size-2.5 rounded-sm ring-1 ring-foreground/30" aria-hidden="true" />
                KO stage zone
              </span>
            </>
          ) : null}
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm bg-muted ring-1 ring-foreground/30" aria-hidden="true" />
            Court available
          </span>
          <span className="flex items-center gap-2">
            <span className="hatch size-2.5 rounded-sm ring-1 ring-foreground/20" aria-hidden="true" />
            Buffer{pinnedAt !== null ? ` (pinned at ${clock(pinnedAt)})` : ""}
          </span>
          {worstFinish !== null ? (
            <span className="flex items-center gap-2">
              <span className={`h-2.5 border-l-2 border-dashed ${WORST_TONES[worstTone].line}`} aria-hidden="true" />
              Worst-case finish
            </span>
          ) : null}
          {anyMoves ? (
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />
              Moved by hand
            </span>
          ) : null}
          {segments.length > 0 ? (
            <span className="basis-full">
              Drag a match or zone to move it · Arrow keys go between matches · Alt and the arrows move the focused one
              · H or double-click puts it back · Ctrl or Cmd and scroll to zoom
            </span>
          ) : null}
        </div>

        {pillDrag ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed z-50 h-4 w-10 -translate-x-1/2 -translate-y-1/2 rounded-sm ring-2 ${
              pillDrag.target ? "ring-foreground" : "ring-destructive"
            } ${STAGE_COLOURS[pillDrag.segment.stage]}`}
            style={{ left: pillDrag.x, top: pillDrag.y }}
          />
        ) : null}
        {pillDrag?.refusal ? (
          <div
            role="status"
            className="pointer-events-none fixed z-50 rounded-md bg-over-strong px-2 py-1 text-xs text-destructive-foreground"
            style={{ left: pillDrag.x + 14, top: pillDrag.y + 10 }}
          >
            {pillDrag.refusal}
          </div>
        ) : null}

        {hovered && !pillDrag ? (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 flex w-72 flex-col gap-1 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg"
            // Kept on screen: flips to the left of the pointer near the right edge.
            style={{
              left: hovered.x + 300 > window.innerWidth ? Math.max(8, hovered.x - 300) : hovered.x + 12,
              top: hovered.y + 12,
            }}
          >
            {hovered.lines.map((line, i) => (
              <span key={i} className={i === 0 ? "font-semibold" : "tabular-nums"}>
                {line}
              </span>
            ))}
          </div>
        ) : null}
    </section>
  );
}
