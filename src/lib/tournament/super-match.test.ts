import { describe, expect, it } from "vitest";
import { gameWinner } from "@/engine";
import { awardMatch, goLive, moveGame, placeSuperMatch, reverseChange, unplaceSuperMatch } from "./changes";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { SUPER_LINE_UP, entryForSlot, entrySlot, matchPlayers, sidePlayers, superPlayersPerSide, groupStatus, groupSuperId, groupTable, knockoutOutcome, knockoutSuperId, levelKnockoutTies, matchRef, superScore } from "./entries";
import { finishGame, setScore } from "./live";
import { sidesKnown } from "./live-day";
import { parsePlan } from "./schema";
import { normaliseDraft } from "./storage";
import { isSuperId, placedSuperMatches, superMatches, superMatchInfo, superRules, unplacedSuperMatches } from "./super-match";

const NOW = "2026-07-04T09:00:00.000Z";
const LATER = "2026-07-04T10:00:00.000Z";

/** Six entries in two groups of three, the top two of each going through; Live, with the super match as the last tiebreak after points won. */
function live(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "draw";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({ ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` }));
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  draft.rules.tiebreaks = ["pointsWon", "superMatch"];
  draft.rules.superMatch = { points: 15, deuce: "standard", deuceLimit: 21 };
  goLive(draft, NOW);
  return draft;
}

function play(draft: PlanDraft, id: string, score: [number, number]) {
  setScore(draft, id, 0, 0, score[0], NOW);
  setScore(draft, id, 0, 1, score[1], NOW);
  finishGame(draft, id, NOW);
}

const group = (letter: string, a: number, b: number) => `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`;

/** Group A ends with e1 and e2 on 40 points each and e3 on 31: the first two are level for first place. */
function levelGroupA(draft: PlanDraft) {
  play(draft, group("A", 1, 2), [21, 19]);
  play(draft, group("A", 1, 3), [19, 21]);
  play(draft, group("A", 2, 3), [21, 10]);
}

function playGroupB(draft: PlanDraft) {
  play(draft, group("B", 1, 2), [12, 21]);
  play(draft, group("B", 1, 3), [9, 21]);
  play(draft, group("B", 2, 3), [18, 21]);
}

describe("the super match's rules", () => {
  it("are one game to its points, won by two up to its maximum when that is chosen", () => {
    const draft = live();
    const rules = superRules(draft)!;
    expect(rules).toEqual({ pointsPerGame: 15, deuce: { type: "standard", max: 21 }, bestOf: 1 });
    expect(gameWinner(rules, [15, 13]).winner).toBe("home");
    // Not two clear: the game goes on.
    expect(gameWinner(rules, [15, 14]).winner).toBeNull();
    expect(gameWinner(rules, [14, 16]).winner).toBe("away");
    draft.rules.superMatch = { points: 11, deuce: "none", deuceLimit: null };
    expect(gameWinner(superRules(draft)!, [11, 10]).winner).toBe("home");
    draft.rules.superMatch = { points: null, deuce: null, deuceLimit: null };
    expect(superRules(draft)).toBeUndefined();
  });

  it("must be set, and the super match kept last or just before the draw of lots, for the plan to be complete", () => {
    const draft = completeDraft();
    draft.rules.tiebreaks = ["matchesWon", "superMatch", "drawOfLots"];
    draft.rules.superMatch = { points: 15, deuce: "none", deuceLimit: null };
    const parsed = parsePlan(draft);
    expect(parsed.ok && parsed.inputs.rules.superMatch).toEqual({ pointsPerGame: 15, deuce: { type: "none" }, bestOf: 1 });
    draft.rules.superMatch = { points: null, deuce: null, deuceLimit: null };
    const unset = parsePlan(draft);
    expect(!unset.ok && unset.issues.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["rules.superMatch.points", "rules.superMatch.deuce"]));
    draft.rules.superMatch = { points: 15, deuce: "standard", deuceLimit: 15 };
    const low = parsePlan(draft);
    expect(!low.ok && low.issues.map((i) => i.path.join("."))).toContain("rules.superMatch.deuceLimit");
    draft.rules.superMatch = { points: 15, deuce: "none", deuceLimit: null };
    draft.rules.tiebreaks = ["superMatch", "matchesWon"];
    const early = parsePlan(draft);
    expect(!early.ok && early.issues.some((i) => /Super match can only be/.test(i.message))).toBe(true);
    // A plan without it is as it was.
    draft.rules.tiebreaks = ["matchesWon"];
    const without = parsePlan(draft);
    expect(without.ok && "superMatch" in without.inputs.rules).toBe(false);
  });

  it("opens a tournament saved before the super match with none placed and its rules unset", () => {
    const saved = JSON.parse(JSON.stringify(completeDraft()));
    delete saved.superCourts;
    delete saved.rules.superMatch;
    const opened = normaliseDraft(saved);
    expect(opened.superCourts).toEqual({});
    expect(opened.rules.superMatch).toEqual({ points: null, deuce: null, deuceLimit: null });
  });
});

describe("a super match in a group", () => {
  it("is made when a finished group leaves exactly two entries level for a place that goes through", () => {
    const draft = live();
    play(draft, group("A", 1, 2), [21, 19]);
    // Not finished yet: nothing to play.
    expect(superMatches(draft)).toEqual([]);
    levelGroupA(draft);
    const id = groupSuperId("c1", "A", "e1", "e2");
    expect(isSuperId(id)).toBe(true);
    expect(groupSuperId("c1", "A", "e2", "e1")).toBe(id);
    expect(superMatches(draft)).toEqual([{ id, categoryId: "c1", stage: "group", group: "A", code: null, home: "e1", away: "e2" }]);
    expect(unplacedSuperMatches(draft).map((m) => m.id)).toEqual([id]);
    const table = groupTable(draft, draft.categories[0]!, 0)!;
    expect(table.rows.map((r) => [r.id, r.place, r.shared])).toEqual([["e1", 1, true], ["e2", 1, true], ["e3", 3, false]]);
    // The knockout waits for it.
    playGroupB(draft);
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
    expect(entryForSlot(draft, "c1", "Runner-up A")).toBeNull();
    // It reads as a match, with the two entries as its sides.
    expect(matchRef(draft, id)).toMatchObject({ stage: "group", group: 0, label: "Group A, super match", super: true });
    const info = superMatchInfo(superMatches(draft)[0]!);
    expect(sidesKnown(draft, { match: info })).toBe(true);
    expect(entryForSlot(draft, "c1", info.home)?.id).toBe("e1");
  });

  it("isn't made without the tiebreak, for three level entries, or for a place that doesn't matter", () => {
    const off = live();
    off.rules.tiebreaks = ["pointsWon"];
    levelGroupA(off);
    expect(superMatches(off)).toEqual([]);
    // A ring on the same scores: three level. One game can't settle them.
    const ring = live();
    play(ring, group("A", 1, 2), [21, 10]);
    play(ring, group("A", 2, 3), [21, 10]);
    play(ring, group("A", 1, 3), [10, 21]);
    expect(groupTable(ring, ring.categories[0]!, 0)!.rows.every((r) => r.shared)).toBe(true);
    expect(superMatches(ring)).toEqual([]);
    // Only one goes through, and the level pair is second and third: nothing rides on it.
    const low = live();
    low.categories[0]!.qualifiersPerGroup = 1;
    play(low, group("A", 1, 2), [21, 10]);
    play(low, group("A", 1, 3), [21, 10]);
    play(low, group("A", 2, 3), [15, 15]);
    const rows = groupTable(low, low.categories[0]!, 0)!.rows;
    expect(rows.map((r) => [r.id, r.shared])).toEqual([["e1", false], ["e2", true], ["e3", true]]);
    expect(superMatches(low)).toEqual([]);
  });

  it("is put on a court, played there, and its result orders the two without counting in the table", () => {
    const draft = live();
    levelGroupA(draft);
    playGroupB(draft);
    const id = groupSuperId("c1", "A", "e1", "e2");
    const courtId = draft.frame.halls[0]!.courts[0]!.id;
    const games = [{ id: group("B", 2, 3), courtId, from: 600, to: 630 }];
    expect(placedSuperMatches(draft, games, () => 700)).toEqual([]);
    expect(placeSuperMatch(draft, { matchId: id, courtId: "no such court", now: LATER })).toBe(false);
    expect(placeSuperMatch(draft, { matchId: id, courtId, now: LATER })).toBe(true);
    expect(draft.log.at(-1)).toMatchObject({ kind: "move", text: "Group A, super match, Entry 1 v Entry 2: put on Court 1" });
    expect(unplacedSuperMatches(draft)).toEqual([]);
    // It isn't the schedule's to move.
    expect(moveGame(draft, { matchId: id, fromCourtId: courtId, target: { courtId, before: null }, now: LATER })).toBe(false);
    // On its court at the time it was put there, for the length of the day's shortest game.
    expect(placedSuperMatches(draft, games, () => 700)).toMatchObject([{ courtId, from: 700, to: 730, match: { id } }]);
    // A game still to be played on that court, due earlier: the super match goes ahead of it.
    const waiting = [{ id: "c1:ko:SF1:r1", courtId, from: 660, to: 690 }];
    expect(placedSuperMatches(draft, waiting, () => 700)[0]!.from).toBeLessThan(660);
    // Taken off again while it waits, and that can be reversed.
    expect(unplaceSuperMatch(draft, { matchId: id, now: LATER })).toBe(true);
    expect(unplacedSuperMatches(draft).map((m) => m.id)).toEqual([id]);
    expect(reverseChange(draft, draft.log.at(-1)!.id, LATER)).toBe(true);
    expect(draft.superCourts[id]).toMatchObject({ courtId });

    const before = groupTable(draft, draft.categories[0]!, 0)!.rows.map(({ id: entry, played, won, pointsWon }) => ({ entry, played, won, pointsWon }));
    // e2 (its away side: ids in order) wins it 15–12.
    play(draft, id, [12, 15]);
    expect(superScore(draft, id)).toBe("12–15");
    const table = groupTable(draft, draft.categories[0]!, 0)!;
    expect(table.rows.map((r) => [r.id, r.place, r.shared])).toEqual([["e2", 1, false], ["e1", 2, false], ["e3", 3, false]]);
    expect(table.rows.every((row) => groupStatus(table, row) !== "level")).toBe(true);
    // Nothing of it in the table's own numbers.
    const after = table.rows.map(({ id: entry, played, won, pointsWon }) => ({ entry, played, won, pointsWon }));
    expect(after.sort((a, b) => a.entry.localeCompare(b.entry))).toEqual(before.sort((a, b) => a.entry.localeCompare(b.entry)));
    expect(entryForSlot(draft, "c1", "Winner A")?.id).toBe("e2");
    expect(entryForSlot(draft, "c1", "Runner-up A")?.id).toBe("e1");
    // Played, it is still one of the day's games, and can't be taken off or put elsewhere.
    expect(superMatches(draft).map((m) => m.id)).toEqual([id]);
    expect(unplaceSuperMatch(draft, { matchId: id, now: LATER })).toBe(false);
    expect(placeSuperMatch(draft, { matchId: id, courtId, now: LATER })).toBe(false);
  });

  it("can be given as a walkover, scored at its own points", () => {
    const draft = live();
    levelGroupA(draft);
    const id = groupSuperId("c1", "A", "e1", "e2");
    expect(awardMatch(draft, { matchId: id, winner: 0, reason: "walkover", now: LATER })).toBe(true);
    expect(draft.results[id]).toMatchObject({ state: "finished", sides: ["e1", "e2"] });
    if (draft.rules.walkover === "straightGamesAtTarget") expect(draft.results[id]!.games).toEqual([[15, 0]]);
    expect(groupTable(draft, draft.categories[0]!, 0)!.rows.map((r) => r.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("a super match for a level knockout match-up", () => {
  /** A team tournament, two matches a match-up: the groups played, then the first semi-final left one match each on the same scores. */
  function levelSemi(): PlanDraft {
    const draft = live();
    const category = draft.categories[0]!;
    draft.rules.tiebreaks = ["matchesWon", "superMatch"];
    draft.unit = "team";
    category.lineUp = { ...category.lineUp, MD: 1, XD: 1 };
    const tie = (base: string, first: [number, number], second: [number, number]) => {
      play(draft, `${base}:r1`, first);
      play(draft, `${base}:r2`, second);
    };
    const groupTie = (letter: string, a: number, b: number, score: [number, number]) => tie(`c1:group:${letter}:${letter}${a}-${letter}${b}`, score, score);
    groupTie("A", 1, 2, [21, 15]);
    groupTie("A", 1, 3, [21, 10]);
    groupTie("A", 2, 3, [21, 19]);
    groupTie("B", 1, 2, [12, 21]);
    groupTie("B", 1, 3, [9, 21]);
    groupTie("B", 2, 3, [18, 21]);
    tie("c1:ko:SF1", [21, 15], [15, 21]);
    return draft;
  }

  it("is made for it, and its winner goes through", () => {
    const draft = levelSemi();
    const category = draft.categories[0]!;
    const id = knockoutSuperId("c1", "SF1");
    expect(superMatches(draft)).toEqual([{ id, categoryId: "c1", stage: "knockout", group: null, code: "SF1", home: "e1", away: "e5" }]);
    expect(matchRef(draft, id)).toMatchObject({ stage: "knockout", code: "SF1", label: "Semi-final 1, super match", super: true });
    expect(knockoutOutcome(draft, category, "SF1")).toBeNull();
    const courtId = draft.frame.halls[0]!.courts[0]!.id;
    expect(placeSuperMatch(draft, { matchId: id, courtId, now: LATER })).toBe(true);
    play(draft, id, [9, 15]);
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e5", loser: "e1" });
    expect(entryForSlot(draft, "c1", "Winner SF1")?.id).toBe("e5");
    expect(levelKnockoutTies(draft)).toEqual([]);
    // Still listed, as played.
    expect(superMatches(draft).map((m) => m.id)).toEqual([id]);
    expect(unplacedSuperMatches(draft)).toEqual([]);
  });

  it("is played by whoever the desk chooses from each squad, whatever the line-up for the match-ups", () => {
    const draft = levelSemi();
    const category = draft.categories[0]!;
    const squad = (id: string) => draft.entries.find((e) => e.id === id)!;
    for (const id of ["e1", "e5"]) squad(id).players = ["a", "b", "c", "d"].map((p) => ({ id: `${id}${p}`, name: `${id} ${p}`, attendance: "arrived" as const }));
    squad("e1").lineUp = { "1": ["e1a", "e1b"], "2": ["e1c", "e1d"] };
    const info = superMatchInfo(superMatches(draft)[0]!);
    expect(superPlayersPerSide(category)).toBe(2);
    // Nobody until they are chosen: the match-ups' line-up isn't used.
    expect(matchPlayers(draft, info)).toEqual([]);
    squad("e1").lineUp[SUPER_LINE_UP] = ["e1a", "e1d"];
    squad("e5").lineUp[SUPER_LINE_UP] = ["e5c", "e5b"];
    expect(sidePlayers(draft, "c1", entrySlot("e1")).map((p) => p.id)).toEqual(["e1a", "e1d"]);
    expect(matchPlayers(draft, info).map((p) => p.id)).toEqual(["e1a", "e1d", "e5c", "e5b"]);
    // The match-ups keep their own.
    expect(sidePlayers(draft, "c1", "A1", 2).map((p) => p.id)).toEqual(["e1c", "e1d"]);
  });

  it("isn't made when the super match isn't a tiebreak: the desk decides by hand, as before", () => {
    const draft = levelSemi();
    draft.rules.tiebreaks = ["matchesWon"];
    expect(superMatches(draft)).toEqual([]);
    expect(levelKnockoutTies(draft)).toHaveLength(1);
  });
});
