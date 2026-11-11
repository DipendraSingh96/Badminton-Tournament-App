import type { MatchResultDraft, PlanDraft } from "./draft";

// What "now" means once the tournament is Live: the board follows what has
// actually been played, not the clock. Each court keeps its games in their
// scheduled order; its current game is the first one not finished.

/** The least a scheduled game needs for this: which it is, where, and when it was due. */
export interface ScheduledGame {
  id: string;
  courtId: string;
  /** Scheduled start, in minutes since midnight. */
  from: number;
}

export type GameState = "waiting" | "onCourt" | "finished";

/** Where a game has got to: not started, on court, or finished. */
export function gameState(results: PlanDraft["results"], id: string): GameState {
  return results[id]?.state ?? "waiting";
}

export interface CourtQueue<G extends ScheduledGame> {
  courtId: string;
  /** The first game not finished; null when the court has none left. */
  current: G | null;
  /** The games after it, in order. */
  next: G[];
  /** Finished games, in the order they were scheduled. */
  played: G[];
}

/** Every court's current game, what follows it and what it has played. Courts with no games are left out. */
export function courtQueues<G extends ScheduledGame>(games: G[], results: PlanDraft["results"]): Map<string, CourtQueue<G>> {
  const byCourt = new Map<string, G[]>();
  for (const game of [...games].sort((a, b) => a.from - b.from)) {
    byCourt.set(game.courtId, [...(byCourt.get(game.courtId) ?? []), game]);
  }
  const queues = new Map<string, CourtQueue<G>>();
  for (const [courtId, list] of byCourt) {
    const open = list.filter((g) => gameState(results, g.id) !== "finished");
    queues.set(courtId, {
      courtId,
      current: open[0] ?? null,
      next: open.slice(1),
      played: list.filter((g) => gameState(results, g.id) === "finished"),
    });
  }
  return queues;
}

/**
 * Who to call: the games not yet started, soonest scheduled first (then in
 * the courts' order). Games on court or finished aren't called.
 */
export function callUp<G extends ScheduledGame>(games: G[], results: PlanDraft["results"], courtOrder: string[]): G[] {
  const place = new Map(courtOrder.map((id, i) => [id, i]));
  return games
    .filter((g) => gameState(results, g.id) === "waiting")
    .sort((a, b) => a.from - b.from || (place.get(a.courtId) ?? 0) - (place.get(b.courtId) ?? 0));
}

/**
 * A game put on court: its start time is kept, and who is playing it (the two
 * entries' ids) when given. Nothing changes if it's already on court or finished.
 */
export function startGame(draft: PlanDraft, id: string, now: string, sides?: [string, string]): void {
  if (draft.results[id]) return;
  draft.results[id] = { state: "onCourt", games: [], startedAt: now, finishedAt: null, ...(sides ? { sides } : {}) };
}

/** One side's score in one game; a game that hadn't been started is put on court. */
export function setScore(
  draft: PlanDraft,
  id: string,
  game: number,
  side: 0 | 1,
  value: number | null,
  now: string,
  sides?: [string, string],
): void {
  startGame(draft, id, now, sides);
  const result = draft.results[id]!;
  while (result.games.length <= game) result.games.push([null, null]);
  result.games[game]![side] = value;
}

/** The match is over: its finish time is kept. */
export function finishGame(draft: PlanDraft, id: string, now: string): void {
  const result: MatchResultDraft | undefined = draft.results[id];
  if (!result) return;
  result.state = "finished";
  result.finishedAt = now;
}

/**
 * A finished match opened again to correct its score; it goes back on court.
 * What it held is kept until it's finished again, for the log; a match that
 * was awarded (a walkover, a retirement) is back to being decided by its scores.
 */
export function reopenGame(draft: PlanDraft, id: string): void {
  const result = draft.results[id];
  if (!result || result.state !== "finished") return;
  result.was = { games: result.games.map(([home, away]) => [home, away]), finishedAt: result.finishedAt, ...(result.award ? { award: { ...result.award } } : {}) };
  delete result.award;
  result.state = "onCourt";
  result.finishedAt = null;
}
