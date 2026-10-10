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
    startTime: "09:00",
    endTime: "17:00",
    courtWindows: [
      { id: "w1", from: "09:00", to: "13:00", courts: 6 },
      { id: "w2", from: "13:00", to: "17:00", courts: 4 },
    ],
    umpires: 6,
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
    expect(result.inputs.frame.start).toBe("2026-07-04T08:00:00.000Z");
    expect(result.inputs.frame.courtWindows[1]!.from).toBe("2026-07-04T12:00:00.000Z");
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

  it("rejects overlapping court windows and a deuce maximum below the target", () => {
    const draft = completeDraft();
    draft.frame.courtWindows[1]!.from = "12:00";
    draft.stageRules.group.deuceLimit = 21;
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: ["frame", "courtWindows", 1, "from"],
      message: "Court windows must not overlap",
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
    category.playersPerTeam = 7;
    const result = parsePlan(draft);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.inputs.categories[0]!.entry).toEqual({
      type: "team",
      lineUp: [
        { event: "MS", count: 3 },
        { event: "MD", count: 2 },
      ],
      playersPerTeam: 7,
    });
  });

  it("asks a team event for a name, a line-up and a squad size", () => {
    const draft = completeDraft();
    draft.unit = "team";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain("Name is required");
    expect(messages).toContain("Add at least one rubber to the line-up");
    expect(messages).toContain("Players per team is required");
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
});
