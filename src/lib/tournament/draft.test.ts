import { describe, expect, it } from "vitest";
import { defaultCategoryName, emptyCategory, emptyDraft, emptyPrize, removeCategory } from "./draft";

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

