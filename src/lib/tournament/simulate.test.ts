import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { gameWinner, knockoutBracket, type StageRules } from "@/engine";
import { awardMatch } from "./changes";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { knockoutOutcome, matchPlayers } from "./entries";
import { gameState } from "./live";
import { finishMatch } from "./changes";
import { setScore } from "./live";
import { SIMULATED_BY, dayAfter, eventsBy, holdEvent, holdOf, restamp, simulateDay, type SimEvent, type SimGame } from "./simulate";

const GROUP: StageRules = { pointsPerGame: 21, deuce: { type: "standard", max: 30 }, bestOf: 1 };
const FINAL: StageRules = { ...GROUP, bestOf: 3 };

/** Six pairs in two groups of three, the top two of each through to semi-finals, a final and a bronze match. Everyone checked in unless said. */
function tournament(arrived = true): { draft: PlanDraft; games: SimGame[] } {
  const draft = completeDraft();
  draft.stage = "live";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => {
    const entry = { ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` };
    entry.players.forEach((p, n) => {
      p.id = `p${i + 1}${n === 0 ? "a" : "b"}`;
      if (arrived) p.attendance = "arrived";
    });
    return entry;
  });
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  const games: SimGame[] = [];
  // Group A on court c1 and group B on c2, a game every 15 minutes from 09:00.
  for (const [g, letter] of ["A", "B"].entries()) {
    [[1, 2], [1, 3], [2, 3]].forEach(([a, b], i) => {
      games.push({
        id: `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`,
        courtId: g === 0 ? "c1" : "c2",
        from: 540 + i * 15,
        to: 555 + i * 15,
        match: { categoryId: "c1", stage: "group", home: `${letter}${a}`, away: `${letter}${b}` },
      });
    });
  }
  const bracket = knockoutBracket(4, 2, true);
  const knockout = [...bracket.rounds.flatMap((r) => r.matches), bracket.bronze!];
  knockout.forEach((m, i) => {
    const last = m.code === "Final" || m.code === "Bronze";
    games.push({
      id: `c1:ko:${m.code}:r1`,
      courtId: i % 2 === 0 ? "c1" : "c2",
      from: last ? 615 : 590,
      to: last ? 648 : 605,
      match: { categoryId: "c1", stage: m.code === "Final" ? "final" : m.code === "Bronze" ? "bronze" : "knockout", home: m.home, away: m.away, code: m.code },
    });
  });
  return { draft, games };
}

const rulesOf = (game: SimGame) => (game.match.stage === "final" ? FINAL : GROUP);
const whole = (draft: PlanDraft, events: SimEvent[]) => dayAfter(draft, events, events.length);

/**
 * A whole day with the desk doing its part: each time the day stops at a
 * court, the desk acts on the day as it stands and the rest is worked out
 * again from that minute. Returns the day at its end and every event played.
 */
function dayWithDesk(
  draft: PlanDraft,
  games: SimGame[],
  seed: number,
  desk: (day: PlanDraft, hold: Extract<SimEvent, { kind: "hold" }>) => void,
): { end: PlanDraft; events: SimEvent[]; holds: number } {
  let day = draft;
  let from: number | undefined;
  const all: SimEvent[] = [];
  for (let holds = 0; holds < 50; holds++) {
    const events = simulateDay(day, games, rulesOf, seed, from);
    all.push(...events);
    day = whole(day, events);
    const hold = events.at(-1);
    if (hold?.kind !== "hold") return { end: day, events: all, holds };
    day = produce(day, (d) => desk(d, hold));
    from = hold.at;
  }
  throw new Error("The day never ended");
}

/** The desk gives the match to the side that is all there. */
function giveWalkover(day: PlanDraft, hold: { matchId: string }, games: SimGame[]) {
  const game = games.find((g) => g.id === hold.matchId)!;
  const out = (slot: string) => matchPlayers(day, { ...game.match, home: slot, away: slot }).some((p) => p.attendance !== "arrived");
  awardMatch(day, { matchId: hold.matchId, winner: out(game.match.home) ? 1 : 0, reason: "walkover", now: "2026-07-04T09:00:00.000Z" });
}

describe("a simulated day", () => {
  it("plays every game to a finish and a champion, without changing the tournament", () => {
    const { draft, games } = tournament();
    const before = JSON.stringify(draft);
    const events = simulateDay(draft, games, rulesOf, 7);
    expect(JSON.stringify(draft)).toBe(before);
    expect(holdOf(events)).toBeNull();
    const end = whole(draft, events);
    expect(JSON.stringify(draft)).toBe(before);
    expect(games.map((g) => gameState(end.results, g.id))).toEqual(games.map(() => "finished"));
    expect(knockoutOutcome(end, end.categories[0]!, "Final")).not.toBeNull();
  });

  it("checks people in before their first game; those who never come stay not yet", () => {
    const { draft, games } = tournament(false);
    const { end } = dayWithDesk(draft, games, 21, (day, hold) => giveWalkover(day, hold, games));
    const marks = end.entries.flatMap((e) => e.players.map((p) => p.attendance));
    expect(marks.filter((m) => m === "arrived").length).toBeGreaterThan(6);
    // The simulation marks nobody absent: that is the desk's note.
    expect(marks).not.toContain("absent");
  });

  it("only gives scores the rules allow", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { draft, games } = tournament();
      const end = whole(draft, simulateDay(draft, games, rulesOf, seed));
      for (const game of games) {
        const result = end.results[game.id]!;
        for (const score of result.games) expect(gameWinner(rulesOf(game)!, score)).toMatchObject({ problem: null });
        expect(result.games.length).toBeLessThanOrEqual(rulesOf(game)!.bestOf);
      }
    }
  });

  it("never has a court or a player in two games at once, or a game before its time or its sides", () => {
    const { draft, games } = tournament();
    const events = simulateDay(draft, games, rulesOf, 11);
    const span = new Map<string, { from: number; to: number }>();
    for (const e of events) {
      if (e.kind === "start") span.set(e.matchId, { from: e.at, to: e.at });
      if (e.kind === "finish") span.get(e.matchId)!.to = e.at;
    }
    const end = whole(draft, events);
    const played = games.filter((g) => span.has(g.id));
    expect(played).toHaveLength(games.length);
    for (const a of played) {
      // Nothing before the day begins (here, the planned first game at 09:00).
      expect(span.get(a.id)!.from).toBeGreaterThanOrEqual(540);
      for (const b of played) {
        if (a.id >= b.id) continue;
        const apart = span.get(a.id)!.to <= span.get(b.id)!.from || span.get(b.id)!.to <= span.get(a.id)!.from;
        const sides = (g: SimGame) => end.results[g.id]!.sides!;
        if (a.courtId === b.courtId || sides(a).some((id) => sides(b).includes(id))) expect(apart).toBe(true);
      }
    }
    // The semi-finals wait for both groups to finish; the final for both semi-finals.
    const groupsDone = Math.max(...games.filter((g) => g.match.stage === "group").map((g) => span.get(g.id)?.to ?? 0));
    for (const g of played.filter((x) => x.match.stage !== "group")) expect(span.get(g.id)!.from).toBeGreaterThanOrEqual(groupsDone);
    const semis = Math.max(...played.filter((g) => g.match.stage === "knockout").map((g) => span.get(g.id)!.to));
    expect(span.get("c1:ko:Final:r1")!.from).toBeGreaterThanOrEqual(semis);
  });

  it("is the same day for the same seed, and fills up as time passes", () => {
    const { draft, games } = tournament();
    const events = simulateDay(draft, games, rulesOf, 5);
    expect(simulateDay(draft, games, rulesOf, 5)).toEqual(events);
    expect(simulateDay(draft, games, rulesOf, 6)).not.toEqual(events);
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => a - b));
    const finished = (minute: number) => Object.values(dayAfter(draft, events, eventsBy(events, minute)).results).filter((r) => r.state === "finished").length;
    expect(finished(539)).toBe(0);
    expect(finished(565)).toBeGreaterThan(0);
    expect(finished(565)).toBeLessThan(finished(700));
    expect(finished(2000)).toBe(games.length);
  });

  it("begins when told to, shifts the day with it, and starts each game as soon as it can", () => {
    const { draft, games } = tournament();
    // Twenty minutes late.
    const events = simulateDay(draft, games, rulesOf, 9, 560);
    expect(events[0]).toEqual({ at: 560, kind: "begin", late: 20 });
    expect(events.filter((e) => e.kind === "start").every((e) => e.at >= 560)).toBe(true);
    const end = whole(draft, events);
    expect(end.startedAt).not.toBeNull();
    expect(end.log.find((l) => l.kind === "start")).toMatchObject({ text: "The tournament started at 09:20, 20 minutes after the plan", by: SIMULATED_BY });
    expect(games.every((g) => end.results[g.id]?.state === "finished")).toBe(true);

    // On a court, the next game starts the moment the one before it ends: no waiting for its planned minute.
    const starts = new Map(events.filter((e) => e.kind === "start").map((e) => [(e as { matchId: string }).matchId, e.at]));
    const ends = new Map(events.filter((e) => e.kind === "finish").map((e) => [(e as { matchId: string }).matchId, e.at]));
    const first = games.find((g) => g.courtId === "c1")!;
    const second = games.filter((g) => g.courtId === "c1")[1]!;
    expect(starts.get(second.id)).toBe(ends.get(first.id));

    // A tournament already started keeps its own start.
    const started = { ...draft, startedAt: "2026-07-04T08:10:00.000Z" };
    expect(simulateDay(started, games, rulesOf, 9, 550).some((e) => e.kind === "begin")).toBe(false);
  });
});

describe("a simulated day waits for the desk", () => {
  /** Entry 3's first player is not coming: it plays court 1's second and third games. */
  function withNoShow() {
    const made = tournament();
    made.draft.entries[2]!.players[0]!.attendance = "absent";
    return made;
  }

  it("gives no walkovers of its own: it stops at the court that can't go on", () => {
    const { draft, games } = withNoShow();
    const before = JSON.stringify(draft);
    const events = simulateDay(draft, games, rulesOf, 3);
    expect(JSON.stringify(draft)).toBe(before);
    const last = events.at(-1)!;
    expect(last).toMatchObject({ kind: "hold", reason: "players", courtId: "c1", matchId: games[1]!.id });
    expect(holdOf(events)).toBe(last.at);
    // It stops the moment the court's first game ends, and nothing happens after that.
    const firstEnds = events.find((e) => e.kind === "finish" && e.matchId === games[0]!.id)!;
    expect(last.at).toBe(firstEnds.at);
    expect(events.every((e) => e.at <= last.at)).toBe(true);
    const day = whole(draft, events);
    expect(day.log.some((l) => l.kind === "walkover")).toBe(false);
    expect(gameState(day.results, games[1]!.id)).toBe("waiting");
    // The other court's game is still on: the whole day waits, not only this court.
    expect(Object.values(day.results).some((r) => r.state === "onCourt")).toBe(true);
  });

  it("plays on to a champion once the desk gives the walkovers", () => {
    const { draft, games } = withNoShow();
    const { end, holds, events } = dayWithDesk(draft, games, 3, (day, hold) => giveWalkover(day, hold, games));
    // Entry 3's two group games each stop the day once.
    expect(holds).toBe(2);
    expect(games.every((g) => gameState(end.results, g.id) === "finished")).toBe(true);
    expect(end.log.filter((l) => l.kind === "walkover")).toHaveLength(2);
    expect(end.log.filter((l) => l.kind === "walkover").every((l) => l.by !== SIMULATED_BY)).toBe(true);
    expect(knockoutOutcome(end, end.categories[0]!, "Final")).not.toBeNull();
    // A game that was on court when the day stopped played on: it wasn't started twice.
    for (const g of games) expect(events.filter((e) => e.kind === "start" && e.matchId === g.id).length).toBeLessThanOrEqual(1);
  });

  it("plays on once the desk checks the player in, and doesn't stop for them again", () => {
    const { draft, games } = withNoShow();
    const { end, holds } = dayWithDesk(draft, games, 3, (day) => {
      day.entries[2]!.players[0]!.attendance = "arrived";
    });
    expect(holds).toBe(1);
    expect(games.every((g) => gameState(end.results, g.id) === "finished")).toBe(true);
    expect(end.log.some((l) => l.kind === "walkover")).toBe(false);
  });

  it("plays on when the desk puts another game on the court, and stops again when the held game comes back round", () => {
    const { draft, games } = withNoShow();
    const first = simulateDay(draft, games, rulesOf, 3);
    const at = holdOf(first)!;
    const day = whole(draft, first);
    // The desk puts court 1's third game... no: that is entry 3's too. It brings a game over from court 2 instead.
    const brought = games.find((g) => g.courtId === "c2" && gameState(day.results, g.id) === "waiting")!;
    const swapped = games.map((g) => (g.id === brought.id ? { ...g, courtId: "c1", from: games[1]!.from - 1 } : g));
    const next = simulateDay(day, swapped, rulesOf, 3, at);
    // It carries on from that minute, with the brought game on court 1.
    expect(next.every((e) => e.at >= at)).toBe(true);
    expect(next.find((e) => e.kind === "start" && e.matchId === brought.id)).toBeDefined();
    // And stops again when the held game is the court's next.
    expect(next.at(-1)).toMatchObject({ kind: "hold", matchId: games[1]!.id });
    expect(holdOf(next)!).toBeGreaterThan(at);
  });

  it("waits for a player who is only late, without stopping", () => {
    // Nobody checked in: the simulation brings them, some late. Find a day with someone late and nobody missing.
    for (let seed = 1; seed < 400; seed++) {
      const { draft, games } = tournament(false);
      const events = simulateDay(draft, games, rulesOf, seed);
      if (holdOf(events) !== null) continue;
      const firstStarts = events.filter((e) => e.kind === "start" && (e.matchId === games[0]!.id || e.matchId === games[3]!.id));
      if (!firstStarts.some((e) => e.at > 540)) continue;
      // A first game started after 09:00 because a player arrived after it was due; the day still played through.
      const lateStart = firstStarts.find((e) => e.at > 540)!;
      expect(events.some((e) => e.kind === "attendance" && e.at === lateStart.at)).toBe(true);
      expect(games.every((g) => gameState(whole(draft, events).results, g.id) === "finished")).toBe(true);
      return;
    }
    throw new Error("No seed gave a late player and nobody missing");
  });

  it("keeps who is coming and who isn't the same when the day is worked out again", () => {
    const { draft, games } = tournament(false);
    // Find a seed where somebody never comes.
    for (let seed = 1; seed < 400; seed++) {
      const events = simulateDay(draft, games, rulesOf, seed);
      const at = holdOf(events);
      if (at === null) continue;
      const day = whole(draft, events);
      const held = events.at(-1) as Extract<SimEvent, { kind: "hold" }>;
      const missing = matchPlayers(day, games.find((g) => g.id === held.matchId)!.match).filter((p) => p.attendance !== "arrived");
      expect(missing.length).toBeGreaterThan(0);
      // Worked out again from the same minute with nothing done: it stops at the same place, and nobody has turned up.
      const again = simulateDay(day, games, rulesOf, seed, at);
      expect(again.at(-1)).toMatchObject({ kind: "hold", matchId: held.matchId, at });
      expect(again.filter((e) => e.kind === "attendance" && missing.some((p) => p.id === e.playerId))).toEqual([]);
      return;
    }
    throw new Error("No seed left anyone missing");
  });

  it("carries on a day that has really begun from where it stands", () => {
    const { draft, games } = tournament();
    // Really started at 09:10 (London, summer: 08:10 UTC), court 1's first game on since then, court 2's finished.
    draft.startedAt = "2026-07-04T08:10:00.000Z";
    draft.results[games[0]!.id] = { state: "onCourt", games: [], startedAt: "2026-07-04T08:10:00.000Z", finishedAt: null, sides: ["e1", "e2"] };
    draft.results[games[3]!.id] = { state: "finished", games: [[21, 10]], startedAt: "2026-07-04T08:10:00.000Z", finishedAt: "2026-07-04T08:20:00.000Z", sides: ["e4", "e5"] };
    const events = simulateDay(draft, games, rulesOf, 4, 565);
    expect(events.some((e) => e.kind === "begin")).toBe(false);
    expect(events.every((e) => e.at >= 565)).toBe(true);
    // The game on court isn't started again; the finished one isn't replayed.
    expect(events.some((e) => e.kind === "start" && (e.matchId === games[0]!.id || e.matchId === games[3]!.id))).toBe(false);
    expect(events.some((e) => e.kind === "finish" && e.matchId === games[0]!.id)).toBe(true);
    const end = whole(draft, events);
    expect(end.results[games[3]!.id]!.games).toEqual([[21, 10]]);
    expect(games.every((g) => gameState(end.results, g.id) === "finished")).toBe(true);
  });
});

describe("a simulated day where the desk enters the scores", () => {
  it("starts games but never scores or finishes them: it stops when a game's time is up", () => {
    const { draft, games } = tournament();
    const events = simulateDay(draft, games, rulesOf, 8, undefined, { deskScores: true });
    expect(events.some((e) => e.kind === "score" || e.kind === "finish")).toBe(false);
    // Both courts' first games are on; the day stops at the first of them to end.
    expect(events.filter((e) => e.kind === "start").map((e) => (e as { matchId: string }).matchId).sort()).toEqual([games[0]!.id, games[3]!.id].sort());
    const hold = holdEvent(events)!;
    expect(hold.reason).toBe("score");
    expect([games[0]!.id, games[3]!.id]).toContain(hold.matchId);
    expect(hold.at).toBeGreaterThan(540);
    const day = dayAfter(draft, events, events.length);
    expect(day.results[hold.matchId]).toMatchObject({ state: "onCourt", games: [] });
  });

  it("plays on once the desk has scored and finished the game, with the next game coming onto that court", () => {
    const { draft, games } = tournament();
    const first = simulateDay(draft, games, rulesOf, 8, undefined, { deskScores: true });
    const hold = holdEvent(first)!;
    const before = dayAfter(draft, first, first.length);
    // The desk types 21–15 and finishes the match; it is stamped with the simulated minute.
    const scored = restamp(
      before,
      produce(before, (d) => {
        setScore(d, hold.matchId, 0, 0, 21, "2030-01-01T00:00:00.000Z");
        setScore(d, hold.matchId, 0, 1, 15, "2030-01-01T00:00:00.000Z");
        finishMatch(d, hold.matchId, "2030-01-01T00:00:00.000Z");
      }),
      hold.at,
    );
    expect(scored.results[hold.matchId]).toMatchObject({ state: "finished", games: [[21, 15]] });
    expect(scored.results[hold.matchId]!.finishedAt).not.toBe("2030-01-01T00:00:00.000Z");
    expect(new Date(scored.results[hold.matchId]!.finishedAt!).getUTCFullYear()).toBe(2026);

    const next = simulateDay(scored, games, rulesOf, 8, hold.at, { deskScores: true });
    const court = games.find((g) => g.id === hold.matchId)!.courtId;
    const follows = games.filter((g) => g.courtId === court)[1]!;
    // The next game on that court starts at once; the other court's game is still on and is the next to need a score.
    expect(next.find((e) => e.kind === "start" && e.matchId === follows.id)).toMatchObject({ at: hold.at });
    expect(holdEvent(next)).toMatchObject({ reason: "score" });
    expect(holdEvent(next)!.matchId).not.toBe(hold.matchId);
    expect(next.some((e) => e.kind === "finish")).toBe(false);
  });

  it("goes back to scoring by itself when the desk hands the scores back", () => {
    const { draft, games } = tournament();
    const first = simulateDay(draft, games, rulesOf, 8, undefined, { deskScores: true });
    const at = holdOf(first)!;
    const day = dayAfter(draft, first, first.length);
    const rest = simulateDay(day, games, rulesOf, 8, at);
    expect(holdOf(rest)).toBeNull();
    const end = dayAfter(day, rest, rest.length);
    expect(games.every((g) => gameState(end.results, g.id) === "finished")).toBe(true);
  });
});
