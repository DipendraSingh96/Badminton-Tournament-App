import type { Analysis } from "./analyse";
import { available } from "./capacity";
import { knockoutRounds } from "./format";
import type { Stage, TournamentInputs, WindowKey } from "./types";

// A first estimate of the day, until the scheduler is built: matches placed
// in order on the first court that can start them, at a fixed slot length.
// Rest between matches isn't modelled.

/** Where a match sits in its stage: a group wave or a knockout round. */
export type Round = { type: "wave"; wave: number } | { type: "knockout"; size: number } | null;

export interface Segment {
  /** UTC ISO. */
  from: string;
  to: string;
  stage: Stage;
  round: Round;
  categoryId: string;
  /** Matches played back to back in the segment. */
  matches: number;
}

export interface CourtSchedule {
  hallId: string;
  courtId: string;
  segments: Segment[];
}

/** A window's span in the estimate, and how it sits against its pin. */
export interface WindowSpan {
  /** UTC ISO: the first match's start and the last match's end. */
  from: string;
  to: string;
  pinned?: { from: string; to: string };
  /** Pinned but too short: when its matches really end. */
  overrun?: string;
  /** Pinned to start before what it depends on has finished: when that is. */
  earliest?: string;
}

export interface EstimatedSchedule {
  /** Every stage, wave and round played, keyed by its window key. */
  windows: Partial<Record<WindowKey, WindowSpan>>;
  courts: CourtSchedule[];
  /** First start and last end of each stage played. */
  stages: Partial<Record<Stage, { from: string; to: string }>>;
  /** When the last match ends at typical length; null when nothing is placed. */
  finish: string | null;
  /** The same, every match at worst-case length. */
  worstFinish: string | null;
  /** Matches that fit on no court in the playing time. */
  unplaced: number;
}

interface Match {
  stage: Stage;
  round: Round;
  categoryId: string;
  /** Earliest start: when what it depends on has finished, in ms. */
  release: number;
}

interface Placed extends Match {
  court: number;
  from: number;
  to: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Places every match in play order. Each step's matches are released when
 * what they depend on has finished:
 * - group waves in order, all from the start of the day (rest isn't modelled);
 * - a category's knockout rounds once its group stage is over, each round
 *   after the one before;
 * - the bronze match and final after the semi-finals (or the group stage).
 * Categories are interleaved within each step so they progress side by side.
 */
function place(
  inputs: TournamentInputs,
  analysis: Analysis,
  length: "typical" | "worst",
): { placed: Placed[]; unplaced: number; dependsOn: Map<WindowKey, number> } {
  // Pinned windows hold back what they contain until their start.
  const pins = new Map((inputs.stageWindows ?? []).map((w) => [w.key, Date.parse(w.from)]));
  const pinned = (...keys: WindowKey[]) => Math.max(-Infinity, ...keys.map((k) => pins.get(k) ?? -Infinity));
  /** For each window, when what it depends on has finished. */
  const dependsOn = new Map<WindowKey, number>();
  const depends = (key: WindowKey, at: number) => dependsOn.set(key, Math.max(dependsOn.get(key) ?? -Infinity, at));
  const courts = available(inputs.frame).courts.map((c) => ({
    ...c,
    start: Date.parse(c.from),
    end: Date.parse(c.to),
  }));
  const freeAt = courts.map((c) => c.start);
  const dayStart = Date.parse(available(inputs.frame).start);
  const slot = new Map(analysis.slots.map((s) => [s.stage, s.minutes[length] * MS_PER_MINUTE]));

  const placed: Placed[] = [];
  let unplaced = 0;

  function put(match: Match): number | null {
    const minutes = slot.get(match.stage);
    if (minutes === undefined) return null;
    let best = -1;
    let bestStart = Infinity;
    courts.forEach((court, i) => {
      const start = Math.max(freeAt[i]!, match.release, court.start);
      if (start + minutes <= court.end && start < bestStart) {
        best = i;
        bestStart = start;
      }
    });
    if (best === -1) {
      unplaced += 1;
      return null;
    }
    freeAt[best] = bestStart + minutes;
    placed.push({ ...match, court: best, from: bestStart, to: bestStart + minutes });
    return bestStart + minutes;
  }

  /** Places a step's matches, category by category in turn, and returns each category's last end. */
  function step(items: { categoryId: string; count: number; stage: Stage; round: Round; release: number }[]) {
    const ends = new Map<string, number>();
    const left = items.map((item) => item.count);
    let remaining = left.reduce((sum, n) => sum + n, 0);
    while (remaining > 0) {
      items.forEach((item, i) => {
        if (left[i]! === 0) return;
        left[i]! -= 1;
        remaining -= 1;
        const end = put({ stage: item.stage, round: item.round, categoryId: item.categoryId, release: item.release });
        ends.set(item.categoryId, Math.max(ends.get(item.categoryId) ?? item.release, end ?? item.release));
      });
    }
    return ends;
  }

  const categories = analysis.categories;
  /** When each category is ready for its next step. */
  const ready = new Map(categories.map((c) => [c.categoryId, dayStart]));

  const waves = Math.max(0, ...categories.map((c) => c.waves.waves));
  for (let w = 0; w < waves; w++) {
    const ends = step(
      categories
        .filter((c) => w < c.waves.waves)
        .map((c) => ({
          categoryId: c.categoryId,
          count: c.waves.fixturesPerWave[w]! * c.rubbersPerFixture,
          stage: "group" as const,
          round: { type: "wave" as const, wave: w + 1 },
          release: Math.max(dayStart, pinned("group", `wave:${w + 1}`)),
        })),
    );
    // A category's knockout waits for its own group stage.
    for (const [id, end] of ends) ready.set(id, Math.max(ready.get(id)!, end));
  }

  const rounds = new Map(categories.map((c) => [c.categoryId, knockoutRounds(c.format.qualifiers)]));
  const levels = Math.max(0, ...[...rounds.values()].map((r) => r.length));
  for (let level = levels; level >= 1; level--) {
    // Levels count back from the semi-finals so categories' rounds line up.
    const ends = step(
      categories.flatMap((c) => {
        const own = rounds.get(c.categoryId)!;
        const round = own[own.length - level];
        if (!round || c.matches.knockout === 0) return [];
        const after = ready.get(c.categoryId)!;
        depends(`round:${round.size}`, after);
        // The knockout window depends on each category's first round.
        if (own.length - level === 0) depends("knockout", after);
        return [
          {
            categoryId: c.categoryId,
            count: round.matches * c.rubbersPerFixture,
            stage: "knockout" as const,
            round: { type: "knockout" as const, size: round.size },
            release: Math.max(after, pinned("knockout", `round:${round.size}`)),
          },
        ];
      }),
    );
    for (const [id, end] of ends) ready.set(id, end);
  }

  step(
    categories.flatMap((c) =>
      (["bronze", "final"] as const)
        .filter((stage) => c.matches[stage] > 0)
        .map((stage) => {
          depends(stage, ready.get(c.categoryId)!);
          return {
            categoryId: c.categoryId,
            count: c.matches[stage],
            stage,
            round: null,
            release: Math.max(ready.get(c.categoryId)!, pinned(stage)),
          };
        }),
    ),
  );

  return { placed, unplaced, dependsOn };
}

/** The window keys a match belongs to: its stage and its wave or round. */
function keysOf(match: Match): WindowKey[] {
  const keys: WindowKey[] = [match.stage];
  if (match.round?.type === "wave") keys.push(`wave:${match.round.wave}`);
  if (match.round?.type === "knockout") keys.push(`round:${match.round.size}`);
  return keys;
}

function sameRound(a: Round, b: Round): boolean {
  if (a === null || b === null) return a === b;
  if (a.type === "wave" && b.type === "wave") return a.wave === b.wave;
  if (a.type === "knockout" && b.type === "knockout") return a.size === b.size;
  return false;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** An estimated day for a complete plan: per court, what is played when. */
export function estimateSchedule(inputs: TournamentInputs, analysis: Analysis): EstimatedSchedule {
  const courts = available(inputs.frame).courts;
  const typical = place(inputs, analysis, "typical");
  const worst = place(inputs, analysis, "worst");

  const schedules: CourtSchedule[] = courts.map((c) => ({ hallId: c.hallId, courtId: c.courtId, segments: [] }));
  const byCourt = [...typical.placed].sort((a, b) => a.court - b.court || a.from - b.from);
  for (const match of byCourt) {
    const segments = schedules[match.court]!.segments;
    const last = segments.at(-1);
    if (
      last &&
      Date.parse(last.to) === match.from &&
      last.stage === match.stage &&
      last.categoryId === match.categoryId &&
      sameRound(last.round, match.round)
    ) {
      last.to = iso(match.to);
      last.matches += 1;
    } else {
      segments.push({
        from: iso(match.from),
        to: iso(match.to),
        stage: match.stage,
        round: match.round,
        categoryId: match.categoryId,
        matches: 1,
      });
    }
  }

  const stages: EstimatedSchedule["stages"] = {};
  for (const match of typical.placed) {
    const current = stages[match.stage];
    stages[match.stage] = {
      from: iso(Math.min(match.from, current ? Date.parse(current.from) : Infinity)),
      to: iso(Math.max(match.to, current ? Date.parse(current.to) : -Infinity)),
    };
  }

  // Each window's span, checked against its pin.
  const spans = new Map<WindowKey, { from: number; to: number }>();
  for (const match of typical.placed) {
    for (const key of keysOf(match)) {
      const span = spans.get(key);
      spans.set(key, { from: Math.min(match.from, span?.from ?? Infinity), to: Math.max(match.to, span?.to ?? -Infinity) });
    }
  }
  const windows: EstimatedSchedule["windows"] = {};
  const pins = new Map((inputs.stageWindows ?? []).map((w) => [w.key, w]));
  for (const [key, span] of spans) {
    const pin = pins.get(key);
    const window: WindowSpan = { from: iso(span.from), to: iso(span.to) };
    if (pin) {
      window.pinned = { from: pin.from, to: pin.to };
      if (span.to > Date.parse(pin.to)) window.overrun = iso(span.to);
      const after = typical.dependsOn.get(key);
      if (after !== undefined && after > Date.parse(pin.from)) window.earliest = iso(after);
    }
    windows[key] = window;
  }

  const lastEnd = (placed: Placed[]) => (placed.length > 0 ? iso(Math.max(...placed.map((m) => m.to))) : null);
  return {
    windows,
    courts: schedules,
    stages,
    finish: lastEnd(typical.placed),
    worstFinish: lastEnd(worst.placed),
    unplaced: typical.unplaced,
  };
}
