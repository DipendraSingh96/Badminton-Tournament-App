import type { Analysis } from "./analyse";
import { available } from "./capacity";
import { knockoutRounds } from "./format";
import type { Stage, TournamentInputs } from "./types";

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

export interface EstimatedSchedule {
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
): { placed: Placed[]; unplaced: number } {
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
          release: dayStart,
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
        return [
          {
            categoryId: c.categoryId,
            count: round.matches * c.rubbersPerFixture,
            stage: "knockout" as const,
            round: { type: "knockout" as const, size: round.size },
            release: ready.get(c.categoryId)!,
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
        .map((stage) => ({
          categoryId: c.categoryId,
          count: c.matches[stage],
          stage,
          round: null,
          release: ready.get(c.categoryId)!,
        })),
    ),
  );

  return { placed, unplaced };
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

  const lastEnd = (placed: Placed[]) => (placed.length > 0 ? iso(Math.max(...placed.map((m) => m.to))) : null);
  return {
    courts: schedules,
    stages,
    finish: lastEnd(typical.placed),
    worstFinish: lastEnd(worst.placed),
    unplaced: typical.unplaced,
  };
}
