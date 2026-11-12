import { describe, expect, it } from "vitest";
import { duplicateDraft, emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { autoChecklist, daysText, daysToGo, kitList, playerMessage, posterPrompt, rulebook, scoringText, sheetDesigns } from "./resources";
import { normaliseDraft } from "./storage";

/** Sixteen pairs entered and drawn into four groups of four. */
function drawn(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "draw";
  draft.name = "Club Open";
  const id = draft.categories[0]!.id;
  draft.entries = Array.from({ length: 16 }, (_, i) => {
    const entry = { ...emptyEntry(id, 2), id: `e${i + 1}` };
    entry.players.forEach((p, n) => (p.name = `Player ${i + 1}.${n + 1}`));
    return entry;
  });
  draft.draw[id] = { groups: [0, 1, 2, 3].map((g) => [0, 1, 2, 3].map((p) => `e${g * 4 + p + 1}`)), randomSeed: 1, locked: false };
  return draft;
}

const row = (draft: PlanDraft, counts: { sheets: number; shuttles: number | null }, key: string) => kitList(draft, counts).find((r) => r.key === key)!;

describe("kit list", () => {
  it("counts shuttles, and tubes rounded up where tubes are set", () => {
    const draft = drawn();
    expect(row(draft, { sheets: 31, shuttles: 40 }, "shuttles")).toMatchObject({ label: "Shuttles", quantity: 40, fix: "budget" });
    draft.finance.shuttlesPerTube = 12;
    expect(row(draft, { sheets: 31, shuttles: 40 }, "shuttles")).toMatchObject({ label: "Shuttle tubes", quantity: 4, detail: "40 shuttles, in tubes of 12", fix: null });
    expect(row(draft, { sheets: 31, shuttles: 36 }, "shuttles").quantity).toBe(3);
    // Until the plan can be worked out there is nothing to count.
    expect(row(draft, { sheets: 0, shuttles: null }, "shuttles")).toMatchObject({ quantity: null, fix: "budget" });
  });

  it("counts a score sheet a match, and what each court needs", () => {
    const draft = drawn();
    expect(row(draft, { sheets: 31, shuttles: 40 }, "sheets")).toMatchObject({ quantity: 31, detail: "One A4 page a match; print a few spare" });
    expect(row(draft, { sheets: 0, shuttles: 40 }, "sheets").fix).toBe("schedule");
    // The sample venue: two courts, with one and two umpires.
    expect(row(draft, { sheets: 31, shuttles: 40 }, "pens").quantity).toBe(2);
    expect(row(draft, { sheets: 31, shuttles: 40 }, "chairs").quantity).toBe(3);
  });
});

describe("automatic checklist", () => {
  const state = { scheduled: 31, fits: true };
  const open = (draft: PlanDraft, s = state) => autoChecklist(draft, s).filter((i) => !i.done).map((i) => i.key);

  it("leaves only locking the draw open once everything else is ready", () => {
    const draft = drawn();
    expect(open(draft)).toEqual(["locked"]);
    draft.draw[draft.categories[0]!.id]!.locked = true;
    expect(open(draft)).toEqual([]);
    expect(autoChecklist(draft, state).some((i) => i.key === "lineUps")).toBe(false);
  });

  it("says what is missing and where it is put right", () => {
    const draft = drawn();
    draft.frame.date = "";
    draft.entries[0]!.players[1]!.name = " ";
    delete draft.draw[draft.categories[0]!.id];
    const items = autoChecklist(draft, { scheduled: 0, fits: false });
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by.date).toMatchObject({ done: false, open: "The date isn't set", fix: "plan" });
    expect(by.players).toMatchObject({ done: false, open: "1 entry has a player with no name", fix: "entries" });
    expect(by.drawn).toMatchObject({ done: false, fix: "draw" });
    expect(by.locked!.open).toBe("Draw every category first");
    expect(by.scheduled!.done).toBe(false);
    expect(by.fits).toMatchObject({ done: false, open: "The games don't fit the hours booked" });
    draft.entries = [];
    expect(autoChecklist(draft, state).find((i) => i.key === "entries")).toMatchObject({ done: false, fix: "entries" });
  });

  it("asks for line-ups in a team tournament", () => {
    const draft = drawn();
    draft.unit = "team";
    expect(autoChecklist(draft, state).some((i) => i.key === "lineUps")).toBe(true);
  });

  it("counts the days to go", () => {
    expect(daysToGo("2026-11-14", "2026-11-11")).toBe(3);
    expect(daysToGo("", "2026-11-11")).toBeNull();
    expect([3, 1, 0, -1, -2, null].map(daysText)).toEqual(["3 days to go", "Tomorrow", "Today", "Yesterday", "2 days ago", "The date isn't set"]);
  });
});

describe("rulebook", () => {
  const rules = { pointsPerGame: 21, deuce: "standard" as const, deuceLimit: 30, bestOf: 1 as const, minutesPerGame: 12, changeoverMinutes: 3 };

  it("says each stage's scoring in words", () => {
    expect(scoringText(rules)).toBe("One game to 21. At 20–20 a game is won by two clear points, up to 30: at 29–29 the next point wins.");
    expect(scoringText({ ...rules, bestOf: 3, deuce: "cap", deuceLimit: 25 })).toBe(
      "Best of three games to 21. At 20–20 a game is won by two clear points, up to 25: at 24–24 the next point wins.",
    );
    expect(scoringText({ ...rules, deuce: "none", deuceLimit: null })).toBe("One game to 21. The first to 21 wins the game.");
    expect(scoringText({ ...rules, pointsPerGame: null })).toBeNull();
  });

  it("is written from the stored settings", () => {
    const draft = drawn();
    const { sections, missing } = rulebook(draft, "Feather shuttles only.\n\n  Non-marking shoes.  ");
    expect(missing).toEqual([]);
    expect(sections.map((s) => s.title)).toEqual(["Format", "Scoring", "How groups are ranked", "Walkovers, withdrawals and retirements", "From the organiser"]);
    const text = (title: string) => sections.find((s) => s.title === title)!.lines;
    expect(text("Format")).toEqual([
      "16 entries in 4 groups of 4; everyone in a group plays each other, and the top 2 of each group go through to a knockout of 8, with a match for third place.",
    ]);
    // The final is best of three; the other stages score alike and are said once.
    expect(text("Scoring")).toEqual([
      "Group stage, knockout rounds, bronze match: One game to 21. At 20–20 a game is won by two clear points, up to 30: at 29–29 the next point wins.",
      "Final: Best of three games to 21. At 20–20 a game is won by two clear points, up to 30: at 29–29 the next point wins.",
    ]);
    expect(text("How groups are ranked").slice(1)).toEqual([
      "1. Matches won: the most matches won.",
      "2. Point difference: points won less points lost.",
      "3. Head-to-head: the result between the entries that are level.",
      "4. Draw of lots: drawn by lot.",
    ]);
    expect(text("Walkovers, withdrawals and retirements")[0]).toContain("straight games");
    expect(text("Walkovers, withdrawals and retirements")[1]).toContain("remaining games are walkovers");
    expect(text("From the organiser")).toEqual(["Feather shuttles only.", "Non-marking shoes."]);
    // Never money.
    expect(JSON.stringify(sections)).not.toMatch(/£|fee|prize/i);
  });

  it("follows the other rule choices, and lists what isn't set", () => {
    const draft = drawn();
    draft.rules.walkover = "winOnly";
    draft.rules.withdrawal = "byesThenVoid";
    draft.rules.eligibility.maxCategoriesPerPerson = 2;
    draft.rules.handicap = { enabled: true, mixedVsMens: 3, womensVsMens: null, womensVsMixed: 1 };
    let made = rulebook(draft, "");
    const lines = made.sections.flatMap((s) => s.lines).join(" ");
    expect(lines).toContain("no games or points counted");
    expect(lines).toContain("all its results removed");
    expect(lines).toContain("A player may enter at most 2 categories.");
    expect(lines).toContain("A mixed pair against a men's pair starts each game 3 points up.");
    expect(lines).toContain("A women's pair against a mixed pair starts each game 1 point up.");
    expect(made.sections.some((s) => s.title === "From the organiser")).toBe(false);

    draft.rules.walkover = null;
    draft.rules.tiebreaks = [];
    made = rulebook(draft, "");
    expect(made.missing).toEqual(["The order groups are ranked by isn't set", "How a walkover is scored isn't set"]);
  });
});

describe("message to players, and saved tournaments", () => {
  it("gives the day, the times and what is attached, and no money", () => {
    const message = playerMessage(drawn(), "09:00");
    expect(message.split("\n")[0]).toBe("Club Open, Saturday 4 July 2026");
    expect(message).toContain("The venue opens at 09:00. The first games start at 09:00.");
    expect(message).toContain("for all 16 entries");
    expect(message).not.toMatch(/£/);
  });

  it("opens a tournament saved before the Resources page with nothing prepared", () => {
    const saved: Partial<PlanDraft> = drawn();
    delete saved.resources;
    expect(normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]).resources).toEqual({
      houseRules: "",
      checklist: [],
      kit: [],
      packed: [],
      venue: "",
      howToEnter: "",
      ownSheet: null,
    });
    // One saved before the poster fields gains them.
    const older = drawn();
    delete (older.resources as Partial<PlanDraft["resources"]>).venue;
    expect(normaliseDraft(older as Parameters<typeof normaliseDraft>[0]).resources.venue).toBe("");
  });

  it("copies a tournament's own lists unticked", () => {
    const draft = drawn();
    draft.resources = {
      houseRules: "Feather shuttles only.",
      checklist: [{ id: "a", text: "Book first aider", done: true }],
      kit: [{ id: "b", text: "Spare nets", quantity: 2, packed: true }],
      packed: ["shuttles"],
      venue: "",
      howToEnter: "",
      ownSheet: null,
    };
    expect(duplicateDraft(draft).resources).toEqual({
      houseRules: "Feather shuttles only.",
      checklist: [{ id: "a", text: "Book first aider", done: false }],
      kit: [{ id: "b", text: "Spare nets", quantity: 2, packed: false }],
      packed: [],
      venue: "",
      howToEnter: "",
      ownSheet: null,
    });
  });
});

describe("score sheets by stage", () => {
  const games = [
    ...Array.from({ length: 24 }, () => ({ categoryId: "c1", stage: "group" })),
    ...Array.from({ length: 6 }, () => ({ categoryId: "c1", stage: "knockout" })),
    { categoryId: "c1", stage: "bronze" },
    { categoryId: "c1", stage: "final" },
  ];

  it("needs one design for stages scored alike, and another for a best-of-three final", () => {
    const designs = sheetDesigns(drawn(), games);
    expect(designs.map((d) => [d.uses, d.matches, d.bestOf, d.target, d.limit])).toEqual([
      [["Mixed doubles: group stage, knockout rounds, bronze match"], 31, 1, 21, 30],
      [["Mixed doubles: final"], 1, 3, 21, 30],
    ]);
    expect(designs[0]!.categoryIds).toEqual(["c1"]);
  });

  it("stops the point boxes at the points per game without a deuce rule", () => {
    const draft = drawn();
    const rules = draft.categories[0]!.stageRules!;
    for (const stage of ["group", "knockout", "bronze", "final"] as const) rules[stage] = { ...rules[stage], deuce: "none", deuceLimit: null, bestOf: 1 };
    const designs = sheetDesigns(draft, games);
    expect(designs).toHaveLength(1);
    expect(designs[0]).toMatchObject({ target: 21, limit: 21, matches: 32, uses: ["Mixed doubles: group stage, knockout rounds, bronze match, final"] });
    rules.group = { ...rules.group, deuce: "cap", deuceLimit: 25 };
    expect(sheetDesigns(draft, games).find((d) => d.uses[0]!.endsWith("group stage"))).toMatchObject({ limit: 25, matches: 24 });
  });

  it("shares a design between categories scored alike", () => {
    const draft = drawn();
    draft.categories.push({ ...structuredClone(draft.categories[0]!), id: "c2", name: "Advanced" });
    const designs = sheetDesigns(draft, [...games, { categoryId: "c2", stage: "group" }]);
    expect(designs[0]).toMatchObject({ categoryIds: ["c1", "c2"], matches: 32 });
    expect(designs[0]!.uses).toEqual(["Mixed doubles: group stage, knockout rounds, bronze match", "Advanced: group stage"]);
  });
});

describe("poster prompt", () => {
  it("carries what a poster needs, with blanks for what only the organiser knows", () => {
    const draft = drawn();
    const prompt = posterPrompt(draft, { firstGame: "09:00", money: true });
    expect(prompt).toContain("Tournament: Club Open");
    expect(prompt).toContain("Date: Saturday 4 July 2026");
    expect(prompt).toContain("Doors open 09:00, first games 09:00");
    expect(prompt).toContain("Venue: [venue name and address]");
    expect(prompt).toContain("- Mixed doubles, entry £10 per player; prizes: Winners £50");
    expect(prompt).toContain("Format: groups, then a knockout");
    draft.resources.venue = "Riverside Sports Hall, Mill Lane";
    draft.resources.howToEnter = "Message Sam by 1 July";
    const filled = posterPrompt(draft, { firstGame: "09:00", money: true });
    expect(filled).toContain("Venue: Riverside Sports Hall, Mill Lane");
    expect(filled).toContain("How to enter: Message Sam by 1 July");
  });

  it("leaves money out while the tournament is Live, and an unticked prize always", () => {
    const draft = drawn();
    expect(posterPrompt(draft, { firstGame: null, money: false })).not.toMatch(/£|prize/i);
    draft.finance.prizes[0]!.off = true;
    expect(posterPrompt(draft, { firstGame: null, money: true })).not.toMatch(/prizes:/);
  });
});
