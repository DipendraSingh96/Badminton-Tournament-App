import { describe, expect, it } from "vitest";
import { analyseTournament } from "./analyse";
import { hall } from "./fixtures.test-helpers";
import { suggestLevers } from "./levers";
import type { StageRules, TournamentInputs } from "./types";

const stage: StageRules = { pointsPerGame: 21, deuce: { type: "none" }, bestOf: 1 };
const timing = { minutesPerGame: 12, changeoverMinutes: 3 };

function tournament(): TournamentInputs {
  return {
    unit: "individual",
    format: "groupsKnockout",
    frame: {
      timeZone: "Europe/London",
      halls: [hall("h1", "08:00", "13:00", { courtCount: 4, rate: 10, umpires: 1 })],
      bufferMinutes: 0,
    },
    categories: [
      {
        id: "md",
        name: "Men's doubles",
        entry: { type: "individual", event: "MD" },
        expectedEntries: 12,
        groups: { type: "auto", preferredSize: 4 },
        qualifiersPerGroup: 2,
        bronze: false,
        fee: { basis: "entry", amount: 30, expectedExternal: 0 },
      },
    ],
    stageRules: { group: stage, knockout: stage, final: stage },
    stageTiming: { group: timing, knockout: timing, final: timing },
    bestOfThreeAllowance: 0,
    finance: {
      shuttlesPerGame: 1,
      costPerShuttle: 2,
      prizes: [],
      otherCosts: [{ id: "trophies", label: "Trophies", type: "fixed", amount: 200 }],
      otherIncome: [],
    },
    rules: {
      tiebreaks: ["matchesWon"],
      handicap: { enabled: false },
      eligibility: { exclusivePairs: [], membersOnly: [], allowMixedMemberExternalPairs: true },
      withdrawal: "byesThenWalkovers",
      walkover: "straightGamesAtTarget",
    },
  };
}

function levers(inputs: TournamentInputs) {
  const base = analyseTournament(inputs);
  if (!base.ok) throw new Error(JSON.stringify(base.errors));
  return { base: base.analysis, levers: suggestLevers(inputs, base.analysis) };
}

describe("suggestLevers", () => {
  it("finds the fee rise that breaks even, to the penny", () => {
    // Revenue 12 × £30 = £360; costs: hire £200, shuttles 23 × £2 = £46, trophies £200. Loss £86.
    const { base, levers: found } = levers(tournament());
    expect(base.finance.profit).toBe(-86);
    const fee = found.find((l) => l.change.kind === "breakEvenFee")!;
    expect(fee.change).toEqual({ kind: "breakEvenFee", categoryId: "md", by: 7.17, basis: "entry" });
    expect(fee.outcome.profit).toBeGreaterThanOrEqual(0);
    expect(fee.outcome.profit).toBeLessThan(12 * 0.01);
  });

  it("drops an other cost, reporting what it saves", () => {
    const drop = levers(tournament()).levers.find((l) => l.change.kind === "dropCost")!;
    expect(drop.change).toEqual({ kind: "dropCost", costId: "trophies", label: "Trophies" });
    expect(drop.delta.profit).toBe(200);
    expect(drop.improvesFit).toBe(false);
  });

  it("leaves out changes that improve neither fit nor profit", () => {
    // The plan fits, so another court only adds hire; one shuttle a game can't go lower.
    const kinds = levers(tournament()).levers.map((l) => l.change.kind);
    expect(kinds).not.toContain("addCourt");
    expect(kinds).not.toContain("fewerShuttles");
  });

  it("suggests shorter matches and another court when the plan doesn't fit, fit first", () => {
    const tight = tournament();
    tight.frame.halls = [hall("h1", "08:00", "10:00", { courtCount: 2, rate: 10, umpires: 1 })];
    tight.stageRules = { ...tight.stageRules, final: { ...stage, bestOf: 3, deuce: { type: "standard", max: 30 } } };
    tight.finance.shuttlesPerGame = 2;
    const { base, levers: found } = levers(tight);
    expect(base.capacity.status).toBe("doesNotFit");

    const court = found.find((l) => l.change.kind === "addCourt")!;
    expect(court.improvesFit).toBe(true);
    expect(court.delta.available).toBe(120);

    const bestOfOne = found.find((l) => l.change.kind === "bestOfOne")!;
    expect(bestOfOne.change).toEqual({ kind: "bestOfOne", stage: "final" });
    expect(bestOfOne.delta.neededTypical).toBe(-12);

    // No deuce only shortens the worst case, which can't help while the typical day doesn't fit.
    expect(found.find((l) => l.change.kind === "noDeuce")).toBeUndefined();
    expect(found.find((l) => l.change.kind === "fewerShuttles")?.change).toEqual({ kind: "fewerShuttles", from: 2, to: 1 });

    // Fit levers first, most court time gained first.
    const firstProfitOnly = found.findIndex((l) => !l.improvesFit);
    expect(found.slice(0, firstProfitOnly === -1 ? undefined : firstProfitOnly).every((l) => l.improvesFit)).toBe(true);
    expect(found[0]!.change.kind).toBe("addCourt");
  });

  it("suggests no deuce when only the worst case doesn't fit", () => {
    const plan = tournament();
    plan.stageRules = { ...plan.stageRules, group: { ...stage, deuce: { type: "standard", max: 30 } } };
    plan.frame.halls = [hall("h1", "08:00", "09:30", { courtCount: 4, rate: 10 })];
    const { base, levers: found } = levers(plan);
    expect(base.capacity.status).toBe("fitsTypicalOnly");
    const deuce = found.find((l) => l.change.kind === "noDeuce")!;
    expect(deuce.change).toEqual({ kind: "noDeuce", stage: "group", from: "standard" });
    expect(deuce.improvesFit).toBe(true);
    expect(deuce.delta.neededTypical).toBe(0);
    expect(deuce.delta.neededWorst).toBeLessThan(0);
  });

  it("tries smaller groups and dropping the bronze match", () => {
    const plan = tournament();
    plan.categories[0]!.expectedEntries = 16;
    plan.categories[0]!.bronze = true;
    plan.stageRules = { ...plan.stageRules, bronze: stage };
    plan.stageTiming = { ...plan.stageTiming, bronze: timing };
    plan.frame.halls = [hall("h1", "08:00", "09:00", { courtCount: 4, rate: 10 })];
    const found = levers(plan).levers;
    expect(found.find((l) => l.change.kind === "noBronze")?.delta.neededTypical).toBe(-15);
    // 16 entries: groups of 4 play 24 + 7 knockout + 1 bronze; groups of 3 play 18 + 9 + 1.
    const groups = found.filter((l) => l.change.kind === "groupSize");
    expect(groups.map((l) => l.change)).toEqual([{ kind: "groupSize", categoryId: "md", from: 4, to: 3 }]);
  });
});
