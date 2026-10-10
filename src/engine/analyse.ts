import { capacity, type Capacity } from "./capacity";
import { matchMinutes, typicalGames, type MatchMinutes } from "./duration";
import { rubbersPerFixture } from "./entry";
import { finance, type FinanceResult } from "./finance";
import { categoryFormat, type CategoryFormat, type FormatError } from "./format";
import {
  STAGES,
  type Stage,
  type StageCounts,
  type TournamentInputs,
} from "./types";

export type AnalysisError =
  | { code: "format"; categoryId: string; errors: FormatError[] }
  | { code: "missingStageRules"; stage: Stage };

/** Court time needed by one stage: its matches × its slot length. */
export interface StageDemand {
  stage: Stage;
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
  matchMinutes: Partial<Record<Stage, MatchMinutes>>;
  /** Stages with matches, in play order. */
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

  for (const category of inputs.categories) {
    const result = categoryFormat(category, inputs.format);
    if (!result.ok) {
      errors.push({ code: "format", categoryId: category.id, errors: result.errors });
      continue;
    }
    const rubbers = rubbersPerFixture(category);
    const categoryMatches: StageCounts = { group: 0, knockout: 0, bronze: 0, final: 0 };
    for (const stage of STAGES) {
      categoryMatches[stage] = result.format.fixtures[stage] * rubbers;
      matches[stage] += categoryMatches[stage];
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

  if (errors.length > 0) return { ok: false, errors };

  const minutes: Analysis["matchMinutes"] = {};
  const demand: StageDemand[] = [];
  for (const stage of STAGES) {
    const rules = inputs.stageRules[stage];
    if (!rules) continue;
    const slot = matchMinutes(rules);
    minutes[stage] = slot;
    if (matches[stage] === 0) continue;
    demand.push({
      stage,
      matches: matches[stage],
      games: matches[stage] * typicalGames(rules),
      typical: matches[stage] * slot.typical,
      worst: matches[stage] * slot.worst,
    });
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
      matchMinutes: minutes,
      demand,
      capacity: capacity(inputs.frame, { matches: totalMatches, typical, worst }),
      finance: finance(inputs.finance, {
        categories: inputs.categories,
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
