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

/**
 * The game a court shows: the first it hasn't finished, once its sides are
 * known (a game already started is always shown). Null for a free court.
 */
export function courtGame<G extends ScheduledGame>(queue: CourtQueue<G> | undefined, results: PlanDraft["results"], known: (game: G) => boolean): G | null {
  const current = queue?.current ?? null;
  return current && (results[current.id] !== undefined || known(current)) ? current : null;
}

/** The desk's view of the day as it stands: every court in its place, and what is waiting behind them. */
export interface CourtBoard<G extends ScheduledGame> {
  /**
   * Each court, in the courts' order, with the game on it or due on it next;
   * null when it has no game left. Only a court with none is free to be given another.
   */
  courts: { courtId: string; game: G | null }[];
  /** The other waiting games, soonest scheduled first. */
  upNext: G[];
}

/**
 * `known` says whether a game's two sides are known. A court never shows a
 * game that can't be played yet because they aren't (a knockout game while
 * the groups are still going): until then the court is free, and that game
 * waits with the others.
 */
export function courtBoard<G extends ScheduledGame>(
  games: G[],
  results: PlanDraft["results"],
  courtOrder: string[],
  known: (game: G) => boolean = () => true,
): CourtBoard<G> {
  const queues = courtQueues(games, results);
  const courts = courtOrder.map((courtId) => ({ courtId, game: courtGame(queues.get(courtId), results, known) }));
  const shown = new Set(courts.map((c) => c.game?.id));
  return { courts, upNext: callUp(games, results, courtOrder).filter((g) => !shown.has(g.id)) };
}

/** A game on the schedule with its planned end, to work out where it really falls. */
export interface TimedGame extends ScheduledGame {
  /** Scheduled end, in minutes since midnight. */
  to: number;
}

/** Where a game falls on the day as it is really going; `gone` for one that took no time (a walkover with nothing played). */
export interface Projected {
  from: number;
  to: number;
  gone: boolean;
}

/**
 * The schedule as the day is really going. Until the tournament has started
 * it is the plan. After that, on each court in its own order: a finished
 * game sits at its real start and finish; a game on court runs from its real
 * start to its planned length, or to now once it has run past it; a waiting
 * game follows straight on from the one before (never before now), though
 * one whose sides aren't known yet doesn't move ahead of its planned time
 * shifted by how late the day began; and a walkover with nothing played
 * takes no time at all. A competition's knockout games wait for its last
 * group game, wherever that is being played.
 */
export function projectDay<G extends TimedGame & { match?: { categoryId: string; stage?: string } }>(
  games: G[],
  results: PlanDraft["results"],
  day: {
    /** When play began, in minutes since midnight; null before it has. */
    started: number | null;
    now: number | null;
    /** A stored time (UTC ISO) as minutes since midnight in the tournament's time zone. */
    minuteOf: (iso: string) => number | null;
    /** Both sides of a waiting game are known. */
    known: (game: G) => boolean;
  },
): Map<string, Projected> {
  const out = new Map<string, Projected>();
  if (day.started === null) {
    for (const g of games) out.set(g.id, { from: g.from, to: g.to, gone: false });
    return out;
  }
  const first = games.reduce((min, g) => Math.min(min, g.from), Infinity);
  const offset = Number.isFinite(first) ? day.started - first : 0;
  const byCourt = new Map<string, G[]>();
  for (const g of [...games].sort((a, b) => a.from - b.from)) byCourt.set(g.courtId, [...(byCourt.get(g.courtId) ?? []), g]);
  // Each court's group games first; then its knockout games, which wait for their competition's last group game on any court.
  const isGroup = (g: G) => !g.match || g.match.stage === undefined || g.match.stage === "group";
  const cursors = new Map<string, number>();
  const groupsEnd = new Map<string, number>();
  for (const pass of ["group", "knockout"] as const) {
    for (const [courtId, list] of byCourt) {
      let cursor = cursors.get(courtId) ?? day.started;
      for (const g of list) {
        if (isGroup(g) !== (pass === "group")) continue;
        const length = Math.max(1, g.to - g.from);
        const result = results[g.id];
        const began = result?.startedAt ? day.minuteOf(result.startedAt) : null;
        if (result?.state === "finished") {
          const played = result.games.some(([home, away]) => home !== null || away !== null);
          if (result.award && (result.award.reason === "walkover" || !played)) {
            out.set(g.id, { from: cursor, to: cursor, gone: true });
            continue;
          }
          const from = began ?? cursor;
          const ended = result.finishedAt ? day.minuteOf(result.finishedAt) : null;
          const to = Math.max(from + 1, ended ?? from + length);
          out.set(g.id, { from, to, gone: false });
          cursor = Math.max(cursor, to);
        } else if (result) {
          const from = began ?? cursor;
          const to = Math.max(from + length, day.now ?? -Infinity);
          out.set(g.id, { from, to, gone: false });
          cursor = Math.max(cursor, to);
        } else {
          const after = pass === "knockout" && g.match ? (groupsEnd.get(g.match.categoryId) ?? -Infinity) : -Infinity;
          const from = Math.max(cursor, day.now ?? -Infinity, after, day.known(g) ? -Infinity : g.from + offset);
          out.set(g.id, { from, to: from + length, gone: false });
          cursor = from + length;
        }
        if (pass === "group" && g.match) groupsEnd.set(g.match.categoryId, Math.max(groupsEnd.get(g.match.categoryId) ?? -Infinity, out.get(g.id)!.to));
      }
      cursors.set(courtId, cursor);
    }
  }
  return out;
}

/** How far through its slot a game on court is: fine, nearly out of time, or over it. */
export type Timing = "ok" | "near" | "over";

/** The share of a game's slot after which it is "nearly out of time". */
export const NEARLY_OVER = 0.8;

/** A game on court against its slot on the schedule: from 80% of the slot it is near its end; past the slot it is over. */
export function timingOf(began: number, slot: number, now: number): Timing {
  const share = (now - began) / Math.max(1, slot);
  return share >= 1 ? "over" : share >= NEARLY_OVER ? "near" : "ok";
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
