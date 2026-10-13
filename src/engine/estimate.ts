import type { Analysis } from "./analyse";
import { available } from "./capacity";
import { groupFixtures, groupLetter, knockoutBracket } from "./fixtures";
import type { EventType, Stage, TournamentInputs, WindowKey, Zone } from "./types";

// A first estimate of the day, until the scheduler is built: matches placed
// in order on the first court that can start them, at a fixed slot length.
// Groups play in their suggested hall; the knockout may use any hall. Rest
// between matches isn't modelled.

/** Where a match sits in its stage: a group wave or a knockout round. */
export type Round = { type: "wave"; wave: number } | { type: "knockout"; size: number } | null;

/** Everything needed to run one match: who plays, in what, and where it sits. */
export interface MatchInfo {
  categoryId: string;
  stage: Stage;
  /** Group stage: the group's letter and the wave. */
  group?: string;
  wave?: number;
  /** Knockout: the round's size (8 for quarter-finals) and the match code ("QF1", "Final", "Bronze"). */
  roundSize?: number;
  code?: string;
  /** Draw slots until entries exist: "A1", "Winner A", "Winner QF1". */
  home: string;
  away: string;
  /** Team ties: which rubber of how many, and its event. */
  rubber?: { number: number; of: number; event: EventType };
}

export interface Segment {
  /** UTC ISO. */
  from: string;
  to: string;
  stage: Stage;
  round: Round;
  categoryId: string;
  /** Matches played back to back in the segment. */
  matches: number;
  /** Each of those matches, in order. */
  details: { from: string; to: string; match: MatchInfo }[];
}

export interface CourtSchedule {
  hallId: string;
  courtId: string;
  segments: Segment[];
}

/** A hall's stage zone in the estimate, and how it sits against its pin. */
export interface WindowSpan {
  /** UTC ISO: the first match's start and the last match's end. */
  from: string;
  to: string;
  pinned?: { from: string; to: string };
  /** Pinned but too short: when its matches really end. */
  overrun?: string;
  /** Pinned to start before what it depends on has finished: when that is. */
  earliest?: string;
  /** Categories playing in the zone, in category order. */
  categoryIds: string[];
}

export interface EstimatedSchedule {
  /** Each hall's group and KO zones, keyed "hallId:group" or "hallId:knockout". */
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

/** The zone a stage is played in: the group stage, or the knockout with its bronze match and final. */
export function zoneOf(stage: Stage): Zone {
  return stage === "group" ? "group" : "knockout";
}

export function zoneKey(hallId: string, zone: Zone): WindowKey {
  return `${hallId}:${zone}`;
}

interface Match {
  info: MatchInfo;
  round: Round;
  /** When what it depends on has finished, in ms. */
  release: number;
  /** A group plays in its hall; null for any hall. */
  hallId: string | null;
}

interface Placed extends Match {
  court: number;
  hallId: string;
  from: number;
  to: number;
}

const MS_PER_MINUTE = 60_000;

/** A category's rubbers in a tie, in line-up order; one plain match for individual entries. */
function rubbersOf(inputs: TournamentInputs, categoryId: string): MatchInfo["rubber"][] {
  const category = inputs.categories.find((c) => c.id === categoryId);
  if (!category || category.entry.type === "individual") return [undefined];
  const events = category.entry.lineUp.flatMap((item) => Array.from({ length: item.count }, () => item.event));
  return events.map((event, i) => ({ number: i + 1, of: events.length, event }));
}

/**
 * Places every match in play order. Each step's matches are released when
 * what they depend on has finished:
 * - group waves in order (a wave is a round of each group's draw), each
 *   group in its suggested hall;
 * - a category's knockout rounds once its group stage is over, each round
 *   after the one before;
 * - the bronze match and final after the semi-finals (or the group stage).
 * A pinned zone holds its hall's matches back until its start. Categories
 * are interleaved within each step so they progress side by side.
 */
function place(inputs: TournamentInputs, analysis: Analysis, length: "typical" | "worst") {
  const pins = new Map((inputs.stageWindows ?? []).map((w) => [w.key, Date.parse(w.from)]));
  const courts = available(inputs.frame).courts.map((c) => ({
    ...c,
    start: Date.parse(c.from),
    end: Date.parse(c.to),
  }));
  const freeAt = courts.map((c) => c.start);
  const dayStart = Date.parse(available(inputs.frame).start);
  const slot = new Map(analysis.slots.map((s) => [s.stage, s.minutes[length] * MS_PER_MINUTE]));
  const hallOfGroup = new Map<string, string>();
  for (const hall of analysis.groupsPerHall) {
    for (const g of hall.groups) hallOfGroup.set(`${g.categoryId}:${g.groupIndex}`, hall.hallId);
  }

  const placed: Placed[] = [];
  let unplaced = 0;

  function put(match: Match): number | null {
    const minutes = slot.get(match.info.stage);
    if (minutes === undefined) return null;
    const zone = zoneOf(match.info.stage);
    let best = -1;
    let bestStart = Infinity;
    courts.forEach((court, i) => {
      if (match.hallId !== null && court.hallId !== match.hallId) return;
      const zoneStart = pins.get(zoneKey(court.hallId, zone)) ?? -Infinity;
      const start = Math.max(freeAt[i]!, match.release, court.start, zoneStart);
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
    placed.push({ ...match, court: best, hallId: courts[best]!.hallId, from: bestStart, to: bestStart + minutes });
    return bestStart + minutes;
  }

  /** Places each category's matches in turn and returns each category's last end. */
  function step(lists: Match[][]) {
    const ends = new Map<string, number>();
    const index = lists.map(() => 0);
    let remaining = lists.reduce((sum, list) => sum + list.length, 0);
    while (remaining > 0) {
      lists.forEach((list, i) => {
        const match = list[index[i]!];
        if (!match) return;
        index[i]! += 1;
        remaining -= 1;
        const end = put(match);
        const id = match.info.categoryId;
        ends.set(id, Math.max(ends.get(id) ?? match.release, end ?? match.release));
      });
    }
    return ends;
  }

  const categories = analysis.categories;
  /** When each category is ready for its next step. */
  const ready = new Map(categories.map((c) => [c.categoryId, dayStart]));
  const rubbers = new Map(categories.map((c) => [c.categoryId, rubbersOf(inputs, c.categoryId)]));
  const expand = (base: Omit<MatchInfo, "rubber">, round: Round, release: number, hallId: string | null): Match[] =>
    rubbers.get(base.categoryId)!.map((rubber) => ({ info: { ...base, rubber }, round, release, hallId }));

  // Group stage: wave w is round w of every group's draw.
  const draws = new Map(categories.map((c) => [c.categoryId, c.format.groupSizes.map((size) => groupFixtures(size))]));
  const waves = Math.max(0, ...categories.map((c) => c.waves.waves));
  for (let w = 0; w < waves; w++) {
    const ends = step(
      categories.map((c) =>
        draws.get(c.categoryId)!.flatMap((rounds, g) =>
          (rounds[w] ?? []).flatMap(([a, b]) => {
            const letter = groupLetter(g);
            return expand(
              { categoryId: c.categoryId, stage: "group", group: letter, wave: w + 1, home: `${letter}${a}`, away: `${letter}${b}` },
              { type: "wave", wave: w + 1 },
              dayStart,
              hallOfGroup.get(`${c.categoryId}:${g}`) ?? null,
            );
          }),
        ),
      ),
    );
    // A category's knockout waits for its own group stage.
    for (const [id, end] of ends) ready.set(id, Math.max(ready.get(id)!, end));
  }

  // Knockout: rounds line up across categories counting back from the final.
  const brackets = new Map(
    categories.map((c) => {
      const category = inputs.categories.find((x) => x.id === c.categoryId);
      return [c.categoryId, knockoutBracket(c.format.qualifiers, c.format.groupSizes.length, Boolean(category?.bronze))];
    }),
  );
  const beforeFinal = (id: string) => brackets.get(id)!.rounds.filter((r) => r.size > 2);
  const levels = Math.max(0, ...categories.map((c) => beforeFinal(c.categoryId).length));
  for (let level = levels; level >= 1; level--) {
    const ends = step(
      categories.map((c) => {
        const own = beforeFinal(c.categoryId);
        const round = own[own.length - level];
        if (!round || c.matches.knockout === 0) return [];
        const after = ready.get(c.categoryId)!;
        return round.matches.flatMap((m) =>
          expand(
            { categoryId: c.categoryId, stage: "knockout", roundSize: round.size, code: m.code, home: m.home, away: m.away },
            { type: "knockout", size: round.size },
            after,
            null,
          ),
        );
      }),
    );
    for (const [id, end] of ends) ready.set(id, end);
  }

  step(
    categories.map((c) => {
      const bracket = brackets.get(c.categoryId)!;
      const final = bracket.rounds.find((r) => r.size === 2)?.matches[0];
      const after = ready.get(c.categoryId)!;
      return [
        ...(bracket.bronze && c.matches.bronze > 0
          ? expand({ categoryId: c.categoryId, stage: "bronze", code: "Bronze", home: bracket.bronze.home, away: bracket.bronze.away }, null, after, null)
          : []),
        ...(final && c.matches.final > 0
          ? expand({ categoryId: c.categoryId, stage: "final", code: "Final", home: final.home, away: final.away }, null, after, null)
          : []),
      ];
    }),
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
    const detail = { from: iso(match.from), to: iso(match.to), match: match.info };
    if (
      last &&
      Date.parse(last.to) === match.from &&
      last.stage === match.info.stage &&
      last.categoryId === match.info.categoryId &&
      sameRound(last.round, match.round)
    ) {
      last.to = iso(match.to);
      last.matches += 1;
      last.details.push(detail);
    } else {
      segments.push({
        from: iso(match.from),
        to: iso(match.to),
        stage: match.info.stage,
        round: match.round,
        categoryId: match.info.categoryId,
        matches: 1,
        details: [detail],
      });
    }
  }

  const stages: EstimatedSchedule["stages"] = {};
  for (const match of typical.placed) {
    const current = stages[match.info.stage];
    stages[match.info.stage] = {
      from: iso(Math.min(match.from, current ? Date.parse(current.from) : Infinity)),
      to: iso(Math.max(match.to, current ? Date.parse(current.to) : -Infinity)),
    };
  }

  // Each hall's zones, checked against their pins.
  const order = new Map(analysis.categories.map((c, i) => [c.categoryId, i]));
  const spans = new Map<WindowKey, { from: number; to: number; release: number; categories: Set<string> }>();
  for (const match of typical.placed) {
    const key = zoneKey(match.hallId, zoneOf(match.info.stage));
    const span = spans.get(key) ?? { from: Infinity, to: -Infinity, release: Infinity, categories: new Set<string>() };
    span.from = Math.min(span.from, match.from);
    span.to = Math.max(span.to, match.to);
    span.release = Math.min(span.release, match.release);
    span.categories.add(match.info.categoryId);
    spans.set(key, span);
  }
  const windows: EstimatedSchedule["windows"] = {};
  const pins = new Map((inputs.stageWindows ?? []).map((w) => [w.key, w]));
  for (const [key, span] of spans) {
    const pin = pins.get(key);
    const window: WindowSpan = {
      from: iso(span.from),
      to: iso(span.to),
      categoryIds: [...span.categories].sort((a, b) => order.get(a)! - order.get(b)!),
    };
    if (pin) {
      window.pinned = { from: pin.from, to: pin.to };
      if (span.to > Date.parse(pin.to)) window.overrun = iso(span.to);
      // The earliest any of its matches could have started, had the zone allowed it.
      if (span.release > Date.parse(pin.from)) window.earliest = iso(span.release);
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
