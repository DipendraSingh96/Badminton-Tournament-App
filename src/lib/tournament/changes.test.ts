import { describe, expect, it } from "vitest";
import { awardMatch, canReverse, decideKnockout, decideTie, finishMatch, goLive, holding, moveGame, planWithdrawal, playingNow, reversalBlockedBy, reverseChange, startReadyGames, startTournament, withdrawEntry } from "./changes";
import { emptyDraft, emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { entryForSlot, groupStatus, groupTable, knockoutLevel, knockoutOutcome, levelKnockoutTies, matchRef, sidesChanged } from "./entries";
import { finishGame, reopenGame, setScore } from "./live";
import { normaliseDraft } from "./storage";

const NOW = "2026-07-04T09:00:00.000Z";
const LATER = "2026-07-04T10:00:00.000Z";

/** Six entries drawn into two groups of three; the top two of each go through. Live. */
function live(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "draw";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({ ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` }));
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  goLive(draft, NOW);
  return draft;
}

function play(draft: PlanDraft, id: string, score: [number, number]) {
  setScore(draft, id, 0, 0, score[0], NOW);
  setScore(draft, id, 0, 1, score[1], NOW);
  finishGame(draft, id, NOW);
}

const group = (letter: string, a: number, b: number) => `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`;
const ko = (code: string) => `c1:ko:${code}:r1`;
const snapshot = (draft: PlanDraft) => JSON.stringify({ results: draft.results, withdrawn: draft.withdrawn, decided: draft.decided, moves: draft.matchMoves, stage: draft.stage });

function playGroups(draft: PlanDraft) {
  play(draft, group("A", 1, 2), [21, 15]);
  play(draft, group("A", 1, 3), [21, 10]);
  play(draft, group("A", 2, 3), [21, 19]);
  play(draft, group("B", 1, 2), [12, 21]);
  play(draft, group("B", 1, 3), [9, 21]);
  play(draft, group("B", 2, 3), [18, 21]);
}

describe("the log", () => {
  it("starts with going Live, which can be reversed back to the draw", () => {
    const draft = live();
    expect(draft.stage).toBe("live");
    expect(draft.log).toHaveLength(1);
    expect(draft.log[0]).toMatchObject({ kind: "live", by: "Desk", at: NOW, reversedAt: null });
    expect(reverseChange(draft, draft.log[0]!.id, LATER)).toBe(true);
    expect(draft.stage).toBe("draw");
    expect(draft.log[1]).toMatchObject({ kind: "reversal", text: "Reversed: The tournament went Live" });
    expect(draft.log[0]!.reversedAt).toBe(LATER);
    // Reversed once: not again, and a reversal isn't reversed.
    expect(canReverse(draft, draft.log[0]!.id)).toBe(false);
    expect(canReverse(draft, draft.log[1]!.id)).toBe(false);
  });

  it("opens a tournament saved before the log with an empty one", () => {
    const saved = JSON.parse(JSON.stringify(emptyDraft("Europe/London")));
    delete saved.log;
    delete saved.withdrawn;
    delete saved.decided;
    expect(normaliseDraft(saved)).toMatchObject({ log: [], withdrawn: {}, decided: {} });
  });

  it("reads a match from its id", () => {
    const draft = live();
    expect(matchRef(draft, group("A", 1, 3))).toMatchObject({ stage: "group", group: 0, home: "A1", away: "A3", label: "Group A" });
    expect(matchRef(draft, ko("SF1"))).toMatchObject({ stage: "knockout", code: "SF1", home: "Winner A", away: "Runner-up B", label: "Semi-final 1" });
    expect(matchRef(draft, ko("Final"))).toMatchObject({ stage: "final", label: "Final" });
    expect(matchRef(draft, "c1:ko:QF9:r1")).toBeNull();
    expect(matchRef(draft, "nonsense")).toBeNull();
  });
});

describe("walkovers and retirements", () => {
  it("scores a walkover in straight games at the stage's points", () => {
    const draft = live();
    expect(draft.rules.walkover).toBe("straightGamesAtTarget");
    expect(awardMatch(draft, { matchId: group("A", 1, 2), winner: 1, reason: "walkover", note: " no show ", now: NOW })).toBe(true);
    expect(draft.results[group("A", 1, 2)]).toMatchObject({ state: "finished", games: [[0, 21]], award: { winner: 1, reason: "walkover" }, sides: ["e1", "e2"] });
    expect(draft.log.at(-1)).toMatchObject({ kind: "walkover", text: "Group A: walkover to Entry 2 (Entry 1 didn't play)", note: "no show" });
    const table = groupTable(draft, draft.categories[0]!, 0)!;
    expect(table.rows[0]).toMatchObject({ id: "e2", won: 1, pointsWon: 21 });
    // The final is best of three: two games.
    playGroups(live());
    const other = live();
    playGroups(other);
    play(other, ko("SF1"), [21, 5]);
    play(other, ko("SF2"), [21, 5]);
    awardMatch(other, { matchId: ko("Final"), winner: 0, reason: "walkover", now: NOW });
    expect(other.results[ko("Final")]!.games).toEqual([[21, 0], [21, 0]]);
    expect(knockoutOutcome(other, other.categories[0]!, "Final")?.winner).toBe("e1");
  });

  it("scores a walkover as a win only, when that's the rule", () => {
    const draft = live();
    draft.rules.walkover = "winOnly";
    awardMatch(draft, { matchId: group("A", 1, 2), winner: 0, reason: "walkover", now: NOW });
    expect(draft.results[group("A", 1, 2)]!.games).toEqual([]);
    const table = groupTable(draft, draft.categories[0]!, 0)!;
    expect(table.played).toBe(1);
    expect(table.rows[0]).toMatchObject({ id: "e1", won: 1, gamesWon: 0, pointsWon: 0 });
  });

  it("keeps a retired match's scores and gives it to the other side", () => {
    const draft = live();
    const id = group("A", 1, 2);
    setScore(draft, id, 0, 0, 14, NOW);
    setScore(draft, id, 0, 1, 9, NOW);
    awardMatch(draft, { matchId: id, winner: 1, reason: "retired", open: true, now: LATER });
    expect(draft.results[id]).toMatchObject({ state: "finished", games: [[14, 9]], startedAt: NOW, finishedAt: LATER, award: { winner: 1, reason: "retired", open: true } });
    expect(draft.log.at(-1)!.text).toBe("Group A: Entry 1 retired, so Entry 2 win");
    const table = groupTable(draft, draft.categories[0]!, 0)!;
    expect(table.rows[0]).toMatchObject({ id: "e2", won: 1, gamesWon: 0, pointsWon: 9, pointsLost: 14 });
  });

  it("won't award a finished match, and reverses an award to how the match was", () => {
    const draft = live();
    const id = group("A", 1, 2);
    setScore(draft, id, 0, 0, 14, NOW);
    const before = snapshot(draft);
    awardMatch(draft, { matchId: id, winner: 1, reason: "retired", now: NOW });
    expect(awardMatch(draft, { matchId: id, winner: 0, reason: "walkover", now: NOW })).toBe(false);
    expect(reverseChange(draft, draft.log.at(-1)!.id, LATER)).toBe(true);
    expect(snapshot(draft)).toBe(before);
    expect(draft.results[id]!.state).toBe("onCourt");
  });
});

describe("withdrawals", () => {
  it("turns a group entry's remaining games into walkovers, and its played results stand", () => {
    const draft = live();
    const category = draft.categories[0]!;
    play(draft, group("A", 1, 2), [21, 15]); // e1 beat e2
    const before = snapshot(draft);
    expect(planWithdrawal(draft, "e1", "stand")).toEqual({ ok: true, stage: "group", walkovers: [group("A", 1, 3)], voided: [] });
    expect(withdrawEntry(draft, { entryId: "e1", results: "stand", now: LATER })).toEqual({ ok: true });
    expect(draft.withdrawn.e1).toEqual({ at: LATER, stage: "group", results: "stand" });
    expect(draft.results[group("A", 1, 3)]).toMatchObject({ state: "finished", award: { winner: 1, reason: "walkover" } });
    expect(draft.log.at(-1)).toMatchObject({ kind: "withdrawal", text: "Entry 1 withdrew from Mixed doubles: 1 game given as a walkover" });
    const table = groupTable(draft, category, 0)!;
    // Its win over e2 still counts for and against; it's last whatever its record.
    expect(table.rows.map((r) => r.id)).toEqual(["e3", "e2", "e1"]);
    expect(table.rows.find((r) => r.id === "e2")).toMatchObject({ played: 1, lost: 1 });
    expect(groupStatus(table, table.rows[2]!)).toBe("withdrawn");
    // Only what it changed is kept: the one walkover and the mark.
    expect(Object.keys(draft.log.at(-1)!.before).sort()).toEqual([`results/${group("A", 1, 3)}`, "withdrawn/e1"]);
    reverseChange(draft, draft.log.at(-1)!.id, LATER);
    expect(snapshot(draft)).toBe(before);
  });

  it("voids all a group entry's results", () => {
    const draft = live();
    const category = draft.categories[0]!;
    play(draft, group("A", 1, 2), [21, 15]);
    expect(planWithdrawal(draft, "e1", "void")).toEqual({ ok: true, stage: "group", walkovers: [], voided: [group("A", 1, 2)] });
    withdrawEntry(draft, { entryId: "e1", results: "void", now: LATER });
    expect(draft.log.at(-1)!.text).toBe("Entry 1 withdrew from Mixed doubles: its 1 game already played no longer count");
    let table = groupTable(draft, category, 0)!;
    // Only e2 v e3 counts now, and it hasn't been played.
    expect(table).toMatchObject({ played: 0, total: 1, complete: false });
    expect(table.rows.find((r) => r.id === "e2")).toMatchObject({ played: 0, lost: 0 });
    play(draft, group("A", 2, 3), [21, 19]);
    table = groupTable(draft, category, 0)!;
    expect(table.complete).toBe(true);
    expect(table.rows.map((r) => [r.id, groupStatus(table, r)])).toEqual([
      ["e2", "through"],
      ["e3", "through"],
      ["e1", "withdrawn"],
    ]);
    // The knockout's sides are known once the whole group stage has been played.
    expect(entryForSlot(draft, "c1", "Runner-up A")).toBeNull();
    play(draft, group("B", 1, 2), [12, 21]);
    play(draft, group("B", 1, 3), [9, 21]);
    play(draft, group("B", 2, 3), [18, 21]);
    expect(entryForSlot(draft, "c1", "Runner-up A")?.id).toBe("e3");
  });

  it("gives a knockout entry's next game away, and the bronze match after a semi-final", () => {
    const draft = live();
    const category = draft.categories[0]!;
    playGroups(draft);
    // e1 (Winner A) withdraws before its semi-final against e5.
    expect(planWithdrawal(draft, "e1", "stand")).toEqual({ ok: true, stage: "knockout", walkovers: [ko("SF1")], voided: [] });
    withdrawEntry(draft, { entryId: "e1", results: "stand", now: LATER });
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e5", loser: "e1" });
    // As the semi-final's loser it would play for bronze: that is given away too, whoever it turns out to be against.
    expect(draft.results[ko("Bronze")]).toMatchObject({ state: "finished", award: { winner: 1, reason: "walkover" } });
    expect(draft.log.at(-1)!.text).toBe("Entry 1 withdrew from Mixed doubles: 2 games given as walkovers");
    // The group table is untouched: its group had finished.
    const table = groupTable(draft, category, 0)!;
    expect(table.rows.map((r) => r.id)).toEqual(["e1", "e2", "e3"]);
    expect(groupStatus(table, table.rows[0]!)).toBe("through");
  });

  it("refuses while the entry is on court, or has already withdrawn", () => {
    const draft = live();
    setScore(draft, group("A", 1, 2), 0, 0, 5, NOW);
    expect(withdrawEntry(draft, { entryId: "e1", results: "stand", now: NOW })).toEqual({
      ok: false,
      reason: "It has a game on court. Finish or award that game first.",
    });
    expect(withdrawEntry(draft, { entryId: "e3", results: "stand", now: NOW })).toEqual({ ok: true });
    expect(withdrawEntry(draft, { entryId: "e3", results: "stand", now: NOW })).toMatchObject({ ok: false });
  });
});

describe("score corrections", () => {
  it("logs a corrected score with both scores, and not a first-time one", () => {
    const draft = live();
    const id = group("A", 1, 2);
    setScore(draft, id, 0, 0, 21, NOW);
    setScore(draft, id, 0, 1, 15, NOW);
    finishMatch(draft, id, NOW);
    expect(draft.log).toHaveLength(1);
    const before = snapshot(draft);

    reopenGame(draft, id);
    setScore(draft, id, 0, 0, 15, NOW);
    setScore(draft, id, 0, 1, 21, NOW);
    finishMatch(draft, id, LATER, "sheet misread");
    expect(draft.log.at(-1)).toMatchObject({
      kind: "correction",
      text: "Group A, Entry 1 v Entry 2: corrected from 21–15 to 15–21; Entry 2 now win it",
      note: "sheet misread",
    });
    expect(draft.results[id]!.was).toBeUndefined();
    reverseChange(draft, draft.log.at(-1)!.id, LATER);
    expect(snapshot(draft)).toBe(before);
  });

  it("doesn't log a match reopened and finished with the same score", () => {
    const draft = live();
    play(draft, group("A", 1, 2), [21, 15]);
    reopenGame(draft, group("A", 1, 2));
    finishMatch(draft, group("A", 1, 2), LATER);
    expect(draft.log).toHaveLength(1);
  });

  it("names the later games whose sides the correction changed", () => {
    const draft = live();
    playGroups(draft);
    setScore(draft, ko("SF1"), 0, 0, 21, NOW, ["e1", "e5"]);
    setScore(draft, ko("SF1"), 0, 1, 17, NOW, ["e1", "e5"]);
    finishMatch(draft, ko("SF1"), NOW);
    reopenGame(draft, group("A", 1, 2));
    setScore(draft, group("A", 1, 2), 0, 0, 15, NOW);
    setScore(draft, group("A", 1, 2), 0, 1, 21, NOW);
    finishMatch(draft, group("A", 1, 2), LATER);
    expect(sidesChanged(draft, "c1", ko("SF1"), "Winner A", "Runner-up B")).toBe(true);
    expect(draft.log.at(-1)!.text).toBe(
      "Group A, Entry 1 v Entry 2: corrected from 21–15 to 15–21; Entry 2 now win it. Sides changed since they were played: Semi-final 1",
    );
  });
});

describe("court moves", () => {
  it("logs a move, and won't move a game that has started", () => {
    const draft = live();
    const id = group("A", 1, 2);
    expect(moveGame(draft, { matchId: id, fromCourtId: "c1", target: { courtId: "c2", before: null }, now: NOW })).toBe(true);
    expect(draft.matchMoves[id]).toEqual({ courtId: "c2", before: null });
    expect(draft.log.at(-1)).toMatchObject({ kind: "move", text: "Group A, Entry 1 v Entry 2: moved from Court 1 to Court 2" });
    moveGame(draft, { matchId: group("A", 1, 3), fromCourtId: "c2", target: { courtId: "c2", before: id }, now: NOW });
    expect(draft.log.at(-1)!.text).toBe("Group A, Entry 1 v Entry 3: moved in Court 2's order, to before Group A");
    setScore(draft, group("A", 2, 3), 0, 0, 3, NOW);
    expect(moveGame(draft, { matchId: group("A", 2, 3), fromCourtId: "c1", target: { courtId: "c2", before: null }, now: NOW })).toBe(false);
  });

  it("reverses the latest move first", () => {
    const draft = live();
    moveGame(draft, { matchId: group("A", 1, 2), fromCourtId: "c1", target: { courtId: "c2", before: null }, now: NOW });
    const afterFirst = snapshot(draft);
    moveGame(draft, { matchId: group("A", 1, 3), fromCourtId: "c1", target: { courtId: "c2", before: null }, now: NOW });
    const [, first, second] = draft.log;
    expect(canReverse(draft, first!.id)).toBe(false);
    expect(reversalBlockedBy(draft, first!.id)?.id).toBe(second!.id);
    expect(reverseChange(draft, first!.id, LATER)).toBe(false);
    expect(reverseChange(draft, second!.id, LATER)).toBe(true);
    expect(snapshot(draft)).toBe(afterFirst);
    expect(reverseChange(draft, first!.id, LATER)).toBe(true);
    expect(draft.matchMoves).toEqual({});
  });
});

describe("a tie decided by hand", () => {
  it("orders a level group, fills the knockout, and can be reversed", () => {
    const draft = live();
    const category = draft.categories[0]!;
    draft.rules.tiebreaks = ["matchesWon", "pointDifference", "headToHead"];
    play(draft, group("A", 1, 2), [21, 15]);
    play(draft, group("A", 2, 3), [21, 15]);
    play(draft, group("A", 1, 3), [15, 21]);
    play(draft, group("B", 1, 2), [12, 21]);
    play(draft, group("B", 1, 3), [9, 21]);
    play(draft, group("B", 2, 3), [18, 21]);
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
    decideTie(draft, { categoryId: "c1", group: 0, order: ["e3", "e1", "e2"], note: "coin toss", now: LATER });
    expect(draft.log.at(-1)).toMatchObject({
      kind: "decision",
      text: "Group A: level entries placed by hand: 1. Entry 3; 2. Entry 1; 3. Entry 2",
      note: "coin toss",
    });
    const table = groupTable(draft, category, 0)!;
    expect(table.rows.map((r) => [r.id, groupStatus(table, r)])).toEqual([
      ["e3", "through"],
      ["e1", "through"],
      ["e2", "out"],
    ]);
    expect(entryForSlot(draft, "c1", "Winner A")?.id).toBe("e3");
    reverseChange(draft, draft.log.at(-1)!.id, LATER);
    expect(draft.decided).toEqual({});
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
  });
});

describe("starting the tournament, and games starting by themselves", () => {
  // Group A on court c1, group B on c2: e1 v e2 then e1 v e3; e4 v e5 then e4 v e6.
  const games = [
    { id: group("A", 1, 2), courtId: "c1", from: 540, match: { categoryId: "c1", home: "A1", away: "A2" } },
    { id: group("A", 1, 3), courtId: "c1", from: 555, match: { categoryId: "c1", home: "A1", away: "A3" } },
    { id: group("B", 1, 2), courtId: "c2", from: 540, match: { categoryId: "c1", home: "B1", away: "B2" } },
    { id: group("B", 1, 3), courtId: "c2", from: 555, match: { categoryId: "c1", home: "B1", away: "B3" } },
  ];
  const arrive = (draft: PlanDraft, ...ids: string[]) => {
    for (const e of draft.entries) if (ids.includes(e.id)) for (const p of e.players) p.attendance = "arrived";
  };
  const on = (draft: PlanDraft) => games.filter((g) => draft.results[g.id]?.state === "onCourt").map((g) => g.id);

  it("logs the start once, with how late it was", () => {
    const draft = live();
    expect(startReadyGames(draft, games, NOW)).toBe(0);
    expect(startTournament(draft, { now: NOW, at: "09:20", late: 20 })).toBe(true);
    expect(draft.startedAt).toBe(NOW);
    expect(draft.log.at(-1)).toMatchObject({ kind: "start", text: "The tournament started at 09:20, 20 minutes after the plan", by: "Desk" });
    expect(startTournament(draft, { now: LATER, at: "10:00", late: 60 })).toBe(false);
    expect(draft.log.filter((l) => l.kind === "start")).toHaveLength(1);
    const other = live();
    startTournament(other, { now: NOW, at: "09:00", late: 0 });
    expect(other.log.at(-1)!.text).toBe("The tournament started at 09:00, on time");
  });

  it("puts each court's first game on court where its players are all in, and holds the rest back", () => {
    const draft = live();
    arrive(draft, "e1", "e2", "e4");
    startTournament(draft, { now: NOW, at: "09:00", late: 0 });
    expect(startReadyGames(draft, games, NOW)).toBe(1);
    expect(on(draft)).toEqual([group("A", 1, 2)]);
    expect(draft.results[group("A", 1, 2)]!.sides).toEqual(["e1", "e2"]);
    // Court c2's game waits for e5: checking them in lets it start.
    expect(holding(draft, games[2]!, playingNow(draft, games))).toBe("missing");
    arrive(draft, "e5");
    expect(startReadyGames(draft, games, NOW)).toBe(1);
    expect(on(draft)).toEqual([group("A", 1, 2), group("B", 1, 2)]);
  });

  it("starts the next game when one finishes, but not with a player still on another court", () => {
    const draft = live();
    arrive(draft, "e1", "e2", "e3", "e4", "e5", "e6");
    startTournament(draft, { now: NOW, at: "09:00", late: 0 });
    startReadyGames(draft, games, NOW);
    play(draft, group("A", 1, 2), [21, 15]);
    expect(startReadyGames(draft, games, LATER)).toBe(1);
    expect(on(draft)).toEqual([group("A", 1, 3), group("B", 1, 2)]);

    // Moved onto c1 behind e1's game, B1 v B3 would need e4, who is on c2: it waits, held by nothing but that.
    const waiting = { ...games[3]!, courtId: "c3" };
    expect(holding(draft, waiting, playingNow(draft, [...games, waiting]))).toBe("busy");
    expect(startReadyGames(draft, [...games.slice(0, 3), waiting], LATER)).toBe(0);
    // A knockout game with no sides yet isn't started either.
    expect(holding(draft, { id: ko("SF1"), courtId: "c3", from: 600, match: { categoryId: "c1", home: "Winner A", away: "Runner-up B" } }, new Set())).toBe("unknown");
  });

  it("opens a tournament saved before it could be started as not started", () => {
    const saved: Partial<PlanDraft> = live();
    delete saved.startedAt;
    expect(normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]).startedAt).toBeNull();
  });
});

describe("a level knockout tie decided by hand", () => {
  /** A team tournament, two rubbers a tie: the groups played, then the first semi-final (e1 v e5) left one rubber each on the same scores. */
  function levelSemi(): PlanDraft {
    const draft = live();
    const category = draft.categories[0]!;
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

  it("is nobody's until the desk puts a side through; then the next round fills, and it can be reversed", () => {
    const draft = levelSemi();
    const category = draft.categories[0]!;
    expect(knockoutLevel(draft, category, "SF1")).toEqual({ home: "e1", away: "e5", decided: null });
    expect(levelKnockoutTies(draft)).toEqual([{ categoryId: "c1", code: "SF1", home: "e1", away: "e5" }]);
    expect(knockoutOutcome(draft, category, "SF1")).toBeNull();
    expect(entryForSlot(draft, "c1", "Winner SF1")).toBeNull();
    // Only one of its two sides can be put through.
    expect(decideKnockout(draft, { categoryId: "c1", code: "SF1", winnerId: "e2", now: LATER })).toBe(false);
    expect(decideKnockout(draft, { categoryId: "c1", code: "SF1", winnerId: "e5", note: "deciding game", now: LATER })).toBe(true);
    expect(draft.log.at(-1)).toMatchObject({
      kind: "decision",
      text: "Semi-final 1, Entry 1 v Entry 5: ended level; Entry 5 put through by hand",
      note: "deciding game",
    });
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e5", loser: "e1" });
    expect(entryForSlot(draft, "c1", "Winner SF1")?.id).toBe("e5");
    expect(entryForSlot(draft, "c1", "Loser SF1")?.id).toBe("e1");
    expect(levelKnockoutTies(draft)).toEqual([]);
    expect(knockoutLevel(draft, category, "SF1")).toMatchObject({ decided: "e5" });
    reverseChange(draft, draft.log.at(-1)!.id, LATER);
    expect(draft.decided).toEqual({});
    expect(knockoutOutcome(draft, category, "SF1")).toBeNull();
  });

  it("gives way to the scores once a correction means the tie is no longer level", () => {
    const draft = levelSemi();
    const category = draft.categories[0]!;
    decideKnockout(draft, { categoryId: "c1", code: "SF1", winnerId: "e5", now: LATER });
    reopenGame(draft, "c1:ko:SF1:r2");
    setScore(draft, "c1:ko:SF1:r2", 0, 0, 16, NOW);
    finishGame(draft, "c1:ko:SF1:r2", NOW);
    // 21–15 and 16–21: level on rubbers and games, e1 ahead by a point.
    expect(knockoutLevel(draft, category, "SF1")).toBeNull();
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e1", loser: "e5" });
  });

  it("can't decide a match the scores decide, or one not finished", () => {
    const draft = levelSemi();
    expect(decideKnockout(draft, { categoryId: "c1", code: "SF2", winnerId: "e6", now: LATER })).toBe(false);
    play(draft, "c1:ko:SF2:r1", [21, 10]);
    play(draft, "c1:ko:SF2:r2", [21, 10]);
    expect(decideKnockout(draft, { categoryId: "c1", code: "SF2", winnerId: "e2", now: LATER })).toBe(false);
    expect(draft.decided).toEqual({});
  });
});
