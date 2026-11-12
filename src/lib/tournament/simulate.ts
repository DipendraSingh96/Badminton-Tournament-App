import { TZDate } from "@date-fns/tz";
import { produce } from "immer";
import { gameWinner, type GameScore, type StageRules } from "@/engine";
import { awardMatch, startTournament } from "./changes";
import type { Attendance, PlanDraft } from "./draft";
import { SIMULATION } from "./dummy/values";
import { entryForSlot, matchPlayers } from "./entries";
import { finishGame, gameState, startGame } from "./live";

// A simulated day, for looking at the Live stage with a day's worth of data
// (a developer tool: Settings, Developer tools). The whole day is worked out
// up front as a list of timed events; the day "at" a time is the saved
// tournament with the events up to then applied. Nothing here is ever saved.

/** Who a simulated change is logged as made by. */
export const SIMULATED_BY = "Simulation";

/** A game on the schedule, as the simulation needs it. */
export interface SimGame {
  id: string;
  courtId: string;
  /** Scheduled start and end, in minutes since midnight. */
  from: number;
  to: number;
  match: { categoryId: string; stage: string; home: string; away: string; code?: string; rubber?: { number: number } };
}

export type SimEvent = { at: number } & (
  /** Play begins: the day's real start, `late` minutes after the plan. */
  | { kind: "begin"; late: number }
  | { kind: "attendance"; playerId: string; attendance: Attendance }
  | { kind: "start"; matchId: string; sides?: [string, string] }
  /** The match's games so far, as they stand once another game of it has ended. */
  | { kind: "score"; matchId: string; games: [number, number][] }
  | { kind: "finish"; matchId: string }
  | { kind: "walkover"; matchId: string; winner: 0 | 1 }
);

/** A repeatable random number from 0 up to 1 (mulberry32): the same seed gives the same day. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A minute of the tournament's day as a UTC time. */
function isoAt(draft: PlanDraft, minute: number): string {
  const [y, mo, d] = (draft.frame.date || "2000-01-01").split("-").map(Number);
  const whole = Math.floor(minute);
  const time = new TZDate(y!, mo! - 1, d!, 0, whole, Math.round((minute - whole) * 60), draft.frame.timeZone || "UTC").getTime();
  return new Date(time).toISOString();
}

/** One event applied to a draft. */
function apply(draft: PlanDraft, event: SimEvent): void {
  const now = isoAt(draft, event.at);
  if (event.kind === "begin") {
    const at = `${String(Math.floor(event.at / 60)).padStart(2, "0")}:${String(Math.floor(event.at % 60)).padStart(2, "0")}`;
    startTournament(draft, { now, at, late: event.late, by: SIMULATED_BY });
  } else if (event.kind === "attendance") {
    for (const entry of draft.entries) for (const p of entry.players) if (p.id === event.playerId) p.attendance = event.attendance;
  } else if (event.kind === "start") {
    startGame(draft, event.matchId, now, event.sides);
  } else if (event.kind === "score") {
    const result = draft.results[event.matchId];
    if (result) result.games = event.games.map(([home, away]) => [home, away]);
  } else if (event.kind === "finish") {
    finishGame(draft, event.matchId, now);
  } else if (awardMatch(draft, { matchId: event.matchId, winner: event.winner, reason: "walkover", note: "Simulated: a player was absent", now })) {
    draft.log.at(-1)!.by = SIMULATED_BY;
  }
}

/** A finished game's score under the rules, won by the given side. */
function gameScore(rules: StageRules, homeWins: boolean, rand: () => number): [number, number] {
  const target = rules.pointsPerGame;
  const limit = rules.deuce.type === "none" ? target : rules.deuce.type === "cap" ? rules.deuce.cap : rules.deuce.max;
  let high = target;
  let low: number;
  if (rules.deuce.type !== "none" && limit > target && rand() < SIMULATION.deuceShare) {
    // Past the points per game: two clear, or one clear at the limit.
    high = target + 1 + Math.floor(rand() * (limit - target));
    low = high === limit && rand() < 0.5 ? high - 1 : high - 2;
  } else {
    const top = rules.deuce.type === "none" ? target - 1 : target - 2;
    const floor = Math.max(0, Math.min(top, Math.floor(target * SIMULATION.loserFloor)));
    low = floor + Math.floor(rand() * (top - floor + 1));
  }
  const score: GameScore = homeWins ? [high, low] : [low, high];
  // Whatever the rules, never a score they refuse: fall back to the plainest win.
  if (gameWinner(rules, score).winner === null) return homeWins ? [target, Math.max(0, target - 2)] : [Math.max(0, target - 2), target];
  return score as [number, number];
}

/**
 * The whole day, from the tournament as it stands: play begins at `startAt`
 * (the planned first game unless given, or when it really began if it
 * already has); players not yet marked check in (a few late, a few never);
 * each game starts as soon as its court and its players are free and its
 * sides are known, without waiting for its planned minute, and runs a little
 * short of or past its planned length; a game with an absent player is a
 * walkover. The draft is not changed. Events come back in time order.
 */
export function simulateDay(
  draft: PlanDraft,
  games: SimGame[],
  rulesOf: (game: SimGame) => StageRules | undefined,
  seed: number,
  startAt?: number,
): SimEvent[] {
  const rand = random(seed);
  const between = ([a, b]: readonly [number, number]) => a + rand() * (b - a);
  const events: SimEvent[] = [];
  const planned = games.reduce((min, g) => Math.min(min, g.from), Infinity);
  if (!Number.isFinite(planned)) return [];
  // Nothing is played before the day begins; everything planned moves with it.
  const dayStart = startAt ?? planned;
  const late = dayStart - planned;
  // The day as simulated so far: results are applied as they are made, so later sides can be read from it.
  let day = draft;
  const emit = (event: SimEvent) => {
    events.push(event);
    day = produce(day, (d) => apply(d, event));
  };

  if (!draft.startedAt) emit({ at: dayStart, kind: "begin", late });

  // Each entry's first game, to check its players in ahead of it.
  const firstGame = new Map<string, number>();
  for (const g of [...games].sort((a, b) => a.from - b.from)) {
    for (const slot of [g.match.home, g.match.away]) {
      const entry = entryForSlot(draft, g.match.categoryId, slot);
      if (entry && !firstGame.has(entry.id)) firstGame.set(entry.id, g.from + late);
    }
  }
  const arrival = new Map<string, number>();
  const absent = new Set<string>();
  for (const entry of draft.entries) {
    const first = firstGame.get(entry.id) ?? dayStart;
    for (const p of entry.players) {
      if (p.attendance === "absent") absent.add(p.id);
      if (p.attendance !== "notYet" || draft.withdrawn[entry.id]) continue;
      const draw = rand();
      if (draw < SIMULATION.absentShare) {
        absent.add(p.id);
        emit({ at: dayStart, kind: "attendance", playerId: p.id, attendance: "absent" });
        continue;
      }
      const lead = between(draw < SIMULATION.absentShare + SIMULATION.lateShare ? SIMULATION.lateBefore : SIMULATION.arriveBefore);
      const at = Math.max(dayStart, first - lead);
      arrival.set(p.id, at);
      emit({ at, kind: "attendance", playerId: p.id, attendance: "arrived" });
    }
  }

  // How strong each entry is on the day, so results hang together.
  const strength = new Map(draft.entries.map((e) => [e.id, 0.5 + rand()]));
  const queues = new Map<string, SimGame[]>();
  for (const g of [...games].sort((a, b) => a.from - b.from)) {
    if (gameState(draft.results, g.id) === "finished") continue;
    queues.set(g.courtId, [...(queues.get(g.courtId) ?? []), g]);
  }
  const courtFree = new Map<string, number>();
  const busy = new Map<string, number>();
  // When a category's groups were all played, and when each knockout match was: a later game's sides are known from then.
  const groupsDone = new Map<string, number>();
  const codeDone = new Map<string, number>();
  const knownFrom = (g: SimGame, slot: string) => {
    if (g.match.stage === "group") return dayStart;
    const feeder = /^(?:Winner|Loser) (.+)$/.exec(slot)?.[1];
    const key = `${g.match.categoryId}:${feeder}`;
    return feeder && codeDone.has(key) ? codeDone.get(key)! : (groupsDone.get(g.match.categoryId) ?? dayStart);
  };

  for (;;) {
    let pick: { game: SimGame; start: number; sides: [string, string]; held: string[] } | null = null;
    for (const [courtId, queue] of queues) {
      const game = queue[0];
      if (!game) continue;
      const home = entryForSlot(day, game.match.categoryId, game.match.home)?.id;
      const away = entryForSlot(day, game.match.categoryId, game.match.away)?.id;
      if (!home || !away) continue;
      const players = matchPlayers(day, game.match).map((p) => p.id);
      // A side with no named players (a line-up not set) is held by its entry.
      const held = players.length > 0 ? players : [home, away];
      const start = Math.max(
        dayStart,
        courtFree.get(courtId) ?? dayStart,
        knownFrom(game, game.match.home),
        knownFrom(game, game.match.away),
        ...held.map((id) => busy.get(id) ?? dayStart),
        ...players.filter((id) => !absent.has(id)).map((id) => arrival.get(id) ?? dayStart),
      );
      if (!pick || start < pick.start) pick = { game, start, sides: [home, away], held };
    }
    if (!pick) break;
    const { game, start, sides } = pick;
    queues.get(game.courtId)!.shift();
    const out = (slot: string) => matchPlayers(day, { ...game.match, home: slot, away: slot }).some((p) => absent.has(p.id));
    const homeOut = out(game.match.home);
    const awayOut = out(game.match.away);
    const rules = rulesOf(game);
    let end = start;
    if (homeOut || awayOut || !rules) {
      // A player never turned up (or the stage has no rules to score by): given to the other side.
      emit({ at: start, kind: "walkover", matchId: game.id, winner: homeOut && !awayOut ? 1 : 0 });
    } else {
      end = start + Math.max(1, (game.to - game.from) * between(SIMULATION.pace));
      const odds = strength.get(sides[0])! / (strength.get(sides[0])! + strength.get(sides[1])!);
      const needed = Math.ceil(rules.bestOf / 2);
      const played: [number, number][] = [];
      let home = 0;
      let away = 0;
      while (home < needed && away < needed) {
        const homeWins = rand() < odds;
        played.push(gameScore(rules, homeWins, rand));
        if (homeWins) home += 1;
        else away += 1;
      }
      emit({ at: start, kind: "start", matchId: game.id, sides });
      played.forEach((_, g) =>
        emit({ at: start + ((end - start) * (g + 1)) / played.length, kind: "score", matchId: game.id, games: played.slice(0, g + 1) }),
      );
      emit({ at: end, kind: "finish", matchId: game.id });
      for (const id of pick.held) busy.set(id, end);
    }
    courtFree.set(game.courtId, end);
    if (game.match.stage === "group") {
      groupsDone.set(game.match.categoryId, Math.max(groupsDone.get(game.match.categoryId) ?? dayStart, end));
    } else if (game.match.code) {
      const key = `${game.match.categoryId}:${game.match.code}`;
      codeDone.set(key, Math.max(codeDone.get(key) ?? dayStart, end));
    }
  }
  // Stable: events made at the same minute keep the order they were made in.
  return events
    .map((event, i) => ({ event, i }))
    .sort((a, b) => a.event.at - b.event.at || a.i - b.i)
    .map((x) => x.event);
}

/** How many of a day's events have happened by a minute. */
export function eventsBy(events: SimEvent[], minute: number): number {
  let n = 0;
  while (n < events.length && events[n]!.at <= minute) n += 1;
  return n;
}

/** The tournament with a simulated day's first so-many events applied; the draft itself is left as it is. */
export function dayAfter(draft: PlanDraft, events: SimEvent[], count: number): PlanDraft {
  return produce(draft, (d) => {
    for (const event of events.slice(0, count)) apply(d, event);
  });
}
