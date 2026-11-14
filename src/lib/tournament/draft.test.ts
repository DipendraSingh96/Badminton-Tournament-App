import { describe, expect, it } from "vitest";
import {
  costPerShuttle,
  defaultCategoryName,
  drawBand,
  removeBand,
  setBandTime,
  splitRates,
  canGoLive,
  newCategory,
  withOwnRules,
  categoryRules,
  steppedHallTime,
  emptyCategory,
  emptyDraft,
  emptyHall,
  emptyPrize,
  prizeFor,
  prizePlace,
  setPrizeOn,
  keepOneRate,
  moveZone,
  removeCategory,
  resetZone,
  setCourtGroup,
  setCourtTime,
  setHallWindow,
  shiftZone,
  steppedCourtTime,
  toggleUmpire,
  umpireSpots,
  zoneHall,
} from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { parsePlan } from "./schema";
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
    halls[0]!.bands = [...halls[0]!.bands, { id: "b2", name: "", from: "", to: "", rate: null }];
    const draft = normaliseDraft({ ...saved, frame: { ...saved.frame, halls } });
    expect(draft.frame.halls[0]!.unitMinutes).toBe(60);
    expect(draft.frame.halls[0]!.multipleRates).toBe(true);
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

describe("court hours on the court", () => {
  function hall() {
    const h = emptyHall();
    h.from = "09:00";
    h.to = "12:00";
    h.unitMinutes = 40;
    h.courts = [{ id: "c1", from: null, to: null, umpires: 1 }];
    return h;
  }

  it("steps a court's time by the hall's unit, within the hall's hours", () => {
    const h = hall();
    const court = h.courts[0]!;
    expect(steppedCourtTime(h, court, "from", 1)).toBe("09:40");
    expect(steppedCourtTime(h, court, "from", -1)).toBeNull();
    expect(steppedCourtTime(h, court, "to", -1)).toBe("11:20");
    expect(steppedCourtTime(h, court, "to", 1)).toBeNull();
  });

  it("keeps at least one unit between start and end", () => {
    const h = hall();
    const court = { ...h.courts[0]!, from: "10:20", to: "11:00" };
    expect(steppedCourtTime(h, court, "from", 1)).toBeNull();
    expect(steppedCourtTime(h, court, "to", -1)).toBeNull();
  });

  it("can't step without the hall's unit or hours", () => {
    const h = hall();
    h.unitMinutes = null;
    expect(steppedCourtTime(h, h.courts[0]!, "from", 1)).toBeNull();
  });

  it("follows the hall again when stepped back to the hall's time", () => {
    const h = hall();
    const court = h.courts[0]!;
    setCourtTime(h, court, "from", "09:40");
    expect(court.from).toBe("09:40");
    setCourtTime(h, court, "from", "09:00");
    expect(court.from).toBeNull();
  });
});

describe("umpire spots", () => {
  it("fills spots in order for courts saved with a count only", () => {
    expect(umpireSpots({ id: "c", from: null, to: null, umpires: 2 })).toEqual(["topLeft", "topRight"]);
    expect(umpireSpots({ id: "c", from: null, to: null, umpires: null })).toEqual([]);
  });

  it("toggles any spot and keeps the count in step", () => {
    const court = { id: "c", from: null, to: null, umpires: null as number | null };
    toggleUmpire(court, "netRight");
    toggleUmpire(court, "topLeft");
    expect(court).toMatchObject({ umpires: 2, umpireSpots: ["topLeft", "netRight"] });
    toggleUmpire(court, "topLeft");
    toggleUmpire(court, "netRight");
    expect(court).toMatchObject({ umpires: 0, umpireSpots: [] });
  });
});

describe("normaliseDraft moves", () => {
  it("gives a draft saved before moves none", () => {
    const saved: Partial<ReturnType<typeof emptyDraft>> = emptyDraft("Europe/London");
    delete saved.zoneMoves;
    delete saved.matchMoves;
    const draft = normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]);
    expect(draft.zoneMoves).toEqual({});
    expect(draft.matchMoves).toEqual({});
  });

  it("keeps groups on their own courts in a draft saved before the setting", () => {
    const saved: Partial<ReturnType<typeof emptyDraft>> = emptyDraft("Europe/London");
    delete saved.groupCourts;
    delete saved.courtGroups;
    const draft = normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]);
    expect(draft.groupCourts).toBe("own");
    expect(draft.courtGroups).toEqual({});
  });
});

describe("setCourtGroup", () => {
  it("gives a court to a group, and back to the automatic split", () => {
    const draft = emptyDraft("Europe/London");
    setCourtGroup(draft, "k1", "c1:0");
    expect(draft.courtGroups).toEqual({ k1: "c1:0" });
    setCourtGroup(draft, "k1", "");
    expect(draft.courtGroups).toEqual({ k1: "" });
    setCourtGroup(draft, "k1", null);
    expect(draft.courtGroups).toEqual({});
  });
});

describe("keepOneRate", () => {
  it("keeps the first band's rate across the hall's hours", () => {
    const hall = emptyHall();
    hall.from = "09:00";
    hall.to = "18:00";
    hall.multipleRates = true;
    hall.bands = [
      { id: "b1", name: "Off-peak", from: "09:00", to: "15:00", rate: 8 },
      { id: "b2", name: "Peak", from: "15:00", to: "18:00", rate: 10 },
    ];
    keepOneRate(hall);
    expect(hall.bands).toEqual([{ id: "b1", name: "Off-peak", from: "09:00", to: "18:00", rate: 8 }]);
    expect(hall.multipleRates).toBe(false);
  });
});

describe("bands set the hall's hours", () => {
  function hall() {
    const h = emptyHall();
    h.multipleRates = true;
    return h;
  }

  it("draws the first band into the empty one, then adds more, and the hours span them", () => {
    const h = hall();
    const first = drawBand(h, "09:00", "13:00");
    expect(h.bands).toHaveLength(1);
    expect(h.bands[0]!.id).toBe(first);
    expect([h.from, h.to]).toEqual(["09:00", "13:00"]);
    drawBand(h, "13:00", "19:00");
    expect(h.bands).toHaveLength(2);
    expect([h.from, h.to]).toEqual(["09:00", "19:00"]);
  });

  it("follows a band's edited time, and waits while one is half typed", () => {
    const h = hall();
    drawBand(h, "09:00", "19:00");
    setBandTime(h, 0, "to", "13:00");
    expect([h.from, h.to]).toEqual(["09:00", "13:00"]);
    setBandTime(h, 0, "to", "");
    expect([h.from, h.to]).toEqual(["09:00", "13:00"]);
  });

  it("shrinks when a band is removed, and has no hours once the last is emptied", () => {
    const h = hall();
    drawBand(h, "09:00", "13:00");
    drawBand(h, "13:00", "19:00");
    removeBand(h, 1);
    expect([h.from, h.to]).toEqual(["09:00", "13:00"]);
    removeBand(h, 0);
    expect(h.bands).toHaveLength(1);
    expect([h.from, h.to, h.bands[0]!.from]).toEqual(["", "", ""]);
  });

  it("starts from the hall's hours when rates begin to change", () => {
    const h = emptyHall();
    h.from = "09:00";
    h.to = "19:00";
    splitRates(h);
    expect(h.multipleRates).toBe(true);
    expect(h.bands[0]).toMatchObject({ from: "09:00", to: "19:00" });
  });
});

describe("rules per category", () => {
  const scored = { pointsPerGame: 21, deuce: "none" as const, deuceLimit: null, bestOf: 1 as const, minutesPerGame: 12, changeoverMinutes: 3 };

  it("starts a new category with a copy of the first category's rules", () => {
    const draft = draftWith(["MD"]);
    draft.categories[0]!.stageRules = { group: scored, knockout: scored, bronze: scored, final: { ...scored, bestOf: 3 } };
    const added = newCategory(draft);
    expect(added.stageRules).toEqual(draft.categories[0]!.stageRules);
    // A copy: changing one leaves the other.
    added.stageRules!.group.pointsPerGame = 15;
    expect(draft.categories[0]!.stageRules!.group.pointsPerGame).toBe(21);
  });

  it("gives a plan saved with one set of rules a copy for each category", () => {
    const saved = draftWith(["MD", "XD"]);
    saved.stageRules.group = scored;
    expect(categoryRules(saved, saved.categories[0]!).group).toEqual(scored);
    const opened = withOwnRules(saved);
    expect(opened.categories.map((c) => c.stageRules!.group)).toEqual([scored, scored]);
    expect(opened.categories[0]!.stageRules!.group).not.toBe(opened.categories[1]!.stageRules!.group);
    // Already its own: left as it is.
    expect(withOwnRules(opened)).toBe(opened);
  });
});

describe("canGoLive", () => {
  it("needs every category's draw made and locked", () => {
    const draft = draftWith(["MD", "XD"]);
    expect(canGoLive(draft)).toBe(false);
    draft.draw.c1 = { groups: [[]], randomSeed: 1, locked: true };
    expect(canGoLive(draft)).toBe(false);
    draft.draw.c2 = { groups: [[]], randomSeed: 1, locked: false };
    expect(canGoLive(draft)).toBe(false);
    draft.draw.c2.locked = true;
    expect(canGoLive(draft)).toBe(true);
  });

  it("is never possible with no categories", () => {
    expect(canGoLive(emptyDraft("Europe/London"))).toBe(false);
  });
});

describe("steppedHallTime", () => {
  it("moves a time by the hall's unit, keeping the hall a unit long and within the day", () => {
    const hall = { ...emptyHall(), from: "09:00", to: "10:00", unitMinutes: 40 };
    expect(steppedHallTime(hall, "from", -1)).toBe("08:20");
    expect(steppedHallTime(hall, "to", 1)).toBe("10:40");
    // 09:40 would leave less than a unit.
    expect(steppedHallTime(hall, "from", 1)).toBeNull();
    expect(steppedHallTime({ ...hall, from: "00:20" }, "from", -1)).toBeNull();
    expect(steppedHallTime({ ...hall, to: "23:40" }, "to", 1)).toBeNull();
  });

  it("can't move without a unit or a time", () => {
    expect(steppedHallTime({ ...emptyHall(), from: "09:00", to: "10:00" }, "from", 1)).toBeNull();
    expect(steppedHallTime({ ...emptyHall(), unitMinutes: 30 }, "to", 1)).toBeNull();
  });
});

describe("normaliseDraft hall zones", () => {
  it("carries a dragged zone's start into zone moves and drops earlier windows", () => {
    const saved: Partial<ReturnType<typeof emptyDraft>> = emptyDraft("Europe/London");
    const hallId = saved.frame!.halls[0]!.id;
    delete saved.zoneMoves;
    delete saved.matchMoves;
    const draft = normaliseDraft({
      ...(saved as Parameters<typeof normaliseDraft>[0]),
      stageWindows: {
        [`${hallId}:group`]: { from: "09:00", to: "11:00" },
        group: { from: "09:00", to: "11:00" },
        "wave:2": { from: "09:30", to: "10:00" },
      },
    });
    expect(draft.zoneMoves).toEqual({ [`${hallId}:group`]: { start: "09:00", hallId: null } });
    expect(draft).not.toHaveProperty("stageWindows");
  });
});

describe("zone moves", () => {
  function threeHalls() {
    const draft = emptyDraft("Europe/London");
    draft.frame.halls = [emptyHall(), emptyHall(), emptyHall()].map((h, i) => ({ ...h, id: `h${i + 1}` }));
    return draft;
  }

  it("moves a zone to another hall and back, keeping the record tidy", () => {
    const draft = threeHalls();
    moveZone(draft, "h2", "h1", "knockout");
    expect(zoneHall(draft, "h2", "knockout")).toBe("h1");
    expect(draft.zoneMoves).toEqual({ "h2:knockout": { start: null, hallId: "h1" } });
    // The zone shown in Hall 1 now holds both; moving it to Hall 3 takes both.
    moveZone(draft, "h1", "h3", "knockout");
    expect(zoneHall(draft, "h1", "knockout")).toBe("h3");
    expect(zoneHall(draft, "h2", "knockout")).toBe("h3");
    resetZone(draft, "h3", "knockout");
    expect(draft.zoneMoves).toEqual({});
  });

  it("shifts a zone's start and resets it", () => {
    const draft = threeHalls();
    shiftZone(draft, "h1", "group", "10:30");
    expect(draft.zoneMoves).toEqual({ "h1:group": { start: "10:30", hallId: null } });
    shiftZone(draft, "h1", "group", null);
    expect(draft.zoneMoves).toEqual({});
  });

  it("keeps one start for a stage, whichever hall it is dragged in", () => {
    const draft = threeHalls();
    shiftZone(draft, "h1", "knockout", "13:00");
    shiftZone(draft, "h2", "knockout", "14:00");
    expect(draft.zoneMoves).toEqual({ "h2:knockout": { start: "14:00", hallId: null } });
    // A zone moved to another hall keeps that; only the start is the stage's.
    moveZone(draft, "h3", "h1", "knockout");
    shiftZone(draft, "h1", "knockout", "15:00");
    expect(draft.zoneMoves).toEqual({ "h1:knockout": { start: "15:00", hallId: null }, "h3:knockout": { start: null, hallId: "h1" } });
    resetZone(draft, "h2", "knockout");
    expect(draft.zoneMoves).toEqual({ "h3:knockout": { start: null, hallId: "h1" } });
  });
});

describe("prizes by place", () => {
  it("reads a place however it was typed, and leaves other names alone", () => {
    expect(["Winner", "winners", "1st", "First"].map(prizePlace)).toEqual([0, 0, 0, 0]);
    expect(["2nd", "Runner-up", "runners up"].map(prizePlace)).toEqual([1, 1, 1]);
    expect(["3rd", "third", "Bronze"].map(prizePlace)).toEqual([2, 2, 2]);
    expect(["Best newcomer", "", "4th"].map(prizePlace)).toEqual([null, null, null]);
  });

  it("ticks and unticks a place, keeping an amount that was entered", () => {
    const draft = completeDraft();
    // The sample plan has a "Winners" prize of 50: that is its 1st.
    expect(prizeFor(draft, "c1", 0)).toMatchObject({ amount: 50 });
    setPrizeOn(draft, "c1", 1, true);
    expect(prizeFor(draft, "c1", 1)).toMatchObject({ position: "2nd", amount: null });
    // Unticked with no amount, it is forgotten.
    setPrizeOn(draft, "c1", 1, false);
    expect(prizeFor(draft, "c1", 1)).toBeUndefined();
    setPrizeOn(draft, "c1", 0, false);
    expect(prizeFor(draft, "c1", 0)).toMatchObject({ amount: 50, off: true });
    setPrizeOn(draft, "c1", 0, true);
    expect(prizeFor(draft, "c1", 0)).toEqual({ id: "p1", categoryId: "c1", position: "Winners", amount: 50 });
  });

  it("costs nothing, and needs nothing filled in, while unticked", () => {
    const draft = completeDraft();
    const prizes = () => {
      const parsed = parsePlan(draft);
      return parsed.ok ? parsed.inputs.finance.prizes : parsed.issues.map((i) => i.message);
    };
    expect(prizes()).toEqual([{ categoryId: "c1", position: "Winners", amount: 50 }]);
    setPrizeOn(draft, "c1", 0, false);
    expect(prizes()).toEqual([]);
    // A ticked place with no amount is still to fill in.
    setPrizeOn(draft, "c1", 2, true);
    expect(parsePlan(draft).ok).toBe(false);
    draft.finance.prizes.find((p) => p.position === "3rd")!.amount = 20;
    expect(prizes()).toEqual([{ categoryId: "c1", position: "3rd", amount: 20 }]);
  });
});
