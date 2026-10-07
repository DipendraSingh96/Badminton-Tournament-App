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
}

/**
 * Slot length for one match. Worst case plays every game and scales game
 * time by the longest possible game relative to a normal one.
 */
export function matchMinutes(rules: StageRules): MatchMinutes {
  const longestGameFactor = maxPointsPerGame(rules) / rules.pointsPerGame;
  return {
    typical:
      typicalGames(rules) * rules.minutesPerGame + rules.changeoverMinutes,
    worst:
      worstGames(rules) * rules.minutesPerGame * longestGameFactor +
      rules.changeoverMinutes,
  };
}
