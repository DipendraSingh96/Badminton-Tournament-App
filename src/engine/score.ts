import type { StageRules } from "./types";

// Scores as they are entered at the desk: one pair of numbers a game. A
// game's score is checked against the category's rules for the stage (points
// per game and the deuce rule); a match is won by taking most of its games.

export type Side = "home" | "away";

/** A game's two scores, home then away; null where nothing is entered yet. */
export type GameScore = [number | null, number | null];

export interface GameResult {
  /** Who won the game; null while it isn't a finished score. */
  winner: Side | null;
  /** What's wrong with the score as a final one, in plain words; null when it's fine or still empty. */
  problem: string | null;
}

/** The most a game can reach: the target, or the deuce rule's cap or maximum. */
function limitOf(rules: StageRules): number {
  return rules.deuce.type === "none" ? rules.pointsPerGame : rules.deuce.type === "cap" ? rules.deuce.cap : rules.deuce.max;
}

/**
 * Who won a game, by the stage's rules. With no deuce, first to the points
 * per game. With a deuce rule, a game is won by two clear points once a side
 * reaches the points per game, or by the first to the cap (or maximum).
 */
export function gameWinner(rules: StageRules, score: GameScore): GameResult {
  const [home, away] = score;
  if (home === null && away === null) return { winner: null, problem: null };
  if (home === null || away === null) return { winner: null, problem: "Enter both sides' scores" };
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return { winner: null, problem: "Scores are whole numbers from 0" };
  }
  const target = rules.pointsPerGame;
  const limit = limitOf(rules);
  const high = Math.max(home, away);
  const low = Math.min(home, away);
  const text = `${home}–${away}`;
  const winner: Side = home > away ? "home" : "away";
  if (home === away) return { winner: null, problem: high >= target ? `${text} can't be a final score: a game can't end level` : `${text} isn't finished` };
  if (high < target) return { winner: null, problem: `${text} isn't finished: first to ${target}` };
  if (high > limit) return { winner: null, problem: `${text} can't happen: a game stops at ${limit}` };

  if (rules.deuce.type === "none") {
    // First to the target; the game stopped there.
    return { winner, problem: null };
  }
  // Win by two, or first to the limit.
  if (high === limit && limit > target) {
    // Reached only from deuce: one or two clear.
    return high - low <= 2 ? { winner, problem: null } : { winner: null, problem: `${text} can't happen: the game was won at ${target}` };
  }
  if (high === target) {
    return low <= target - 2 ? { winner, problem: null } : { winner: null, problem: `${text} isn't finished: win by two` };
  }
  // Past the target, short of the limit: exactly two clear.
  if (high - low === 2) return { winner, problem: null };
  return high - low < 2
    ? { winner: null, problem: `${text} isn't finished: win by two` }
    : { winner: null, problem: `${text} can't happen: the game was won at ${Math.max(target, low + 2)}` };
}

export interface MatchOutcome {
  /** Games won by each side. */
  home: number;
  away: number;
  /** Who won the match; null until a side has most of the games. */
  winner: Side | null;
  finished: boolean;
  /** Each game's result, for as many games as the match can have. */
  games: GameResult[];
  /** The first thing wrong, for a one-line message; null when nothing is. */
  problem: string | null;
}

/**
 * A match from its games' scores. Best of 1 is one game; best of 3 is won by
 * the first side to two. A game entered after the match was already won is a
 * problem, as is a gap (a third game with no second).
 */
export function matchOutcome(rules: StageRules, scores: GameScore[]): MatchOutcome {
  const needed = Math.ceil(rules.bestOf / 2);
  const games: GameResult[] = [];
  let home = 0;
  let away = 0;
  let winner: Side | null = null;
  let open = false;
  for (let i = 0; i < rules.bestOf; i++) {
    const score: GameScore = scores[i] ?? [null, null];
    const empty = score[0] === null && score[1] === null;
    if (winner) {
      games.push({ winner: null, problem: empty ? null : `Game ${i + 1} wasn't played: the match was won in ${i}` });
      continue;
    }
    if (open) {
      games.push({ winner: null, problem: empty ? null : `Finish game ${i} first` });
      continue;
    }
    const result = gameWinner(rules, score);
    games.push(result);
    if (result.winner === "home") home += 1;
    else if (result.winner === "away") away += 1;
    else open = true;
    if (home === needed) winner = "home";
    if (away === needed) winner = "away";
  }
  return { home, away, winner, finished: winner !== null && games.every((g) => g.problem === null), games, problem: games.find((g) => g.problem)?.problem ?? null };
}
