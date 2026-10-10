import { describe, expect, it } from "vitest";
import { analyseTournament, profitCurve } from "./analyse";
import type { StageRules, TournamentInputs } from "./types";

const stage: StageRules = {
  pointsPerGame: 21,
  deuce: { type: "none" },
  bestOf: 1,
};

function tournament(): TournamentInputs {
  return {
    unit: "individual",
    format: "groupsKnockout",
    frame: {
      start: "2026-05-02T08:00:00Z",
      end: "2026-05-02T13:00:00Z",
      timeZone: "Europe/London",
      courtWindows: [
        { from: "2026-05-02T08:00:00Z", to: "2026-05-02T13:00:00Z", courts: 4 },
      ],
      umpires: 4,
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
    eventTiming: { MD: { minutesPerGame: 12, changeoverMinutes: 3 } },
    finance: {
      shuttlesPerGame: 1,
      costPerShuttle: 2,
      prizes: [],
      otherCosts: [{ id: "hall", label: "Court hire", type: "fixed", amount: 200 }],
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
    teams.eventTiming = { ...teams.eventTiming, MS: { minutesPerGame: 12, changeoverMinutes: 3 } };
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

  it("times each event with its own timing", () => {
    const mixed = tournament();
    mixed.eventTiming = {
      MS: { minutesPerGame: 15, changeoverMinutes: 3 },
      MD: { minutesPerGame: 12, changeoverMinutes: 3 },
    };
    mixed.categories = [
      { ...mixed.categories[0]!, id: "ms", entry: { type: "individual", event: "MS" } },
      { ...mixed.categories[0]!, id: "md", entry: { type: "individual", event: "MD" } },
    ];
    const result = analyseTournament(mixed);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const group = result.analysis.demand.filter((d) => d.stage === "group");
    // Each category: 3 groups of 4 = 18 group matches.
    expect(group).toEqual([
      { stage: "group", event: "MS", matches: 18, games: 18, typical: 18 * 18, worst: 18 * 18 },
      { stage: "group", event: "MD", matches: 18, games: 18, typical: 18 * 15, worst: 18 * 15 },
    ]);
    expect(result.analysis.capacity.needed.typical).toBe(
      result.analysis.demand.reduce((sum, d) => sum + d.typical, 0),
    );
  });

  it("times a team tie's singles and doubles rubbers separately", () => {
    const teams = tournament();
    teams.unit = "team";
    teams.format = "groups";
    teams.eventTiming = {
      MS: { minutesPerGame: 15, changeoverMinutes: 3 },
      MD: { minutesPerGame: 12, changeoverMinutes: 3 },
    };
    teams.categories[0] = {
      ...teams.categories[0]!,
      entry: { type: "team", lineUp: [{ event: "MS", count: 3 }, { event: "MD", count: 2 }] },
      expectedEntries: 6,
      groups: { type: "fixed", groupCount: 2 },
    };
    const result = analyseTournament(teams);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    // 6 ties: 18 singles rubbers at 18 min, 12 doubles rubbers at 15 min.
    expect(result.analysis.capacity.needed.typical).toBe(18 * 18 + 12 * 15);
  });

  it("asks for timing for every event that is played", () => {
    const untimed = tournament();
    untimed.eventTiming = {};
    expect(analyseTournament(untimed)).toEqual({
      ok: false,
      errors: [{ code: "missingEventTiming", event: "MD" }],
    });
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
    fewer.frame.courtWindows[0]!.courts = 1;
    const result = analyseTournament(fewer);
    if (!result.ok) throw new Error("expected a valid analysis");
    expect(result.analysis.capacity.status).toBe("doesNotFit");
  });

  it("asks for rules for every stage that has matches", () => {
    const missing = tournament();
    missing.categories[0]!.bronze = true;
    expect(analyseTournament(missing)).toEqual({
      ok: false,
      errors: [{ code: "missingStageRules", stage: "bronze" }],
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
