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
  type EventType,
  type Stage,
  type StageCounts,
  type TournamentInputs,
} from "./types";

export type AnalysisError =
  | { code: "format"; categoryId: string; errors: FormatError[] }
  | { code: "missingStageRules"; stage: Stage }
  | { code: "missingStageTiming"; stage: Stage };

/** Slot length for one match in a stage, whatever the event. */
export interface Slot {
  stage: Stage;
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
  /** Group-stage rounds; empty for knockout only. */
  waves: GroupStageWaves;
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
      waves: groupStageWaves(result.format.groupSizes),
    });
  }

  for (const stage of STAGES) {
    if (matches[stage] > 0 && !inputs.stageRules[stage]) {
      errors.push({ code: "missingStageRules", stage });
    }
    if (matches[stage] > 0 && !inputs.stageTiming[stage]) {
      errors.push({ code: "missingStageTiming", stage });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const slots: Slot[] = [];
  const demand: StageDemand[] = [];
  for (const stage of STAGES) {
    const rules = inputs.stageRules[stage];
    const timing = inputs.stageTiming[stage];
    if (!rules || !timing || matches[stage] === 0) continue;
    const slot = matchMinutes(rules, timing, inputs.bestOfThreeAllowance);
    slots.push({ stage, minutes: slot });
    for (const event of EVENT_TYPES) {
      const count = byEvent.get(key(stage, event));
      if (!count) continue;
      demand.push({
        stage,
        event,
        matches: count,
        games: count * typicalGames(rules, inputs.bestOfThreeAllowance),
        typical: count * slot.typical,
        worst: count * slot.worst,
      });
    }
  }
  const typical = demand.reduce((sum, d) => sum + d.typical, 0);
  const worst = demand.reduce((sum, d) => sum + d.worst, 0);
  const games = demand.reduce((sum, d) => sum + d.games, 0);

  const totalMatches = STAGES.reduce((sum, stage) => sum + matches[stage], 0);

  const groupSlot = slots.find((s) => s.stage === "group")?.minutes.typical ?? 0;
  const groups = categories.flatMap((c) =>
    c.format.groupSizes.map((size, groupIndex) => ({
      categoryId: c.categoryId,
      groupIndex,
      courtMinutes: groupMatchCount(size) * c.rubbersPerFixture * groupSlot,
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
