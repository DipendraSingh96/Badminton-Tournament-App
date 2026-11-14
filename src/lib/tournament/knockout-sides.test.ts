import { describe, expect, it } from "vitest";
import { knockoutBracket } from "@/engine";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { categoryFormatOf, entryForSlot, groupStatus, groupTable, groupTables, knockoutOutcome, sideName, sidesChanged } from "./entries";
import { finishGame, reopenGame, setScore } from "./live";

const NOW = "2026-07-04T09:00:00.000Z";

/** Six entries drawn into two groups of three; the top two of each go through. */
function drawn(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "live";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({ ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` }));
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  return draft;
}

/** Plays a one-game match to a finish, keeping who played it. */
function play(draft: PlanDraft, id: string, score: [number, number], sides?: [string, string]) {
  setScore(draft, id, 0, 0, score[0], NOW, sides);
  setScore(draft, id, 0, 1, score[1], NOW, sides);
  finishGame(draft, id, NOW);
}

const group = (letter: string, a: number, b: number) => `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`;
const ko = (code: string) => `c1:ko:${code}:r1`;

/** Group A: e1 beats both, e2 beats e3. Group B: e6 beats both, e5 beats e4. */
function playGroups(draft: PlanDraft) {
  play(draft, group("A", 1, 2), [21, 15]);
  play(draft, group("A", 1, 3), [21, 10]);
  play(draft, group("A", 2, 3), [21, 19]);
  play(draft, group("B", 1, 2), [12, 21]);
  play(draft, group("B", 1, 3), [9, 21]);
  play(draft, group("B", 2, 3), [18, 21]);
}

describe("knockout sides from results", () => {
  it("keeps everyone in contention, and the knockout unnamed, until a group has finished", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    play(draft, group("A", 1, 2), [21, 15]);
    play(draft, group("A", 1, 3), [21, 10]);
    const table = groupTable(draft, category, 0)!;
    expect(table).toMatchObject({ played: 2, total: 3, complete: false, qualify: 2 });
    expect(table.rows.map((r) => r.id)).toEqual(["e1", "e2", "e3"]);
    expect(table.rows.map((r) => groupStatus(table, r))).toEqual(["contention", "contention", "contention"]);
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
    // "If it ended now" reads the table as it stands.
    expect(entryForSlot(draft, "c1", "Winner A", { provisional: true })?.id).toBe("e1");
  });

  it("doesn't count a match that's on court", () => {
    const draft = drawn();
    setScore(draft, group("A", 1, 2), 0, 0, 21, NOW);
    setScore(draft, group("A", 1, 2), 0, 1, 15, NOW);
    expect(groupTable(draft, draft.categories[0]!, 0)).toMatchObject({ played: 0 });
  });

  it("names a finished group's places, through and out", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    playGroups(draft);
    const [a, b] = groupTables(draft, category);
    expect(a!.rows.map((r) => [r.id, groupStatus(a!, r)])).toEqual([
      ["e1", "through"],
      ["e2", "through"],
      ["e3", "out"],
    ]);
    expect(b!.rows.map((r) => r.id)).toEqual(["e6", "e5", "e4"]);
    expect(sideName(draft, "c1", "Winner A")).toBe("Entry 1");
    expect(sideName(draft, "c1", "Runner-up A")).toBe("Entry 2");
    expect(sideName(draft, "c1", "Winner B")).toBe("Entry 6");
    expect(sideName(draft, "c1", "Runner-up B")).toBe("Entry 5");
    expect(entryForSlot(draft, "c1", "3rd A")?.id).toBe("e3");
  });

  it("uses the draw of lots when everything else is level, and says so when there's none", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    // A ring with the same score each time: level on wins, points and head-to-head.
    play(draft, group("A", 1, 2), [21, 15]);
    play(draft, group("A", 2, 3), [21, 15]);
    play(draft, group("A", 1, 3), [15, 21]);
    // Group B is played too: the knockout's sides are known once the whole group stage is.
    play(draft, group("B", 1, 2), [12, 21]);
    play(draft, group("B", 1, 3), [9, 21]);
    play(draft, group("B", 2, 3), [18, 21]);
    const byLots = groupTable(draft, category, 0)!;
    expect(byLots.rows.every((r) => !r.shared)).toBe(true);
    expect(groupTable(draft, category, 0)!.rows.map((r) => r.id)).toEqual(byLots.rows.map((r) => r.id));
    expect(entryForSlot(draft, "c1", "Winner A")?.id).toBe(byLots.rows[0]!.id);

    draft.rules.tiebreaks = ["matchesWon", "pointDifference", "headToHead"];
    const level = groupTable(draft, category, 0)!;
    expect(level.rows.map((r) => groupStatus(level, r))).toEqual(["level", "level", "level"]);
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
  });

  it("knows no knockout side until every group game of the competition has been played", () => {
    const draft = drawn();
    play(draft, group("A", 1, 2), [21, 15]);
    play(draft, group("A", 1, 3), [21, 10]);
    play(draft, group("A", 2, 3), [21, 19]);
    // Group A is finished, group B isn't: the knockout waits.
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
    expect(entryForSlot(draft, "c1", "Winner A", { provisional: true })?.id).toBe("e1");
    play(draft, group("B", 1, 2), [12, 21]);
    play(draft, group("B", 1, 3), [9, 21]);
    expect(entryForSlot(draft, "c1", "Winner A")).toBeNull();
    play(draft, group("B", 2, 3), [18, 21]);
    expect(entryForSlot(draft, "c1", "Winner A")?.id).toBe("e1");
  });

  it("plays a whole tournament through: groups, semi-finals, bronze and final", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    playGroups(draft);
    const format = categoryFormatOf(draft, category);
    if (!format.ok) throw new Error(format.message);
    const bracket = knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);
    const semis = bracket.rounds.find((r) => r.size === 4)!.matches;
    expect(semis.map((m) => [m.home, m.away])).toEqual([
      ["Winner A", "Runner-up B"],
      ["Winner B", "Runner-up A"],
    ]);
    const sides = (home: string, away: string): [string, string] => [entryForSlot(draft, "c1", home)!.id, entryForSlot(draft, "c1", away)!.id];

    expect(entryForSlot(draft, "c1", "Winner SF1")).toBeNull();
    play(draft, ko("SF1"), [21, 17], sides("Winner A", "Runner-up B")); // e1 beats e5
    play(draft, ko("SF2"), [19, 21], sides("Winner B", "Runner-up A")); // e2 beats e6
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e1", loser: "e5" });
    expect(entryForSlot(draft, "c1", "Winner SF1")?.id).toBe("e1");
    expect(entryForSlot(draft, "c1", "Winner SF2")?.id).toBe("e2");
    expect(entryForSlot(draft, "c1", "Loser SF1")?.id).toBe("e5");
    expect(entryForSlot(draft, "c1", "Loser SF2")?.id).toBe("e6");

    play(draft, ko("Bronze"), [21, 12], sides("Loser SF1", "Loser SF2"));
    expect(knockoutOutcome(draft, category, "Bronze")?.winner).toBe("e5");

    // The final is best of three: e2 takes it in three games.
    const final = sides("Winner SF1", "Winner SF2");
    expect(final).toEqual(["e1", "e2"]);
    const scores: [number, number][] = [[21, 18], [15, 21], [19, 21]];
    scores.forEach(([home, away], g) => {
      setScore(draft, ko("Final"), g, 0, home, NOW, final);
      setScore(draft, ko("Final"), g, 1, away, NOW, final);
    });
    expect(knockoutOutcome(draft, category, "Final")).toBeNull();
    finishGame(draft, ko("Final"), NOW);
    expect(knockoutOutcome(draft, category, "Final")).toEqual({ winner: "e2", loser: "e1" });
  });

  it("flags a knockout match whose sides a later correction changed, and keeps who really played it", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    playGroups(draft);
    play(draft, ko("SF1"), [21, 17], ["e1", "e5"]);
    expect(sidesChanged(draft, "c1", ko("SF1"), "Winner A", "Runner-up B")).toBe(false);

    // Group A's first match is corrected: e2 beat e1 after all, so e2 wins the group.
    reopenGame(draft, group("A", 1, 2));
    setScore(draft, group("A", 1, 2), 0, 0, 15, NOW);
    setScore(draft, group("A", 1, 2), 0, 1, 21, NOW);
    finishGame(draft, group("A", 1, 2), NOW);
    expect(entryForSlot(draft, "c1", "Winner A")?.id).toBe("e2");
    expect(sidesChanged(draft, "c1", ko("SF1"), "Winner A", "Runner-up B")).toBe(true);
    // The semi-final's winner is still who played and won it.
    expect(knockoutOutcome(draft, category, "SF1")).toEqual({ winner: "e1", loser: "e5" });
    // A match never started isn't flagged.
    expect(sidesChanged(draft, "c1", ko("SF2"), "Winner B", "Runner-up A")).toBe(false);
  });

  it("decides a team tie by its rubbers", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    draft.unit = "team";
    category.lineUp = { ...category.lineUp, MD: 2, XD: 1 };
    const tie = "c1:group:A:A1-A2";
    for (const [r, score] of [[21, 10], [12, 21], [19, 21]].entries()) {
      setScore(draft, `${tie}:r${r + 1}`, 0, 0, score[0]!, NOW);
      setScore(draft, `${tie}:r${r + 1}`, 0, 1, score[1]!, NOW);
      if (r < 2) finishGame(draft, `${tie}:r${r + 1}`, NOW);
    }
    // Two rubbers finished of three: the tie isn't counted yet.
    expect(groupTable(draft, category, 0)).toMatchObject({ played: 0 });
    finishGame(draft, `${tie}:r3`, NOW);
    const table = groupTable(draft, category, 0)!;
    expect(table.played).toBe(1);
    expect(table.rows[0]).toMatchObject({ id: "e2", won: 1, rubbersWon: 2 });
    expect(table.rows.find((r) => r.id === "e1")).toMatchObject({ lost: 1, rubbersWon: 1 });
  });

  it("has no tables for knockout only, and no knockout for groups only", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    draft.format = "knockout";
    expect(groupTables(draft, category)).toEqual([]);
    draft.format = "groups";
    playGroups(draft);
    const table = groupTable(draft, category, 0)!;
    expect(table.rows.map((r) => groupStatus(table, r))).toEqual(["winner", "placed", "placed"]);
    expect(knockoutOutcome(draft, category, "Final")).toBeNull();
  });
});
