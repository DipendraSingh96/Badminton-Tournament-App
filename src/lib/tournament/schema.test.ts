import { describe, expect, it } from "vitest";
import { emptyCategory, emptyDraft, type PlanDraft } from "./draft";
import { parsePlan } from "./schema";

function completeDraft(): PlanDraft {
  const draft = emptyDraft("Europe/London");
  draft.unit = "individual";
  draft.format = "groupsKnockout";
  draft.frame = {
    ...draft.frame,
    date: "2026-07-04",
    halls: [
      {
        id: "h1",
        name: "Main hall",
        from: "09:00",
        to: "17:00",
        unitMinutes: 60,
        bands: [
          { id: "b1", name: "Off-peak", from: "09:00", to: "13:00", rate: 12 },
          { id: "b2", name: "Peak", from: "13:00", to: "17:00", rate: 15 },
        ],
        courts: [
          { id: "c1", from: null, to: null, umpires: 1 },
          { id: "c2", from: "10:00", to: "16:00", umpires: 2 },
        ],
      },
    ],
    bufferMinutes: 30,
  };
  draft.categories = [
    {
      ...emptyCategory(),
      id: "c1",
      name: "",
      event: "XD",
      expectedEntries: 16,
      groupMode: "auto",
      groupCount: null,
      preferredGroupSize: 4,
      qualifiersPerGroup: 2,
      bronze: true,
      feeBasis: "player",
      feeAmount: 10,
      externalFeeAmount: 15,
      expectedExternal: 4,
    },
  ];
  draft.stageRules.group = {
    pointsPerGame: 21,
    deuce: "standard",
    deuceLimit: 30,
    bestOf: 1,
    minutesPerGame: 12,
    changeoverMinutes: 3,
  };
  draft.bestOfThreeAllowance = 33;
  draft.stageRules.knockout = { ...draft.stageRules.group };
  draft.stageRules.bronze = { ...draft.stageRules.group };
  draft.stageRules.final = { ...draft.stageRules.group, bestOf: 3 };
  draft.finance = {
    shuttlesPerGame: 1,
    shuttlePriceBasis: "shuttle",
    shuttlePrice: 2.5,
    shuttlesPerTube: null,
    prizes: [{ id: "p1", categoryId: "c1", position: "Winners", amount: 50 }],
    otherCosts: [
      { id: "o1", label: "Umpire food", type: "perPerson", amount: 8, basis: "umpires", count: null },
    ],
    otherIncome: [],
  };
  draft.rules.tiebreaks = ["matchesWon", "pointDifference", "headToHead", "drawOfLots"];
  draft.rules.withdrawal = "byesThenWalkovers";
  draft.rules.walkover = "straightGamesAtTarget";
  return draft;
}

describe("parsePlan", () => {
  it("lists what's missing from an empty draft", () => {
    const result = parsePlan(emptyDraft("Europe/London"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain("Date is required");
    expect(messages).toContain("Add at least one category");
    expect(messages).toContain("Add at least one tiebreak");
    expect(messages).toContain("Choose what happens when an entry withdraws");
    expect(messages).toContain("Choose the unit of play");
    expect(messages).toContain("Choose a format");
    expect(messages).toContain("Shuttles per game is required");
  });

  it("converts local times in the tournament's time zone to UTC", () => {
    const result = parsePlan(completeDraft());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    // British Summer Time is UTC+1.
    const [hall] = result.inputs.frame.halls;
    expect(hall!.from).toBe("2026-07-04T08:00:00.000Z");
    expect(hall!.bands[1]!.from).toBe("2026-07-04T12:00:00.000Z");
    // A court left on the hall's hours takes them; a narrowed court keeps its own.
    expect(hall!.courts[0]).toMatchObject({ from: "2026-07-04T08:00:00.000Z", to: "2026-07-04T16:00:00.000Z" });
    expect(hall!.courts[1]).toMatchObject({ from: "2026-07-04T09:00:00.000Z", umpires: 2 });
  });

  it("builds engine inputs", () => {
    const result = parsePlan(completeDraft());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories[0]!.groups).toEqual({ type: "auto", preferredSize: 4 });
    expect(result.inputs.categories[0]!.entry).toEqual({ type: "individual", event: "XD" });
    expect(result.inputs.categories[0]!.name).toBe("Mixed doubles");
    expect(result.inputs.stageRules.group!.deuce).toEqual({ type: "standard", max: 30 });
    expect(result.inputs.finance.otherCosts[0]).toMatchObject({ basis: "umpires" });
  });

  it("leaves out stages with no rules entered", () => {
    const draft = completeDraft();
    draft.stageRules.bronze = {
      pointsPerGame: null,
      deuce: null,
      deuceLimit: null,
      bestOf: null,
      minutesPerGame: null,
      changeoverMinutes: null,
    };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.stageRules.bronze).toBeUndefined();
  });

  it("rejects overlapping bands and a deuce maximum below the target", () => {
    const draft = completeDraft();
    draft.frame.halls[0]!.bands[1]!.from = "12:00";
    draft.stageRules.group.deuceLimit = 21;
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: ["frame", "halls", 0, "bands"],
      message: "Bands overlap from 12:00 to 13:00",
    });
    expect(result.issues).toContainEqual({
      path: ["stageRules", "group", "deuceLimit"],
      message: "Maximum points must be at least 22",
    });
  });

  it("builds a team line-up from the rubber counts", () => {
    const draft = completeDraft();
    draft.unit = "team";
    const category = draft.categories[0]!;
    category.name = "Club team cup";
    category.lineUp = { ...category.lineUp, MS: 3, MD: 2 };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories[0]!.entry).toEqual({
      type: "team",
      lineUp: [
        { event: "MS", count: 3 },
        { event: "MD", count: 2 },
      ],
    });
    expect(result.inputs.stageTiming.group).toEqual({ minutesPerGame: 12, changeoverMinutes: 3 });
  });

  it("asks a team event for a name and a line-up", () => {
    const draft = completeDraft();
    draft.unit = "team";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain("Name is required");
    expect(messages).toContain("Add at least one rubber to the line-up");
  });

  it("needs no group settings for knockout only", () => {
    const draft = completeDraft();
    draft.format = "knockout";
    const category = draft.categories[0]!;
    category.groupMode = null;
    category.preferredGroupSize = null;
    category.qualifiersPerGroup = null;
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories[0]!.groups).toBeUndefined();
    expect(result.inputs.format).toBe("knockout");
  });

  it("builds timing per stage", () => {
    const draft = completeDraft();
    draft.stageRules.final = { ...draft.stageRules.final, minutesPerGame: 15, changeoverMinutes: 5 };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.stageTiming.group).toEqual({ minutesPerGame: 12, changeoverMinutes: 3 });
    expect(result.inputs.stageTiming.final).toEqual({ minutesPerGame: 15, changeoverMinutes: 5 });
  });

  it("asks for timing on a stage that is started", () => {
    const draft = completeDraft();
    draft.stageRules.group = { ...draft.stageRules.group, minutesPerGame: null, changeoverMinutes: null };
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["stageRules", "group", "minutesPerGame"], message: "Minutes per game is required" },
      { path: ["stageRules", "group", "changeoverMinutes"], message: "Organising time is required" },
    ]);
  });

  it("ignores stages the format doesn't play, even half filled in", () => {
    const draft = completeDraft();
    draft.format = "groups";
    draft.stageRules.knockout = { ...draft.stageRules.knockout, minutesPerGame: null };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(Object.keys(result.inputs.stageRules)).toEqual(["group"]);
    expect(Object.keys(result.inputs.stageTiming)).toEqual(["group"]);
  });

  it("keeps external entries within the expected entries", () => {
    const draft = completeDraft();
    draft.categories[0]!.expectedExternal = 17;
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      {
        path: ["categories", 0, "expectedExternal"],
        message: "Of which external can't be more than expected entries",
      },
    ]);
  });

  it("asks a team event for expected teams", () => {
    const draft = completeDraft();
    draft.unit = "team";
    draft.categories[0]!.expectedEntries = null;
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.message)).toContain("Expected teams is required");
  });

  it("asks for a rate on every band, allowing zero", () => {
    const draft = completeDraft();
    draft.frame.halls[0]!.bands[0]!.rate = null;
    draft.frame.halls[0]!.bands[1]!.rate = 0;
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["frame", "halls", 0, "bands", 0, "rate"], message: "Rate is required" },
    ]);
  });

  it("reports a gap in the bands with its times", () => {
    const draft = completeDraft();
    draft.frame.halls[0]!.bands[1]!.from = "14:00";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["frame", "halls", 0, "bands"], message: "Bands leave 13:00 to 14:00 uncovered" },
    ]);
  });

  it("keeps a court within its hall's hours", () => {
    const draft = completeDraft();
    draft.frame.halls[0]!.courts[1]!.to = "18:00";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["frame", "halls", 0, "courts", 1, "from"], message: "Court hours must be within the hall's hours" },
    ]);
  });

  it("asks for the best-of-3 allowance only when a stage is best of 3", () => {
    const bestOfOne = completeDraft();
    bestOfOne.stageRules.final = { ...bestOfOne.stageRules.final, bestOf: 1 };
    bestOfOne.bestOfThreeAllowance = null;
    const plain = parsePlan(bestOfOne);
    if (!plain.ok) throw new Error(JSON.stringify(plain.issues));
    expect(plain.inputs.bestOfThreeAllowance).toBe(0);

    const draft = completeDraft();
    draft.bestOfThreeAllowance = null;
    const missing = parsePlan(draft);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.issues).toContainEqual({
      path: ["bestOfThreeAllowance"],
      message: "Best-of-3 allowance is required",
    });

    draft.bestOfThreeAllowance = 33;
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.bestOfThreeAllowance).toBeCloseTo(0.33);
  });

  it("builds the rules, with handicap off unless switched on", () => {
    const result = parsePlan(completeDraft());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.rules).toEqual({
      tiebreaks: ["matchesWon", "pointDifference", "headToHead", "drawOfLots"],
      handicap: { enabled: false },
      eligibility: { exclusivePairs: [], membersOnly: [], allowMixedMemberExternalPairs: false },
      withdrawal: "byesThenWalkovers",
      walkover: "straightGamesAtTarget",
    });
  });

  it("keeps draw of lots last and rubbers won to team events", () => {
    const draft = completeDraft();
    draft.rules.tiebreaks = ["drawOfLots", "rubbersWon"];
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["rules", "tiebreaks"], message: "Draw of lots can only be the last tiebreak" },
      { path: ["rules", "tiebreaks"], message: "Rubbers won applies to team events only" },
    ]);
  });

  it("asks for the Open doubles head starts only when handicap is on and Open doubles is played", () => {
    const draft = completeDraft();
    draft.rules.handicap.enabled = true;
    // Mixed doubles only: the handicap has nothing to apply to.
    const unused = parsePlan(draft);
    if (!unused.ok) throw new Error(JSON.stringify(unused.issues));
    expect(unused.inputs.rules.handicap).toEqual({ enabled: false });

    draft.categories[0]!.event = "OPEN";
    draft.rules.handicap.mixedVsMens = 2;
    draft.rules.handicap.womensVsMens = 4;
    const missing = parsePlan(draft);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.issues).toEqual([
      { path: ["rules", "handicap", "womensVsMixed"], message: "Women's vs mixed head start is required" },
    ]);

    draft.rules.handicap.womensVsMixed = 2;
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.rules.handicap).toEqual({
      enabled: true,
      mixedVsMens: 2,
      womensVsMens: 4,
      womensVsMixed: 2,
    });
  });

  it("checks eligibility rules against the categories", () => {
    const draft = completeDraft();
    draft.categories.push({ ...draft.categories[0]!, id: "c2", event: "MD" });
    draft.rules.eligibility.maxCategoriesPerPerson = 0;
    draft.rules.eligibility.exclusivePairs = [
      { id: "x1", first: "c1", second: "c2" },
      { id: "x2", first: "c2", second: "c1" },
      { id: "x3", first: "c1", second: "c1" },
      { id: "x4", first: "c1", second: null },
    ];
    draft.rules.eligibility.membersOnly = ["gone"];
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["rules", "eligibility", "maxCategoriesPerPerson"], message: "Most categories per person must be at least 1" },
      { path: ["rules", "eligibility", "exclusivePairs", 1], message: "This pair is already listed" },
      { path: ["rules", "eligibility", "exclusivePairs", 2], message: "Choose two different categories" },
      { path: ["rules", "eligibility", "exclusivePairs", 3], message: "Choose two categories" },
      { path: ["rules", "eligibility", "membersOnly"], message: "Members only lists a category that no longer exists" },
    ]);
  });

  it("names a second category of the same event with a number", () => {
    const draft = completeDraft();
    draft.categories.push({ ...draft.categories[0]!, id: "c2" });
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories.map((c) => c.name)).toEqual(["Mixed doubles", "Mixed doubles 2"]);
  });

  it("works out the cost per shuttle from a tube price", () => {
    const draft = completeDraft();
    draft.finance.shuttlePriceBasis = "tube";
    draft.finance.shuttlePrice = 24;
    const missing = parsePlan(draft);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.issues).toEqual([
      { path: ["finance", "shuttlesPerTube"], message: "Shuttles per tube is required" },
    ]);

    draft.finance.shuttlesPerTube = 12;
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.finance.costPerShuttle).toBe(2);
  });

  it("builds other money in, fixed or per person", () => {
    const draft = completeDraft();
    draft.finance.otherIncome = [
      { id: "s", label: "Sponsorship", type: "fixed", amount: 200, basis: null, count: null },
      { id: "t", label: "Tickets", type: "perPerson", amount: 3, basis: "custom", count: 40 },
      { id: "x", label: "", type: "perPerson", amount: 2, basis: null, count: null },
    ];
    const invalid = parsePlan(draft);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.issues).toEqual([
      { path: ["finance", "otherIncome", 2, "label"], message: "Income name is required" },
      { path: ["finance", "otherIncome", 2, "basis"], message: "Choose who the income is per" },
    ]);

    draft.finance.otherIncome.pop();
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.finance.otherIncome).toEqual([
      { id: "s", label: "Sponsorship", type: "fixed", amount: 200 },
      { id: "t", label: "Tickets", type: "perPerson", amount: 3, basis: "custom", count: 40 },
    ]);
  });

  it("keeps hire to whole units of the hall's unit time", () => {
    const draft = completeDraft();
    const hall = draft.frame.halls[0]!;
    hall.unitMinutes = 40;
    hall.from = "09:00";
    hall.to = "18:00";
    hall.bands = [
      { id: "b1", name: "Off-peak", from: "09:00", to: "15:40", rate: 8 },
      { id: "b2", name: "Peak", from: "15:40", to: "18:00", rate: 10 },
    ];
    hall.courts = [
      { id: "c1", from: null, to: null, umpires: 1 },
      { id: "c2", from: "10:00", to: null, umpires: 1 },
    ];
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: ["frame", "halls", 0, "to"], message: "Hall hours must be a whole number of 40-minute units" },
      {
        path: ["frame", "halls", 0, "courts", 1, "from"],
        message: "Court hours must be on 40-minute steps from 09:00, e.g. 09:40 or 10:20",
      },
    ]);

    hall.to = "18:20";
    hall.bands[1]!.to = "18:20";
    hall.courts[1]!.from = "10:20";
    const fixed = parsePlan(draft);
    if (!fixed.ok) throw new Error(JSON.stringify(fixed.issues));
    expect(fixed.inputs.frame.halls[0]!.unitMinutes).toBe(40);
    expect(fixed.inputs.frame.halls[0]!.bands[1]!.ratePerUnit).toBe(10);
  });

  it("asks for a band edge on a unit step", () => {
    const draft = completeDraft();
    draft.frame.halls[0]!.unitMinutes = 30;
    draft.frame.halls[0]!.bands[0]!.to = "13:10";
    draft.frame.halls[0]!.bands[1]!.from = "13:10";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: ["frame", "halls", 0, "bands", 0, "to"],
      message: "Band must start and end on 30-minute steps from 09:00, e.g. 09:30 or 10:00",
    });
  });

  it("pins the buffer: play ends by its start, and it ends by the last closing", () => {
    const draft = completeDraft();
    draft.frame.bufferStart = "16:45";
    const late = parsePlan(draft);
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.issues).toEqual([
      { path: ["frame", "bufferStart"], message: "Buffer must end by the last hall's closing time" },
    ]);

    draft.frame.bufferStart = "16:00";
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    // British Summer Time is UTC+1.
    expect(result.inputs.frame.bufferStart).toBe("2026-07-04T15:00:00.000Z");
  });

  it("converts pinned stage windows and checks they sit inside the day", () => {
    const draft = completeDraft();
    draft.stageWindows = { group: { from: "09:30", to: "12:00" }, "round:4": { from: "13:00", to: "13:40" } };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    // British Summer Time is UTC+1.
    expect(result.inputs.stageWindows).toEqual([
      { key: "group", from: "2026-07-04T08:30:00.000Z", to: "2026-07-04T11:00:00.000Z" },
      { key: "round:4", from: "2026-07-04T12:00:00.000Z", to: "2026-07-04T12:40:00.000Z" },
    ]);

    draft.stageWindows = { final: { from: "16:30", to: "17:30" } };
    const late = parsePlan(draft);
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.issues).toEqual([{ path: ["stageWindows", "final"], message: "Window must be within the day's hours" }]);
  });
});
