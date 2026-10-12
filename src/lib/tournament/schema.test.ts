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
  };
  draft.eventTiming.XD = { minutesPerGame: 12, changeoverMinutes: 3 };
  draft.bestOfThreeAllowance = 33;
  draft.stageRules.knockout = { ...draft.stageRules.group };
  draft.stageRules.bronze = { ...draft.stageRules.group };
  draft.stageRules.final = { ...draft.stageRules.group, bestOf: 3 };
  draft.finance = {
    shuttlesPerGame: 1,
    costPerShuttle: 2.5,
    prizes: [{ id: "p1", categoryId: "c1", position: "Winners", amount: 50 }],
    otherCosts: [
      { id: "o1", label: "Umpire food", type: "perPerson", amount: 8, basis: "umpires", count: null },
    ],
  };
  return draft;
}

describe("parsePlan", () => {
  it("lists what's missing from an empty draft", () => {
    const result = parsePlan(emptyDraft("Europe/London"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain("Date is required");
    expect(messages).toContain("Expected entries is required");
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
    draft.eventTiming.MS = { minutesPerGame: 15, changeoverMinutes: 3 };
    draft.eventTiming.MD = { minutesPerGame: 12, changeoverMinutes: 3 };
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories[0]!.entry).toEqual({
      type: "team",
      lineUp: [
        { event: "MS", count: 3 },
        { event: "MD", count: 2 },
      ],
    });
    expect(result.inputs.eventTiming).toEqual({
      MS: { minutesPerGame: 15, changeoverMinutes: 3 },
      MD: { minutesPerGame: 12, changeoverMinutes: 3 },
    });
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

  it("asks for timing only for events in use", () => {
    const draft = completeDraft();
    draft.eventTiming.XD = { minutesPerGame: null, changeoverMinutes: null };
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const timingIssues = result.issues.filter((i) => i.path[0] === "eventTiming");
    expect(timingIssues).toEqual([
      { path: ["eventTiming", "XD", "minutesPerGame"], message: "Minutes per game is required" },
      { path: ["eventTiming", "XD", "changeoverMinutes"], message: "Organising time is required" },
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
});
