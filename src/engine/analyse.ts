import { capacity, type Capacity } from "./capacity";
import { matchMinutes, typicalGames, type MatchMinutes } from "./duration";
import { eventsPerFixture, rubbersPerFixture } from "./entry";
import { finance, type FinanceResult } from "./finance";
import { distributeGroups, type HallShare } from "./distribution";
import { categoryFormat, groupMatchCount, type CategoryFormat, type FormatError } from "./format";
import { totalUmpires } from "./venue";
import { groupStageWaves, type GroupStageWaves } from "./waves";
import {
  EVENT_TYPES,
  STAGES,
  rulesFor,
  timingFor,
  type EventType,
  type Stage,
  type StageCounts,
  type TournamentInputs,
} from "./types";

export type AnalysisError =
  | { code: "format"; categoryId: string; errors: FormatError[] }
  | { code: "missingStageRules"; stage: Stage; categoryId: string }
  | { code: "missingStageTiming"; stage: Stage; categoryId: string };

/** Slot length for one match of a category in a stage, whatever the event. */
export interface Slot {
  categoryId: string;
  stage: Stage;
  minutes: MatchMinutes;
}

/** Court time needed by one event of a category in one stage: matches × slot length. */
export interface StageDemand {
  categoryId: string;
  stage: Stage;
  event: EventType;
  matches: number;
  games: number;
  typical: number;
  worst: number;
}

/** One category's structure and the matches it puts on court. */
export interface CategoryAnalysis {
  categoryId: string;
  format: CategoryFormat;
  /** Matches per fixture: 1, or the rubbers in a team tie. */
  rubbersPerFixture: number;
  /** Fixtures × rubbers, per stage. */
  matches: StageCounts;
  totalMatches: number;
  /** Group-stage rounds; empty for knockout only. */
  waves: GroupStageWaves;
}

export interface Analysis {
  categories: CategoryAnalysis[];
  matches: StageCounts;
  totalMatches: number;
  games: number;
  /** Slot lengths for every category and stage that has matches. */
  slots: Slot[];
  /** Category, stage and event with matches, in play order. */
  demand: StageDemand[];
  /** Group-stage waves across categories played side by side: the most of any category. */
  waves: number;
  /** Suggested groups per hall; empty with one hall or no group stage. */
  groupsPerHall: HallShare[];
  capacity: Capacity;
  finance: FinanceResult;
}

export type AnalysisResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; errors: AnalysisError[] };

/** Runs format, duration, capacity and finance for a whole tournament. */
export function analyseTournament(inputs: TournamentInputs): AnalysisResult {
  const errors: AnalysisError[] = [];
  const categories: Analysis["categories"] = [];
  const matches: StageCounts = { group: 0, knockout: 0, bronze: 0, final: 0 };
  /** Matches by category, stage and event. */
  const byEvent = new Map<string, number>();
  const key = (categoryId: string, stage: Stage, event: EventType) => `${categoryId}:${stage}:${event}`;

  for (const category of inputs.categories) {
    const result = categoryFormat(category, inputs.format);
    if (!result.ok) {
      errors.push({ code: "format", categoryId: category.id, errors: result.errors });
      continue;
    }
    const rubbers = rubbersPerFixture(category);
    const categoryMatches: StageCounts = { group: 0, knockout: 0, bronze: 0, final: 0 };
    for (const stage of STAGES) {
      const fixtures = result.format.fixtures[stage];
      categoryMatches[stage] = fixtures * rubbers;
      matches[stage] += categoryMatches[stage];
      for (const { event, count } of eventsPerFixture(category)) {
        if (fixtures * count === 0) continue;
        byEvent.set(key(category.id, stage, event), (byEvent.get(key(category.id, stage, event)) ?? 0) + fixtures * count);
      }
    }
    categories.push({
      categoryId: category.id,
      format: result.format,
      rubbersPerFixture: rubbers,
      matches: categoryMatches,
      totalMatches: result.format.totalFixtures * rubbers,
      waves: groupStageWaves(result.format.groupSizes),
    });
  }

  const analysed = new Map(categories.map((c) => [c.categoryId, c]));
  const playing = inputs.categories.filter((c) => analysed.has(c.id));
  for (const stage of STAGES) {
    for (const category of playing) {
      if (analysed.get(category.id)!.matches[stage] === 0) continue;
      if (!rulesFor(inputs, category, stage)) errors.push({ code: "missingStageRules", stage, categoryId: category.id });
      if (!timingFor(inputs, category, stage)) errors.push({ code: "missingStageTiming", stage, categoryId: category.id });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const slots: Slot[] = [];
  const demand: StageDemand[] = [];
  for (const stage of STAGES) {
    for (const category of playing) {
      const rules = rulesFor(inputs, category, stage);
      const timing = timingFor(inputs, category, stage);
      if (!rules || !timing || analysed.get(category.id)!.matches[stage] === 0) continue;
      const slot = matchMinutes(rules, timing, inputs.bestOfThreeAllowance);
      slots.push({ categoryId: category.id, stage, minutes: slot });
      for (const event of EVENT_TYPES) {
        const count = byEvent.get(key(category.id, stage, event));
        if (!count) continue;
        demand.push({
          categoryId: category.id,
          stage,
          event,
          matches: count,
          games: count * typicalGames(rules, inputs.bestOfThreeAllowance),
          typical: count * slot.typical,
          worst: count * slot.worst,
        });
      }
    }
  }
  const typical = demand.reduce((sum, d) => sum + d.typical, 0);
  const worst = demand.reduce((sum, d) => sum + d.worst, 0);
  const games = demand.reduce((sum, d) => sum + d.games, 0);

  const totalMatches = STAGES.reduce((sum, stage) => sum + matches[stage], 0);

  const groupSlot = (categoryId: string) =>
    slots.find((s) => s.stage === "group" && s.categoryId === categoryId)?.minutes.typical ?? 0;
  const groups = categories.flatMap((c) =>
    c.format.groupSizes.map((size, groupIndex) => ({
      categoryId: c.categoryId,
      groupIndex,
      courtMinutes: groupMatchCount(size) * c.rubbersPerFixture * groupSlot(c.categoryId),
    })),
  );
  // Shared by each hall's number of courts, so changing hours never moves a group between halls.
  const groupsPerHall =
    inputs.frame.halls.length > 1 && groups.length > 0
      ? distributeGroups(
          groups,
          inputs.frame.halls.map((h) => ({ hallId: h.id, courtMinutes: h.courts.length })),
        )
      : [];

  return {
    ok: true,
    analysis: {
      categories,
      matches,
      totalMatches,
      games,
      slots,
      demand,
      waves: Math.max(0, ...categories.map((c) => c.waves.waves)),
      groupsPerHall,
      capacity: capacity(inputs.frame, { matches: totalMatches, typical, worst }),
      finance: finance(inputs.finance, {
        categories: inputs.categories,
        halls: inputs.frame.halls,
        games,
        umpires: totalUmpires(inputs.frame.halls),
      }),
    },
  };
}

export interface ProfitPoint {
  /** Entries across every category. */
  entries: number;
  /** How those entries are shared: one number per category, in category order. */
  split: number[];
  revenue: number;
  totalCost: number;
  profit: number;
}

export interface ProfitCurve {
  points: ProfitPoint[];
  /** The smallest total in range with profit ≥ 0; null if none. */
  breakEven: number | null;
}

/** The fewest entries a category can run with. */
const FEWEST_ENTRIES = 2;

/**
 * A total number of entries shared between categories in the proportions of
 * their expected entries (largest remainders), with none below the fewest a
 * category can run with: 12 across categories expecting 24 and 8 is 9 and 3.
 * A total too small for that gives every category the fewest.
 */
export function shareEntries(total: number, expected: number[]): number[] {
  const count = expected.length;
  if (count === 0) return [];
  if (total <= FEWEST_ENTRIES * count) return expected.map(() => FEWEST_ENTRIES);
  const weight = expected.reduce((sum, e) => sum + e, 0);
  const exact = expected.map((e) => (weight > 0 ? (total * e) / weight : total / count));
  const share = exact.map(Math.floor);
  let left = total - share.reduce((sum, n) => sum + n, 0);
  const byRemainder = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) share[byRemainder[k % count]!.i]! += 1;
  // Bring any category up to the fewest, taking from the largest.
  for (let i = 0; i < count; i++) {
    while (share[i]! < FEWEST_ENTRIES) {
      const largest = share.indexOf(Math.max(...share));
      share[largest]! -= 1;
      share[i]! += 1;
    }
  }
  return share;
}

/**
 * Profit across total entries for the whole tournament, from the fewest it
 * can run with: each total is shared between the categories in the
 * proportions of their expected entries. Entries change the format and so the
 * match count, so each point re-runs the full analysis. Totals with no valid
 * format are skipped.
 */
export function profitCurveTotal(inputs: TournamentInputs, range: { to: number }): ProfitCurve {
  const expected = inputs.categories.map((c) => c.expectedEntries);
  const points: ProfitPoint[] = [];
  for (let entries = FEWEST_ENTRIES * expected.length; entries <= range.to; entries++) {
    const split = shareEntries(entries, expected);
    const result = analyseTournament({
      ...inputs,
      categories: inputs.categories.map((c, i) => ({ ...c, expectedEntries: split[i]! })),
    });
    if (!result.ok) continue;
    const { revenue, totalCost, profit } = result.analysis.finance;
    points.push({ entries, split, revenue, totalCost, profit });
  }
  const breakEven = points.find((p) => p.profit >= 0)?.entries ?? null;
  return { points, breakEven };
}
