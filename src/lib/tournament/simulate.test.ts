import { describe, expect, it } from "vitest";
import { gameWinner, knockoutBracket, type StageRules } from "@/engine";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { knockoutOutcome, matchPlayers } from "./entries";
import { gameState } from "./live";
import { SIMULATED_BY, dayAfter, eventsBy, simulateDay, type SimGame } from "./simulate";

const GROUP: StageRules = { pointsPerGame: 21, deuce: { type: "standard", max: 30 }, bestOf: 1 };
const FINAL: StageRules = { ...GROUP, bestOf: 3 };

/** Six pairs in two groups of three, the top two of each through to semi-finals, a final and a bronze match. */
function tournament(): { draft: PlanDraft; games: SimGame[] } {
  const draft = completeDraft();
  draft.stage = "live";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({ ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` }));
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

describe("a simulated day", () => {
  it("plays every game to a finish and a champion, without changing the tournament", () => {
    const { draft, games } = tournament();
    const before = JSON.stringify(draft);
    const events = simulateDay(draft, games, rulesOf, 7);
    expect(JSON.stringify(draft)).toBe(before);
    const end = dayAfter(draft, events, events.length);
    expect(JSON.stringify(draft)).toBe(before);
    expect(games.map((g) => gameState(end.results, g.id))).toEqual(games.map(() => "finished"));
    expect(knockoutOutcome(end, end.categories[0]!, "Final")).not.toBeNull();
    // Nobody is left unmarked.
    expect(end.entries.flatMap((e) => e.players).filter((p) => p.attendance === "notYet")).toEqual([]);
  });

  it("only gives scores the rules allow", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { draft, games } = tournament();
      const end = dayAfter(draft, simulateDay(draft, games, rulesOf, seed), Infinity);
      for (const game of games) {
        const result = end.results[game.id]!;
        if (result.award) continue;
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
    const end = dayAfter(draft, events, events.length);
    const played = games.filter((g) => span.has(g.id));
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

  it("gives an absent player's games to the other side as walkovers, logged as simulated", () => {
    const { draft, games } = tournament();
    draft.entries[0]!.players[0]!.attendance = "absent";
    const end = dayAfter(draft, simulateDay(draft, games, rulesOf, 3), Infinity);
    const own = games.filter((g) => g.match.stage === "group" && matchPlayers(draft, g.match).some((p) => p.id === draft.entries[0]!.players[0]!.id));
    expect(own).toHaveLength(2);
    for (const g of own) expect(end.results[g.id]).toMatchObject({ state: "finished", award: { winner: 1, reason: "walkover" } });
    expect(end.log.filter((l) => l.kind === "walkover").every((l) => l.by === SIMULATED_BY)).toBe(true);
    // A check-in made by hand is kept.
    expect(end.entries[0]!.players[0]!.attendance).toBe("absent");
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
    const end = dayAfter(draft, events, Infinity);
    expect(end.startedAt).not.toBeNull();
    expect(end.log.find((l) => l.kind === "start")).toMatchObject({ text: "The tournament started at 09:20, 20 minutes after the plan", by: SIMULATED_BY });
    expect(games.every((g) => end.results[g.id]?.state === "finished")).toBe(true);

    // On a court, the next game starts the moment the one before it ends: no waiting for its planned minute.
    const starts = new Map(events.filter((e) => e.kind === "start").map((e) => [(e as { matchId: string }).matchId, e.at]));
    const ends = new Map(events.filter((e) => e.kind === "finish").map((e) => [(e as { matchId: string }).matchId, e.at]));
    const early = games.filter((g) => starts.has(g.id) && starts.get(g.id)! < g.from + 20);
    expect(early.length).toBeGreaterThan(0);
    const firstOnCourt = games.find((g) => g.courtId === "c1")!;
    const second = games.filter((g) => g.courtId === "c1")[1]!;
    expect(starts.get(second.id)).toBeGreaterThanOrEqual(ends.get(firstOnCourt.id)!);

    // A tournament already started keeps its own start.
    draft.startedAt = "2026-07-04T08:10:00.000Z";
    expect(simulateDay(draft, games, rulesOf, 9, 550).some((e) => e.kind === "begin")).toBe(false);
  });
});
