import { TZDate } from "@date-fns/tz";
import { produce } from "immer";
import { gameWinner, type GameScore, type StageRules } from "@/engine";
import { startTournament } from "./changes";
import type { Attendance, PlanDraft } from "./draft";
import { SIMULATION } from "./dummy/values";
import { entryForSlot, matchPlayers } from "./entries";
import { finishGame, gameState, startGame } from "./live";

// A simulated day, for trying the Live stage with a day's worth of data (a
// developer tool: Settings, Developer tools). The day is worked out as a list
// of timed events; the day "at" a time is the tournament it began from with
// the events up to then applied. The simulation does what the hall does
// (people arrive, games start, are scored and finish) and nothing the desk
// does: when a court's game can't start because a player hasn't checked in,
// the day stops there, for the desk to deal with, and is worked out again
// from that minute once it has. Nothing here is ever saved.

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
  /** A court's game can't start: a player hasn't checked in. Always the last event: the day waits here for the desk. */
  | { kind: "hold"; courtId: string; matchId: string }
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

/** A repeatable number from 0 up to 1 for a thing (a player, an entry, a game): the same for the same seed, however often the day is worked out again. */
function chance(seed: number, key: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return random(h)();
}

/** A stored time as a minute of the day in the tournament's time zone. */
function minuteAt(draft: PlanDraft, iso: string): number {
  const local = new TZDate(iso, draft.frame.timeZone || "UTC");
  return local.getHours() * 60 + local.getMinutes() + local.getSeconds() / 60;
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
  }
  // A hold changes nothing: the day waits there.
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
 * The day from a minute on, from the tournament as it stands. Play begins at
 * `from` if it hasn't already (the planned first game unless given). Players
 * not yet marked check in before their first game (a few late; a few never,
 * who stay "not yet"). Each game starts as soon as its court and its players
 * are free and its sides are known, without waiting for its planned minute,
 * and runs a little short of or past its planned length; a game already on
 * court plays on to its end. Nothing is given as a walkover: the first time
 * a court's game can't start because a player who isn't coming hasn't
 * checked in, the day ends with a `hold`, for the desk to deal with (a
 * player who is only late is waited for: the court is held until they come). Who is late, who never
 * comes, how strong each entry is and how long each game takes are fixed by
 * the seed, so working the day out again after the desk has acted carries
 * on the same day. The draft is not changed. Events come back in time order.
 */
export function simulateDay(
  draft: PlanDraft,
  games: SimGame[],
  rulesOf: (game: SimGame) => StageRules | undefined,
  seed: number,
  from?: number,
): SimEvent[] {
  const rand = random(seed);
  const span = ([a, b]: readonly [number, number], share: number) => a + share * (b - a);
  const events: SimEvent[] = [];
  const planned = games.reduce((min, g) => Math.min(min, g.from), Infinity);
  if (!Number.isFinite(planned)) return [];
  // Nothing happens before `now`; everything planned moves with the day's real start.
  const dayStart = draft.startedAt ? minuteAt(draft, draft.startedAt) : (from ?? planned);
  const now = Math.max(from ?? dayStart, draft.startedAt ? -Infinity : dayStart);
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
  // When each player not yet checked in arrives; none for one who never does.
  const arrival = new Map<string, number>();
  const missing = new Set<string>();
  const arrivals: { at: number; playerId: string }[] = [];
  for (const entry of draft.entries) {
    const first = firstGame.get(entry.id) ?? dayStart;
    for (const p of entry.players) {
      if (p.attendance === "arrived") continue;
      missing.add(p.id);
      if (p.attendance === "absent" || draft.withdrawn[entry.id]) continue;
      const draw = chance(seed, `player:${p.id}`);
      if (draw < SIMULATION.absentShare) continue;
      const lead = span(draw < SIMULATION.absentShare + SIMULATION.lateShare ? SIMULATION.lateBefore : SIMULATION.arriveBefore, chance(seed, `lead:${p.id}`));
      const at = Math.max(now, first - lead);
      arrival.set(p.id, at);
      arrivals.push({ at, playerId: p.id });
    }
  }

  // How strong each entry is on the day, so results hang together.
  const strength = new Map(draft.entries.map((e) => [e.id, 0.5 + chance(seed, `entry:${e.id}`)]));
  const lengthOf = (game: SimGame) => Math.max(1, (game.to - game.from) * span(SIMULATION.pace, chance(seed, `pace:${game.id}`)));
  const courtFree = new Map<string, number>();
  const busy = new Map<string, number>();
  // When a category's groups were all played, and when each knockout match was: a later game's sides are known from then.
  const groupsDone = new Map<string, number>();
  const codeDone = new Map<string, number>();
  const knownFrom = (g: SimGame, slot: string) => {
    if (g.match.stage === "group") return now;
    const feeder = /^(?:Winner|Loser) (.+)$/.exec(slot)?.[1];
    const key = `${g.match.categoryId}:${feeder}`;
    return feeder && codeDone.has(key) ? codeDone.get(key)! : (groupsDone.get(g.match.categoryId) ?? now);
  };
  /** A game played from `start` to `end`: scored a game at a time, then finished. */
  const play = (game: SimGame, sides: [string, string], held: string[], start: number, end: number, rules: StageRules) => {
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
    played.forEach((_, g) => emit({ at: start + ((end - start) * (g + 1)) / played.length, kind: "score", matchId: game.id, games: played.slice(0, g + 1) }));
    emit({ at: end, kind: "finish", matchId: game.id });
    for (const id of held) busy.set(id, end);
    courtFree.set(game.courtId, Math.max(courtFree.get(game.courtId) ?? now, end));
    if (game.match.stage === "group") {
      groupsDone.set(game.match.categoryId, Math.max(groupsDone.get(game.match.categoryId) ?? now, end));
    } else if (game.match.code) {
      const key = `${game.match.categoryId}:${game.match.code}`;
      codeDone.set(key, Math.max(codeDone.get(key) ?? now, end));
    }
  };

  const queues = new Map<string, SimGame[]>();
  for (const g of [...games].sort((a, b) => a.from - b.from)) {
    const state = gameState(draft.results, g.id);
    if (state === "finished") continue;
    if (state === "onCourt") {
      // Already being played: it plays on to its end.
      const result = draft.results[g.id]!;
      const rules = rulesOf(g);
      const home = result.sides?.[0] ?? entryForSlot(draft, g.match.categoryId, g.match.home)?.id;
      const away = result.sides?.[1] ?? entryForSlot(draft, g.match.categoryId, g.match.away)?.id;
      if (rules && home && away) {
        const began = result.startedAt ? minuteAt(draft, result.startedAt) : now;
        const players = matchPlayers(draft, g.match).map((p) => p.id);
        play(g, [home, away], players.length > 0 ? players : [home, away], now, Math.max(now, began + lengthOf(g)), rules);
      }
      continue;
    }
    queues.set(g.courtId, [...(queues.get(g.courtId) ?? []), g]);
  }

  // Arrivals happen in their own time, whatever the courts are doing; they are applied to the day as the games reach them.
  arrivals.sort((a, b) => a.at - b.at);
  let arrived = 0;
  const arriveBy = (minute: number) => {
    while (arrived < arrivals.length && arrivals[arrived]!.at <= minute) {
      const next = arrivals[arrived++]!;
      emit({ at: next.at, kind: "attendance", playerId: next.playerId, attendance: "arrived" });
    }
  };

  let hold: { at: number; courtId: string; matchId: string } | null = null;
  for (;;) {
    let pick: { game: SimGame; start: number; sides: [string, string]; held: string[] } | null = null;
    let stuck: { at: number; courtId: string; matchId: string } | null = null;
    for (const [courtId, queue] of queues) {
      const game = queue[0];
      if (!game) continue;
      const home = entryForSlot(day, game.match.categoryId, game.match.home)?.id;
      const away = entryForSlot(day, game.match.categoryId, game.match.away)?.id;
      if (!home || !away) continue;
      const players = matchPlayers(day, game.match).map((p) => p.id);
      // A side with no named players (a line-up not set) is held by its entry.
      const held = players.length > 0 ? players : [home, away];
      // Its court is free and its sides are known from here. A player who is only late is waited for (the court
      // stands held until they come); one who is never coming leaves the court waiting for the desk.
      const due = Math.max(now, courtFree.get(courtId) ?? now, knownFrom(game, game.match.home), knownFrom(game, game.match.away));
      const awaited = players.filter((id) => missing.has(id));
      if (awaited.some((id) => !arrival.has(id)) || !rulesOf(game)) {
        if (!stuck || due < stuck.at) stuck = { at: due, courtId, matchId: game.id };
        continue;
      }
      const start = Math.max(due, ...held.map((id) => busy.get(id) ?? now), ...awaited.map((id) => arrival.get(id)!));
      if (!pick || start < pick.start) pick = { game, start, sides: [home, away], held };
    }
    // The day stops at the first court that can't go on (once everything else due by that minute has started).
    if (stuck && (!pick || stuck.at < pick.start)) {
      hold = stuck;
      break;
    }
    if (!pick) break;
    const { game, start, sides, held } = pick;
    queues.get(game.courtId)!.shift();
    arriveBy(start);
    emit({ at: start, kind: "start", matchId: game.id, sides });
    play(game, sides, held, start, start + lengthOf(game), rulesOf(game)!);
  }
  if (hold) {
    arriveBy(hold.at);
    events.push({ at: hold.at, kind: "hold", courtId: hold.courtId, matchId: hold.matchId });
  } else arriveBy(Infinity);
  // Stable: events made at the same minute keep the order they were made in. Nothing happens after a hold.
  return events
    .filter((event) => !hold || event.at <= hold.at)
    .map((event, i) => ({ event, i }))
    .sort((a, b) => a.event.at - b.event.at || (a.event.kind === "hold" ? 1 : b.event.kind === "hold" ? -1 : a.i - b.i))
    .map((x) => x.event);
}

/** The minute a day stops to wait for the desk; null for a day that plays to its end. */
export function holdOf(events: SimEvent[]): number | null {
  const last = events.at(-1);
  return last?.kind === "hold" ? last.at : null;
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
