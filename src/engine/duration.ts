import type { EventTiming, StageRules } from "./types";

/** Most points a game can reach under the deuce rule. */
export function maxPointsPerGame(rules: StageRules): number {
  switch (rules.deuce.type) {
    case "none":
      return rules.pointsPerGame;
    case "cap":
      return rules.deuce.cap;
    case "standard":
      return rules.deuce.max;
  }
}

/** Games before any allowance: best of 3 usually ends in two. */
export function baseGames(rules: StageRules): number {
  return rules.bestOf === 3 ? 2 : 1;
}

export function worstGames(rules: StageRules): number {
  return rules.bestOf;
}

/** The allowance that applies to a stage: best of 3 only. */
function allowanceFor(rules: StageRules, bestOfThreeAllowance: number): number {
  return rules.bestOf === 3 ? bestOfThreeAllowance : 0;
}

/**
 * Typical games per match, for shuttle use: best of 3 assumes two games plus
 * the best-of-3 allowance for third games, never more than three.
 */
export function typicalGames(rules: StageRules, bestOfThreeAllowance = 0): number {
  return Math.min(
    baseGames(rules) * (1 + allowanceFor(rules, bestOfThreeAllowance)),
    worstGames(rules),
  );
}

export interface MatchMinutes {
  typical: number;
  worst: number;
  /** The working behind the two figures. */
  baseGames: number;
  typicalGames: number;
  worstGames: number;
  minutesPerGame: number;
  pointsPerGame: number;
  maxPoints: number;
  changeoverMinutes: number;
  /** Typical length before the best-of-3 allowance. */
  typicalBeforeAllowance: number;
  /** Allowance applied (0 for best of 1). */
  allowance: number;
  /** True when the allowance would have taken typical past the worst case. */
  capped: boolean;
}

/**
 * Slot length for one match of an event in a stage. Games and the longest
 * game come from the stage's scoring; minutes and organising time from the
 * event's timing. A best-of-3 match typically lasts two games plus organising,
 * increased by the organiser's best-of-3 allowance for third games, and never
 * more than the worst case. Worst case plays every game, each as long as
 * possible.
 */
export function matchMinutes(
  rules: StageRules,
  timing: EventTiming,
  bestOfThreeAllowance = 0,
): MatchMinutes {
  const maxPoints = maxPointsPerGame(rules);
  const longestGameFactor = maxPoints / rules.pointsPerGame;
  const allowance = allowanceFor(rules, bestOfThreeAllowance);
  const typicalBeforeAllowance = baseGames(rules) * timing.minutesPerGame + timing.changeoverMinutes;
  const worst =
    worstGames(rules) * timing.minutesPerGame * longestGameFactor + timing.changeoverMinutes;
  const withAllowance = typicalBeforeAllowance * (1 + allowance);
  return {
    typical: Math.min(withAllowance, worst),
    worst,
    baseGames: baseGames(rules),
    typicalGames: typicalGames(rules, bestOfThreeAllowance),
    worstGames: worstGames(rules),
    minutesPerGame: timing.minutesPerGame,
    pointsPerGame: rules.pointsPerGame,
    maxPoints,
    changeoverMinutes: timing.changeoverMinutes,
    typicalBeforeAllowance,
    allowance,
    capped: withAllowance > worst,
  };
}
