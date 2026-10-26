import { emptyCategory, emptyDraft, type PlanDraft } from "./draft";

// A complete sample plan for tests. Sample values live only in test files.

export function completeDraft(): PlanDraft {
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
        multipleRates: true,
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
