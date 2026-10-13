import { describe, expect, it } from "vitest";
import { costPerShuttle, defaultCategoryName, emptyCategory, emptyDraft, emptyPrize, emptyHall, removeCategory, setHallWindow } from "./draft";
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

describe("normaliseDraft halls", () => {
  it("gives halls saved before unit time a unit of 60 minutes, keeping per-hour rates", () => {
    const saved = emptyDraft("Europe/London");
    const halls = saved.frame.halls.map((h) => ({ id: h.id, name: h.name, from: h.from, to: h.to, bands: h.bands, courts: h.courts }));
    const draft = normaliseDraft({ ...saved, frame: { ...saved.frame, halls } });
    expect(draft.frame.halls[0]!.unitMinutes).toBe(60);
  });

  it("keeps a new hall's unit empty", () => {
    expect(normaliseDraft(emptyDraft("Europe/London")).frame.halls[0]!.unitMinutes).toBeNull();
  });
});

describe("setHallWindow", () => {
  function twoBands() {
    const hall = emptyHall();
    hall.from = "09:00";
    hall.to = "18:00";
    hall.bands = [
      { id: "b1", name: "Off-peak", from: "09:00", to: "15:00", rate: 8 },
      { id: "b2", name: "Peak", from: "15:00", to: "18:00", rate: 10 },
    ];
    hall.courts = [
      { id: "c1", from: null, to: null, umpires: 1 },
      { id: "c2", from: "10:00", to: "14:00", umpires: 1 },
    ];
    return hall;
  }

  it("shifts bands and narrowed courts when the whole window moves", () => {
    const hall = twoBands();
    setHallWindow(hall, "09:40", "18:40");
    expect(hall.bands.map((b) => [b.from, b.to])).toEqual([
      ["09:40", "15:40"],
      ["15:40", "18:40"],
    ]);
    expect(hall.courts[0]).toMatchObject({ from: null, to: null });
    expect(hall.courts[1]).toMatchObject({ from: "10:40", to: "14:40" });
  });

  it("carries only the bands on a moved edge", () => {
    const hall = twoBands();
    setHallWindow(hall, "08:20", "18:00");
    expect(hall.bands.map((b) => [b.from, b.to])).toEqual([
      ["08:20", "15:00"],
      ["15:00", "18:00"],
    ]);
    expect(hall.courts[1]).toMatchObject({ from: "10:00", to: "14:00" });
  });

  it("keeps a single band on the hall's hours, from first set to cleared", () => {
    const hall = emptyHall();
    setHallWindow(hall, "09:00", "15:40");
    expect(hall.bands[0]).toMatchObject({ from: "09:00", to: "15:40" });
    setHallWindow(hall, "", "");
    expect(hall.bands[0]).toMatchObject({ from: "", to: "" });
  });
});
