import { holding, playingNow, type PlayableGame } from "./changes";
import type { PlanDraft } from "./draft";
import { entryForSlot } from "./entries";
import { courtQueues, gameState, projectDay, type Projected, type TimedGame } from "./live";

// The day as it is really going, worked out once for everything that shows it:
// the desk's pages and the audience board read the same answer.

/** A game on the schedule with its times and what it is. */
export type DayGame = TimedGame & PlayableGame;

export interface LiveDay {
  /** When play began, in minutes since midnight in the tournament's time zone; null before it has. */
  started: number | null;
  /** Where each game falls as the day is really going (the plan, until play begins). */
  projection: Map<string, Projected>;
  /** Waiting games held back by a player who hasn't checked in. Empty until play begins. */
  held: Set<string>;
  /** Each court's current game (on court, or due on it next), by court id. Empty until play begins. */
  byCourt: Map<string, string>;
  /** Courts whose current game is held, with that game. */
  stuck: Map<string, string>;
}

/** A stored time (UTC ISO) as minutes since midnight, given how to read a clock time from it. */
export type MinuteOf = (iso: string) => number | null;

export function liveDay<G extends DayGame>(
  draft: PlanDraft,
  games: G[],
  day: { now: number | null; minuteOf: MinuteOf; courtIds: string[] },
): LiveDay {
  const started = draft.startedAt ? day.minuteOf(draft.startedAt) : null;
  const projection = projectDay(games, draft.results, {
    started,
    now: day.now,
    minuteOf: day.minuteOf,
    known: (g) => Boolean(entryForSlot(draft, g.match.categoryId, g.match.home) && entryForSlot(draft, g.match.categoryId, g.match.away)),
  });
  const held = new Set<string>();
  const stuck = new Map<string, string>();
  const byCourt = new Map<string, string>();
  if (started !== null) {
    const playing = playingNow(draft, games);
    const queues = courtQueues(games, draft.results);
    for (const g of games) {
      if (gameState(draft.results, g.id) === "waiting" && holding(draft, g, playing) === "missing") held.add(g.id);
    }
    for (const courtId of day.courtIds) {
      const game = queues.get(courtId)?.current;
      if (!game) continue;
      byCourt.set(courtId, game.id);
      if (held.has(game.id)) stuck.set(courtId, game.id);
    }
  }
  return { started, projection, held, byCourt, stuck };
}

/** The games with their times as the day is really going; a walkover with nothing played is left out. */
export function projectedGames<G extends DayGame>(games: G[], projection: Map<string, Projected>): G[] {
  return games.flatMap((g) => {
    const at = projection.get(g.id);
    if (!at) return [g];
    return at.gone ? [] : [{ ...g, from: at.from, to: at.to }];
  });
}
