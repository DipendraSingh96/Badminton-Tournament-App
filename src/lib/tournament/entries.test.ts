import { describe, expect, it } from "vitest";
import { entriesFromRows, parseDelimited } from "./csv";
import { effectiveCategory, emptyDraft, emptyEntry, entryName, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import {
  entryForSlot,
  groupIndexOf,
  importedEntries,
  lineUpComplete,
  playersFor,
  repeatedSeeds,
  rubberPlayers,
  rubbersOf,
} from "./entries";
import { parsePlan } from "./schema";
import { normaliseDraft } from "./storage";

describe("parseDelimited", () => {
  it("reads commas, quotes and doubled quotes", () => {
    expect(parseDelimited('Name,Player 1\n"Smash, Bros","Ann ""A"" Lee"\n')).toEqual([
      ["Name", "Player 1"],
      ["Smash, Bros", 'Ann "A" Lee'],
    ]);
  });

  it("reads tab-separated rows pasted from a spreadsheet, skipping blank lines", () => {
    expect(parseDelimited("Team A\tAnn\tRaj\r\n\r\nTeam B\tBo\tCy")).toEqual([
      ["Team A", "Ann", "Raj"],
      ["Team B", "Bo", "Cy"],
    ]);
  });
});

describe("entriesFromRows", () => {
  const categories = [
    { id: "md", name: "Men's doubles" },
    { id: "xd", name: "Mixed doubles" },
  ];

  it("maps columns by their heading", () => {
    const rows = parseDelimited("Category,Name,Player 1,Player 2,External,Seed\nmixed doubles,,Ann,Raj,yes,1");
    expect(entriesFromRows(rows, categories)).toEqual({
      entries: [{ categoryId: "xd", name: "", players: ["Ann", "Raj"], external: true, seed: 1 }],
      problems: [],
    });
  });

  it("takes name then players when there's no heading, with one category", () => {
    const { entries } = entriesFromRows(parseDelimited("Smashers\tAnn\tRaj"), [categories[0]!]);
    expect(entries).toEqual([{ categoryId: "md", name: "Smashers", players: ["Ann", "Raj"], external: false, seed: null }]);
  });

  it("reports rows it can't read instead of guessing", () => {
    const rows = parseDelimited("Category,Name,Seed\nDoubles,A,\nMen's doubles,,\nMen's doubles,B,first\n,C,");
    expect(entriesFromRows(rows, categories).problems).toEqual([
      'Row 2: no category called "Doubles"',
      "Row 3: no name or players",
      'Row 4: the seed "first" isn\'t a whole number from 1',
      "Row 5: say which category it's in",
    ]);
  });
});

/** A plan past the Plan stage, with entries drawn into groups. */
function drawn(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "draw";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({
    ...emptyEntry(category.id, 2),
    id: `e${i + 1}`,
    name: `Entry ${i + 1}`,
    external: i < 2,
  }));
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  return draft;
}

describe("entries in the plan", () => {
  it("uses the real entries in place of the expected numbers past the Plan stage", () => {
    const draft = drawn();
    const category = draft.categories[0]!;
    expect(effectiveCategory(draft, category)).toMatchObject({ expectedEntries: 6, expectedExternal: 2 });
    const parsed = parsePlan(draft);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.inputs.categories[0]!.expectedEntries).toBe(6);
    draft.stage = "plan";
    expect(effectiveCategory(draft, category).expectedEntries).toBe(category.expectedEntries);
  });

  it("finds who holds a draw slot", () => {
    const draft = drawn();
    const id = draft.categories[0]!.id;
    expect(entryForSlot(draft, id, "A2")?.id).toBe("e2");
    expect(entryForSlot(draft, id, "B1")?.id).toBe("e4");
    expect(entryForSlot(draft, id, "C1")).toBeNull();
    expect(entryForSlot(draft, id, "Winner A")).toBeNull();
    expect(groupIndexOf("G27")).toBe(26);
  });

  it("names an entry by its name, or its players", () => {
    const entry = emptyEntry("c", 2);
    expect(entryName(entry)).toBeNull();
    entry.players[0]!.name = "Ann";
    entry.players[1]!.name = "Raj";
    expect(entryName(entry)).toBe("Ann / Raj");
    entry.name = "Smashers";
    expect(entryName(entry)).toBe("Smashers");
  });

  it("lists who plays a rubber by the team's line-up", () => {
    const team = emptyEntry("c", 3);
    team.players.forEach((p, i) => (p.name = ["Ann", "Raj", "Bo"][i]!));
    team.lineUp = { "1": [team.players[0]!.id, team.players[2]!.id] };
    expect(rubberPlayers(team, 1)).toEqual(["Ann", "Bo"]);
    expect(rubberPlayers(team, 2)).toEqual([]);
  });

  it("gives a plan saved before entries none, still in the Plan stage", () => {
    const saved: Partial<PlanDraft> = emptyDraft("Europe/London");
    delete saved.stage;
    delete saved.entries;
    delete saved.draw;
    const draft = normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]);
    expect(draft).toMatchObject({ stage: "plan", entries: [], draw: {} });
  });
});

describe("team entries", () => {
  function teamDraft() {
    const draft = completeDraft();
    draft.unit = "team";
    const category = draft.categories[0]!;
    category.lineUp = { MS: 1, WS: null, MD: 2, WD: null, XD: null, OPEN: null };
    return { draft, category };
  }

  it("numbers a tie's rubbers in event order, as the schedule does", () => {
    const { category } = teamDraft();
    expect(rubbersOf(category)).toEqual([
      { number: 1, event: "MS", players: 1 },
      { number: 2, event: "MD", players: 2 },
      { number: 3, event: "MD", players: 2 },
    ]);
  });

  it("starts a team with enough players for every rubber, and a pair with two", () => {
    const { draft, category } = teamDraft();
    expect(playersFor(draft, category)).toBe(5);
    const pairs = completeDraft();
    expect(playersFor(pairs, pairs.categories[0]!)).toBe(2);
  });

  it("knows when a team's line-up is complete", () => {
    const { draft, category } = teamDraft();
    const team = emptyEntry(category.id, 5);
    const [a, b, c, d, e] = team.players.map((p) => p.id);
    team.lineUp = { "1": [a!], "2": [b!, c!] };
    expect(lineUpComplete(draft, team, category)).toBe(false);
    team.lineUp["3"] = [d!, e!];
    expect(lineUpComplete(draft, team, category)).toBe(true);
  });

  it("finds repeated seeds", () => {
    const entries = [1, 2, 1, null].map((seed) => ({ ...emptyEntry("c", 2), seed }));
    expect([...repeatedSeeds(entries)]).toEqual([1]);
  });

  it("turns imported rows into entries with the players their event needs", () => {
    const draft = completeDraft();
    const category = draft.categories[0]!;
    const [entry] = importedEntries(draft, [{ categoryId: category.id, name: "", players: ["Ann"], external: true, seed: 2 }]);
    expect(entry!.players.map((p) => p.name)).toEqual(["Ann", ""]);
    expect(entry).toMatchObject({ external: true, seed: 2, categoryId: category.id });
  });
});
