import type { MatchAwardDraft, MatchResultDraft, PlanDraft } from "./draft";

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

/** The desk's view of every game still to finish, as the day stands. */
export interface BoardSections<G extends ScheduledGame> {
  /** A game has been started or finished: before that the courts just show their first games. */
  started: boolean;
  /** The games being played, in the courts' order. */
  onCourt: G[];
  /** Each court with nothing on it, in the courts' order, with the game it is due next (null when it has none waiting). */
  free: { courtId: string; next: G | null }[];
  /** The other waiting games, soonest scheduled first. */
  upNext: G[];
}

/**
 * What the desk works from: the games on court, then the courts standing
 * free (each with its next game), then everything else that is waiting. It
 * re-sorts itself as games start and finish.
 */
export function boardSections<G extends ScheduledGame>(games: G[], results: PlanDraft["results"], courtOrder: string[]): BoardSections<G> {
  const queues = courtQueues(games, results);
  const onCourt: G[] = [];
  const free: { courtId: string; next: G | null }[] = [];
  for (const courtId of courtOrder) {
    const current = queues.get(courtId)?.current ?? null;
    if (current && gameState(results, current.id) === "onCourt") onCourt.push(current);
    else free.push({ courtId, next: current });
  }
  const shown = new Set(free.map((f) => f.next?.id));
  return {
    started: games.some((g) => results[g.id] !== undefined),
    onCourt,
    free,
    upNext: callUp(games, results, courtOrder).filter((g) => !shown.has(g.id)),
  };
}

/** How an awarded match is marked beside its score: a walkover or a retirement. */
export function awardMark(award: MatchAwardDraft | undefined): string | null {
  return award ? (award.reason === "walkover" ? "W/O" : "Ret.") : null;
}

/** A match's scores as entered, a game at a time: "21–15  18–"; with "W/O" or "Ret." after an awarded match's. */
export function scoreText(games: [number | null, number | null][] | undefined, award?: MatchAwardDraft): string | null {
  const played = (games ?? []).filter(([home, away]) => home !== null || away !== null);
  const text = [...played.map(([home, away]) => `${home ?? ""}–${away ?? ""}`), awardMark(award)].filter(Boolean).join("  ");
  return text || null;
}
