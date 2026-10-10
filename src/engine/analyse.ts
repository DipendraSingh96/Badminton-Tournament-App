import { capacity, type Capacity } from "./capacity";
import { matchMinutes, typicalGames, type MatchMinutes } from "./duration";
import { eventsPerFixture, rubbersPerFixture } from "./entry";
import { finance, type FinanceResult } from "./finance";
import { categoryFormat, type CategoryFormat, type FormatError } from "./format";
import {
  EVENT_TYPES,
  STAGES,
  type EventType,
  type Stage,
  type StageCounts,
  type TournamentInputs,
} from "./types";

export type AnalysisError =
  | { code: "format"; categoryId: string; errors: FormatError[] }
  | { code: "missingStageRules"; stage: Stage }
  | { code: "missingEventTiming"; event: EventType };

/** Slot length for one event in one stage. */
export interface Slot {
  stage: Stage;
  event: EventType;
  minutes: MatchMinutes;
}

/** Court time needed by one event in one stage: matches × slot length. */
export interface StageDemand {
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
}

export interface Analysis {
  categories: CategoryAnalysis[];
  matches: StageCounts;
  totalMatches: number;
  games: number;
  /** Slot lengths for every stage and event that has matches. */
  slots: Slot[];
  /** Stage and event pairs with matches, in play order. */
  demand: StageDemand[];
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
  /** Matches by stage and event. */
  const byEvent = new Map<string, number>();
  const key = (stage: Stage, event: EventType) => `${stage}:${event}`;

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
        byEvent.set(key(stage, event), (byEvent.get(key(stage, event)) ?? 0) + fixtures * count);
      }
    }
    categories.push({
      categoryId: category.id,
      format: result.format,
      rubbersPerFixture: rubbers,
      matches: categoryMatches,
      totalMatches: result.format.totalFixtures * rubbers,
    });
  }

  for (const stage of STAGES) {
    if (matches[stage] > 0 && !inputs.stageRules[stage]) {
      errors.push({ code: "missingStageRules", stage });
    }
  }
  for (const event of EVENT_TYPES) {
    const played = STAGES.some((stage) => byEvent.has(key(stage, event)));
    if (played && !inputs.eventTiming[event]) {
      errors.push({ code: "missingEventTiming", event });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const slots: Slot[] = [];
  const demand: StageDemand[] = [];
  for (const stage of STAGES) {
    const rules = inputs.stageRules[stage];
    if (!rules) continue;
    for (const event of EVENT_TYPES) {
      const count = byEvent.get(key(stage, event));
      const timing = inputs.eventTiming[event];
      if (!count || !timing) continue;
      const slot = matchMinutes(rules, timing);
      slots.push({ stage, event, minutes: slot });
      demand.push({
        stage,
        event,
        matches: count,
        games: count * typicalGames(rules),
        typical: count * slot.typical,
        worst: count * slot.worst,
      });
    }
  }
  const typical = demand.reduce((sum, d) => sum + d.typical, 0);
  const worst = demand.reduce((sum, d) => sum + d.worst, 0);
  const games = demand.reduce((sum, d) => sum + d.games, 0);

  const totalMatches = STAGES.reduce((sum, stage) => sum + matches[stage], 0);

  return {
    ok: true,
    analysis: {
      categories,
      matches,
      totalMatches,
      games,
      slots,
      demand,
      capacity: capacity(inputs.frame, { matches: totalMatches, typical, worst }),
      finance: finance(inputs.finance, {
        categories: inputs.categories,
        courtWindows: inputs.frame.courtWindows,
        games,
        umpires: inputs.frame.umpires,
      }),
    },
  };
}

export interface ProfitPoint {
  entries: number;
  revenue: number;
  totalCost: number;
  profit: number;
}

export interface ProfitCurve {
  points: ProfitPoint[];
  /** Smallest entry count in range with profit ≥ 0; null if none. */
  breakEven: number | null;
}

/**
 * Profit across entry counts for one category, others held at their
 * expected entries. Entries change the format and so the match count, so
 * each point re-runs the full analysis. Entry counts with no valid format
 * are skipped.
 */
export function profitCurve(
  inputs: TournamentInputs,
  categoryId: string,
  range: { from: number; to: number },
): ProfitCurve {
  const points: ProfitPoint[] = [];
  for (let entries = range.from; entries <= range.to; entries++) {
    const result = analyseTournament({
      ...inputs,
      categories: inputs.categories.map((c) =>
        c.id === categoryId ? { ...c, expectedEntries: entries } : c,
      ),
    });
    if (!result.ok) continue;
    const { revenue, totalCost, profit } = result.analysis.finance;
    points.push({ entries, revenue, totalCost, profit });
  }
  const breakEven = points.find((p) => p.profit >= 0)?.entries ?? null;
  return { points, breakEven };
}
