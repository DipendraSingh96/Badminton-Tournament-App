import { describe, expect, it } from "vitest";
import { analyseTournament, profitCurve } from "./analyse";
import { hall } from "./fixtures.test-helpers";
import type { StageRules, Timing, TournamentInputs } from "./types";

const stage: StageRules = {
  pointsPerGame: 21,
  deuce: { type: "none" },
  bestOf: 1,
};

const timing: Timing = { minutesPerGame: 12, changeoverMinutes: 3 };

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
        id: "c1",
        name: "Sample",
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
      otherCosts: [{ id: "hall", label: "Court hire", type: "fixed", amount: 200 }],
    },
    rules: {
      tiebreaks: ["matchesWon", "pointDifference"],
      handicap: { enabled: false },
      eligibility: { exclusivePairs: [], membersOnly: [], allowMixedMemberExternalPairs: true },
      withdrawal: "byesThenWalkovers",
      walkover: "straightGamesAtTarget",
    },
  };
}

describe("analyseTournament", () => {
  it("joins format, capacity and finance", () => {
    const result = analyseTournament(tournament());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { analysis } = result;
    // 3 groups of 4 → 18 group matches; 6 qualifiers → 5 knockout matches.
    expect(analysis.matches).toEqual({ group: 18, knockout: 4, bronze: 0, final: 1 });
    expect(analysis.totalMatches).toBe(23);
    expect(analysis.capacity.needed.typical).toBe(23 * 15);
    expect(analysis.capacity.status).toBe("fits");
    expect(analysis.finance.revenue).toBe(360);
    expect(analysis.finance.shuttleCost).toBe(46);
  });

  it("breaks court time needed down by stage, adding up to the totals", () => {
    const result = analyseTournament(tournament());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { demand, capacity, games } = result.analysis;
    expect(demand.map((d) => d.stage)).toEqual(["group", "knockout", "final"]);
    expect(demand[0]).toEqual({ stage: "group", event: "MD", matches: 18, games: 18, typical: 270, worst: 270 });
    expect(demand.reduce((s, d) => s + d.typical, 0)).toBe(capacity.needed.typical);
    expect(demand.reduce((s, d) => s + d.worst, 0)).toBe(capacity.needed.worst);
    expect(demand.reduce((s, d) => s + d.games, 0)).toBe(games);
  });

  it("plays every rubber of a team tie as a match", () => {
    const teams = tournament();
    teams.unit = "team";
    teams.format = "groups";
    teams.categories[0] = {
      ...teams.categories[0]!,
      entry: {
        type: "team",
        lineUp: [
          { event: "MS", count: 3 },
          { event: "MD", count: 2 },
        ],
      },
      expectedEntries: 6,
      groups: { type: "fixed", groupCount: 2 },
    };
    const result = analyseTournament(teams);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const [category] = result.analysis.categories;
    // 2 groups of 3 teams: 6 ties, each of 5 rubbers.
    expect(category!.format.totalFixtures).toBe(6);
    expect(category!.rubbersPerFixture).toBe(5);
    expect(category!.totalMatches).toBe(30);
    expect(result.analysis.capacity.needed.typical).toBe(30 * 15);
  });

  it("times every event in a stage with the stage's timing", () => {
    const mixed = tournament();
    mixed.categories = [
      { ...mixed.categories[0]!, id: "ms", entry: { type: "individual", event: "MS" } },
      { ...mixed.categories[0]!, id: "md", entry: { type: "individual", event: "MD" } },
    ];
    const result = analyseTournament(mixed);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const group = result.analysis.demand.filter((d) => d.stage === "group");
    // Each category: 3 groups of 4 = 18 group matches, all at 15 min.
    expect(group).toEqual([
      { stage: "group", event: "MS", matches: 18, games: 18, typical: 18 * 15, worst: 18 * 15 },
      { stage: "group", event: "MD", matches: 18, games: 18, typical: 18 * 15, worst: 18 * 15 },
    ]);
    expect(result.analysis.slots.map((s) => s.stage)).toEqual(["group", "knockout", "final"]);
  });

  it("times each stage with its own timing", () => {
    const longer = tournament();
    longer.stageTiming = { ...longer.stageTiming, final: { minutesPerGame: 20, changeoverMinutes: 5 } };
    const result = analyseTournament(longer);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.analysis.demand.find((d) => d.stage === "final")!.typical).toBe(25);
    expect(result.analysis.demand.find((d) => d.stage === "group")!.typical).toBe(18 * 15);
  });

  it("applies the best-of-3 allowance to best-of-3 stages only, time and shuttles", () => {
    const plain = analyseTournament(tournament());
    const withAllowance = tournament();
    withAllowance.stageRules.final = { ...stage, bestOf: 3 };
    withAllowance.bestOfThreeAllowance = 0.33;
    const result = analyseTournament(withAllowance);
    if (!plain.ok || !result.ok) throw new Error("expected valid analyses");
    const final = result.analysis.demand.find((d) => d.stage === "final")!;
    // Final: (2 x 12 + 3) x 1.33 = 35.91 min; 2.66 games.
    expect(final.typical).toBeCloseTo(35.91);
    expect(final.games).toBeCloseTo(2.66);
    const group = result.analysis.demand.find((d) => d.stage === "group")!;
    expect(group.typical).toBe(plain.analysis.demand.find((d) => d.stage === "group")!.typical);
  });

  it("asks for timing for every stage that is played", () => {
    const untimed = tournament();
    untimed.stageTiming = { group: timing };
    expect(analyseTournament(untimed)).toEqual({
      ok: false,
      errors: [
        { code: "missingStageTiming", stage: "knockout" },
        { code: "missingStageTiming", stage: "final" },
      ],
    });
  });

  it("counts group-stage waves and suggests groups per hall", () => {
    const twoHalls = tournament();
    const result = analyseTournament(twoHalls);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    // 3 groups of 4: 3 rounds, 6 matches each.
    expect(result.analysis.categories[0]!.waves).toEqual({ waves: 3, fixturesPerWave: [6, 6, 6], mostFixtures: 6 });
    expect(result.analysis.waves).toBe(3);
    expect(result.analysis.groupsPerHall).toEqual([]);

    // Two halls of 4 and 2 courts, same hours: 6 groups split 4 and 2.
    twoHalls.frame.halls = [
      hall("h1", "08:00", "13:00", { courtCount: 4 }),
      hall("h2", "08:00", "13:00", { courtCount: 2 }),
    ];
    twoHalls.categories[0]!.expectedEntries = 24;
    const split = analyseTournament(twoHalls);
    if (!split.ok) throw new Error(JSON.stringify(split.errors));
    expect(split.analysis.groupsPerHall.map((h) => [h.hallId, h.groups.map((g) => g.groupIndex)])).toEqual([
      ["h1", [0, 1, 3, 4]],
      ["h2", [2, 5]],
    ]);
  });

  it("updates capacity and finance when entries change", () => {
    const base = tournament();
    const more = tournament();
    more.categories[0]!.expectedEntries = 20;
    const a = analyseTournament(base);
    const b = analyseTournament(more);
    if (!a.ok || !b.ok) throw new Error("expected valid analyses");
    expect(b.analysis.totalMatches).toBeGreaterThan(a.analysis.totalMatches);
    expect(b.analysis.capacity.spare.typical).toBeLessThan(
      a.analysis.capacity.spare.typical,
    );
    expect(b.analysis.finance.revenue).toBeGreaterThan(a.analysis.finance.revenue);
  });

  it("flips to doesn't fit when courts are removed", () => {
    const fewer = tournament();
    fewer.frame.halls[0]!.courts = fewer.frame.halls[0]!.courts.slice(0, 1);
    const result = analyseTournament(fewer);
    if (!result.ok) throw new Error("expected a valid analysis");
    expect(result.analysis.capacity.status).toBe("doesNotFit");
  });

  it("asks for rules and timing for every stage that has matches", () => {
    const missing = tournament();
    missing.categories[0]!.bronze = true;
    expect(analyseTournament(missing)).toEqual({
      ok: false,
      errors: [
        { code: "missingStageRules", stage: "bronze" },
        { code: "missingStageTiming", stage: "bronze" },
      ],
    });
  });

  it("reports format errors per category", () => {
    const bad = tournament();
    bad.categories[0]!.qualifiersPerGroup = 9;
    const result = analyseTournament(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: "format", categoryId: "c1" });
  });
});

describe("profitCurve", () => {
  it("finds the smallest entry count that breaks even", () => {
    const curve = profitCurve(tournament(), "c1", { from: 2, to: 20 });
    expect(curve.points[0]!.entries).toBe(2);
    expect(curve.breakEven).not.toBeNull();
    const index = curve.points.findIndex((p) => p.entries === curve.breakEven);
    expect(curve.points[index]!.profit).toBeGreaterThanOrEqual(0);
    expect(curve.points.slice(0, index).every((p) => p.profit < 0)).toBe(true);
  });

  it("returns no break-even when the tournament never pays for itself", () => {
    const free = tournament();
    free.categories[0]!.fee.amount = 0;
    const curve = profitCurve(free, "c1", { from: 2, to: 20 });
    expect(curve.breakEven).toBeNull();
    expect(curve.points.every((p) => p.profit < 0)).toBe(true);
  });

  it("skips entry counts with no valid format", () => {
    const fixed = tournament();
    fixed.categories[0]!.groups = { type: "fixed", groupCount: 3 };
    const curve = profitCurve(fixed, "c1", { from: 2, to: 8 });
    expect(curve.points[0]!.entries).toBe(6);
  });
});
