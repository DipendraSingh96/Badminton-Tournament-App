import { describe, expect, it } from "vitest";
import { costPerShuttle, defaultCategoryName, emptyCategory, emptyDraft, emptyPrize, removeCategory } from "./draft";
import { normaliseDraft } from "./storage";

function draftWith(events: ("MD" | "XD")[]) {
  const draft = emptyDraft("Europe/London");
  draft.unit = "individual";
  draft.categories = events.map((event, i) => ({ ...emptyCategory(), id: `c${i + 1}`, event }));
  return draft;
}

describe("defaultCategoryName", () => {
  it("numbers repeated events from the second", () => {
    const draft = draftWith(["MD", "XD", "MD", "MD"]);
    expect(draft.categories.map((_, i) => defaultCategoryName(draft, i))).toEqual([
      "Men's doubles",
      "Mixed doubles",
      "Men's doubles 2",
      "Men's doubles 3",
    ]);
  });
});

describe("removeCategory", () => {
  it("also removes the category from prizes and eligibility rules", () => {
    const draft = draftWith(["MD", "XD", "MD"]);
    draft.finance.prizes = [emptyPrize("c1"), emptyPrize("c2")];
    draft.rules.eligibility.exclusivePairs = [
      { id: "x1", first: "c1", second: "c2" },
      { id: "x2", first: "c2", second: "c3" },
    ];
    draft.rules.eligibility.membersOnly = ["c1", "c3"];
    removeCategory(draft, "c1");
    expect(draft.categories.map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(draft.finance.prizes.map((p) => p.categoryId)).toEqual(["c2"]);
    expect(draft.rules.eligibility.exclusivePairs.map((p) => p.id)).toEqual(["x2"]);
    expect(draft.rules.eligibility.membersOnly).toEqual(["c3"]);
  });
});


describe("normaliseDraft", () => {
  it("keeps a price saved as cost per shuttle, per shuttle, and starts other money in empty", () => {
    const { finance } = emptyDraft("Europe/London");
    const early = { shuttlesPerGame: finance.shuttlesPerGame, prizes: [], otherCosts: [], costPerShuttle: 2.5 };
    const draft = normaliseDraft({ ...emptyDraft("Europe/London"), finance: early });
    expect(draft.finance).toMatchObject({ shuttlePriceBasis: "shuttle", shuttlePrice: 2.5, otherIncome: [] });
    expect(draft.finance).not.toHaveProperty("costPerShuttle");
    expect(costPerShuttle(draft.finance)).toBe(2.5);
  });

  it("leaves a current draft as it is", () => {
    const current = emptyDraft("Europe/London");
    current.finance = { ...current.finance, shuttlePriceBasis: "tube", shuttlePrice: 24, shuttlesPerTube: 12 };
    expect(normaliseDraft(current).finance).toEqual(current.finance);
    expect(costPerShuttle(current.finance)).toBe(2);
  });
});
