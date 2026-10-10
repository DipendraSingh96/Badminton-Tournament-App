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

/** Best of 3 typically needs two games and at most three. */
export function typicalGames(rules: StageRules): number {
  return rules.bestOf === 3 ? 2 : 1;
}

export function worstGames(rules: StageRules): number {
  return rules.bestOf;
}

export interface MatchMinutes {
  typical: number;
  worst: number;
  /** The working behind the two figures. */
  typicalGames: number;
  worstGames: number;
  minutesPerGame: number;
  pointsPerGame: number;
  maxPoints: number;
  changeoverMinutes: number;
}

/**
 * Slot length for one match of an event in a stage. Games and the longest
 * game come from the stage's scoring; minutes and organising time from the
 * event's timing. Worst case plays every game, each as long as possible.
 */
export function matchMinutes(rules: StageRules, timing: EventTiming): MatchMinutes {
  const maxPoints = maxPointsPerGame(rules);
  const longestGameFactor = maxPoints / rules.pointsPerGame;
  return {
    typical: typicalGames(rules) * timing.minutesPerGame + timing.changeoverMinutes,
    worst:
      worstGames(rules) * timing.minutesPerGame * longestGameFactor +
      timing.changeoverMinutes,
    typicalGames: typicalGames(rules),
    worstGames: worstGames(rules),
    minutesPerGame: timing.minutesPerGame,
    pointsPerGame: rules.pointsPerGame,
    maxPoints,
    changeoverMinutes: timing.changeoverMinutes,
  };
}
