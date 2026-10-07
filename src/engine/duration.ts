import type { StageRules } from "./types";

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
 * Slot length for one match. Worst case plays every game and scales game
 * time by the longest possible game relative to a normal one.
 */
export function matchMinutes(rules: StageRules): MatchMinutes {
  const maxPoints = maxPointsPerGame(rules);
  const longestGameFactor = maxPoints / rules.pointsPerGame;
  return {
    typical:
      typicalGames(rules) * rules.minutesPerGame + rules.changeoverMinutes,
    worst:
      worstGames(rules) * rules.minutesPerGame * longestGameFactor +
      rules.changeoverMinutes,
    typicalGames: typicalGames(rules),
    worstGames: worstGames(rules),
    minutesPerGame: rules.minutesPerGame,
    pointsPerGame: rules.pointsPerGame,
    maxPoints,
    changeoverMinutes: rules.changeoverMinutes,
  };
}
