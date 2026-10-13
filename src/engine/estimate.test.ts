import { describe, expect, it } from "vitest";
import { analyseTournament } from "./analyse";
import { estimateSchedule } from "./estimate";
import { at, hall } from "./fixtures.test-helpers";
import { knockoutRounds } from "./format";
import type { StageRules, TournamentInputs } from "./types";

const stage: StageRules = { pointsPerGame: 21, deuce: { type: "none" }, bestOf: 1 };
// 15-minute slots.
const timing = { minutesPerGame: 12, changeoverMinutes: 3 };

function tournament(): TournamentInputs {
  return {
    unit: "individual",
    format: "groupsKnockout",
    frame: {
      timeZone: "UTC",
      halls: [hall("h1", "09:00", "17:00", { courtCount: 4 })],
      bufferMinutes: 0,
    },
    categories: [
      {
        id: "md",
        name: "Men's doubles",
        entry: { type: "individual", event: "MD" },
        expectedEntries: 16,
        groups: { type: "auto", preferredSize: 4 },
        qualifiersPerGroup: 2,
        bronze: true,
        fee: { basis: "entry", amount: 0, expectedExternal: 0 },
      },
    ],
    stageRules: { group: stage, knockout: stage, bronze: stage, final: stage },
    stageTiming: { group: timing, knockout: timing, bronze: timing, final: timing },
    bestOfThreeAllowance: 0,
    finance: { shuttlesPerGame: 0, costPerShuttle: 0, prizes: [], otherCosts: [], otherIncome: [] },
    rules: {
      tiebreaks: ["matchesWon"],
      handicap: { enabled: false },
      eligibility: { exclusivePairs: [], membersOnly: [], allowMixedMemberExternalPairs: true },
      withdrawal: "byesThenWalkovers",
      walkover: "straightGamesAtTarget",
    },
  };
}

function estimate(inputs: TournamentInputs) {
  const result = analyseTournament(inputs);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { analysis: result.analysis, schedule: estimateSchedule(inputs, result.analysis) };
}

const segments = (schedule: ReturnType<typeof estimateSchedule>) => schedule.courts.flatMap((c) => c.segments);

describe("knockoutRounds", () => {
  it("fills the bracket with byes in the first round", () => {
    expect(knockoutRounds(2)).toEqual([]);
    expect(knockoutRounds(3)).toEqual([{ size: 4, matches: 1 }]);
    expect(knockoutRounds(6)).toEqual([
      { size: 8, matches: 2 },
      { size: 4, matches: 2 },
    ]);
    expect(knockoutRounds(8)).toEqual([
      { size: 8, matches: 4 },
      { size: 4, matches: 2 },
    ]);
    expect(knockoutRounds(12)).toEqual([
      { size: 16, matches: 4 },
      { size: 8, matches: 4 },
      { size: 4, matches: 2 },
    ]);
  });

  it("plays qualifiers − 2 matches before the final", () => {
    for (const q of [3, 5, 6, 7, 8, 12, 20]) {
      expect(knockoutRounds(q).reduce((sum, r) => sum + r.matches, 0)).toBe(q - 2);
    }
  });
});

describe("estimateSchedule", () => {
  it("plays group waves in order, then the knockout rounds, then bronze and final", () => {
    // 4 groups of 4: 3 waves of 8 matches on 4 courts, 15 min each = 6 slots = 1 h 30.
    const { schedule } = estimate(tournament());
    expect(schedule.unplaced).toBe(0);
    expect(schedule.stages.group).toEqual({ from: at("09:00"), to: at("10:30") });
    // 8 qualifiers: quarter-finals (4 matches, one slot), semis, then bronze and final together.
    expect(schedule.stages.knockout).toEqual({ from: at("10:30"), to: at("11:00") });
    expect(schedule.stages.bronze).toEqual({ from: at("11:00"), to: at("11:15") });
    expect(schedule.stages.final).toEqual({ from: at("11:00"), to: at("11:15") });
    expect(schedule.finish).toBe(at("11:15"));

    const court1 = schedule.courts[0]!.segments;
    expect(court1.map((s) => [s.stage, s.round, s.from])).toEqual([
      ["group", { type: "wave", wave: 1 }, at("09:00")],
      ["group", { type: "wave", wave: 2 }, at("09:30")],
      ["group", { type: "wave", wave: 3 }, at("10:00")],
      ["knockout", { type: "knockout", size: 8 }, at("10:30")],
      ["knockout", { type: "knockout", size: 4 }, at("10:45")],
      ["bronze", null, at("11:00")],
    ]);
    expect(court1[0]!.matches).toBe(2);
  });

  it("keeps every match within its court's hours", () => {
    const plan = tournament();
    plan.frame.halls = [
      hall("h1", "09:00", "17:00", { courtCount: 2 }),
      hall("h2", "11:00", "13:00", { courtCount: 2 }),
    ];
    const { schedule } = estimate(plan);
    for (const court of schedule.courts) {
      const [from, to] = court.hallId === "h2" ? [at("11:00"), at("13:00")] : [at("09:00"), at("17:00")];
      for (const s of court.segments) {
        expect(s.from >= from && s.to <= to).toBe(true);
      }
    }
    expect(schedule.courts.filter((c) => c.hallId === "h2").every((c) => c.segments.length > 0)).toBe(true);
  });

  it("plays a team tie's rubbers as separate matches on parallel courts", () => {
    const plan = tournament();
    plan.unit = "team";
    plan.format = "knockout";
    plan.categories[0] = {
      ...plan.categories[0]!,
      entry: { type: "team", lineUp: [{ event: "MS", count: 2 }, { event: "MD", count: 2 }] },
      expectedEntries: 2,
      bronze: false,
    };
    // Knockout only, 2 teams: just the final, a tie of 4 rubbers on 4 courts at once.
    const { schedule } = estimate(plan);
    expect(segments(schedule).map((s) => [s.stage, s.from])).toEqual([
      ["final", at("09:00")],
      ["final", at("09:00")],
      ["final", at("09:00")],
      ["final", at("09:00")],
    ]);
  });

  it("finishes within the playing time when the plan fits", () => {
    const { analysis, schedule } = estimate(tournament());
    expect(analysis.capacity.status).toBe("fits");
    expect(schedule.finish! <= analysis.capacity.available.playingEnd).toBe(true);
    expect(schedule.worstFinish! >= schedule.finish!).toBe(true);
  });

  it("reports matches that fit on no court", () => {
    const plan = tournament();
    plan.frame.halls = [hall("h1", "09:00", "10:00", { courtCount: 2 })];
    const { analysis, schedule } = estimate(plan);
    // 2 courts × 4 slots = 8 matches placed of 24 + 7 + 1 + 1.
    expect(schedule.unplaced).toBe(analysis.totalMatches - 8);
  });

  it("carries each match's fixture: group, wave and draw slots", () => {
    const { schedule } = estimate(tournament());
    // Wave 1 fills the four courts group by group: A1 v A4, A2 v A3, B1 v B4, B2 v B3, then C and D.
    const court1 = schedule.courts[0]!.segments[0]!.details;
    expect(court1.map((d) => [d.from, d.match])).toEqual([
      [at("09:00"), { categoryId: "md", stage: "group", group: "A", wave: 1, home: "A1", away: "A4", rubber: undefined }],
      [at("09:15"), { categoryId: "md", stage: "group", group: "C", wave: 1, home: "C1", away: "C4", rubber: undefined }],
    ]);
    const quarter = schedule.courts[0]!.segments.find((s) => s.stage === "knockout")!.details[0]!.match;
    expect(quarter).toMatchObject({ code: "QF1", roundSize: 8, home: "Winner A", away: "Runner-up D" });
    const bronze = schedule.courts.flatMap((c) => c.segments).find((s) => s.stage === "bronze")!.details[0]!.match;
    expect(bronze).toMatchObject({ code: "Bronze", home: "Loser SF1", away: "Loser SF2" });
  });

  it("names each rubber of a team tie", () => {
    const plan = tournament();
    plan.unit = "team";
    plan.format = "knockout";
    plan.categories[0] = {
      ...plan.categories[0]!,
      entry: { type: "team", lineUp: [{ event: "MS", count: 2 }, { event: "MD", count: 2 }] },
      expectedEntries: 2,
      bronze: false,
    };
    const { schedule } = estimate(plan);
    const rubbers = schedule.courts.flatMap((c) => c.segments.flatMap((s) => s.details.map((d) => d.match)));
    expect(rubbers.map((m) => [m.code, m.home, m.away, m.rubber])).toEqual([
      ["Final", "Seed 1", "Seed 2", { number: 1, of: 4, event: "MS" }],
      ["Final", "Seed 1", "Seed 2", { number: 2, of: 4, event: "MS" }],
      ["Final", "Seed 1", "Seed 2", { number: 3, of: 4, event: "MD" }],
      ["Final", "Seed 1", "Seed 2", { number: 4, of: 4, event: "MD" }],
    ]);
  });

  it("shows each hall's group and KO zones, following the estimate", () => {
    const { schedule } = estimate(tournament());
    expect(schedule.windows["h1:group"]).toEqual({ from: at("09:00"), to: at("10:30"), categoryIds: ["md"] });
    expect(schedule.windows["h1:knockout"]).toEqual({ from: at("10:30"), to: at("11:15"), categoryIds: ["md"] });
  });

  it("starts a pinned zone's stage no earlier than its start, delaying what follows", () => {
    const plan = tournament();
    plan.stageWindows = [{ key: "h1:group", from: at("09:30"), to: at("11:00") }];
    const { schedule } = estimate(plan);
    expect(schedule.windows["h1:group"]).toMatchObject({ from: at("09:30"), to: at("11:00") });
    expect(schedule.windows["h1:group"]!.overrun).toBeUndefined();
    expect(schedule.windows["h1:knockout"]!.from).toBe(at("11:00"));
    expect(schedule.finish).toBe(at("11:45"));
  });

  it("runs a too-short zone on past its end, and the knockout waits", () => {
    const plan = tournament();
    plan.stageWindows = [{ key: "h1:group", from: at("09:00"), to: at("10:00") }];
    const { schedule } = estimate(plan);
    expect(schedule.windows["h1:group"]).toMatchObject({ to: at("10:30"), overrun: at("10:30") });
    expect(schedule.windows["h1:knockout"]!.from).toBe(at("10:30"));
  });

  it("reports when a KO zone starts before the group stage has finished", () => {
    const plan = tournament();
    plan.stageWindows = [{ key: "h1:knockout", from: at("10:00"), to: at("11:30") }];
    const { schedule } = estimate(plan);
    expect(schedule.windows["h1:knockout"]).toMatchObject({ from: at("10:30"), earliest: at("10:30") });
  });

  it("keeps each group in its hall, and halls can start their groups at different times", () => {
    const plan = tournament();
    plan.frame.halls = [
      hall("h1", "09:00", "17:00", { courtCount: 4 }),
      hall("h2", "09:00", "17:00", { courtCount: 2 }),
    ];
    plan.stageWindows = [{ key: "h2:group", from: at("10:00"), to: at("12:00") }];
    const { analysis, schedule } = estimate(plan);
    const groupsIn = (hallId: string) =>
      new Set(
        schedule.courts
          .filter((c) => c.hallId === hallId)
          .flatMap((c) => c.segments.flatMap((s) => s.details.map((d) => d.match.group)))
          .filter(Boolean),
      );
    const suggested = (hallId: string) =>
      new Set(analysis.groupsPerHall.find((h) => h.hallId === hallId)!.groups.map((g) => String.fromCharCode(65 + g.groupIndex)));
    expect(groupsIn("h1")).toEqual(suggested("h1"));
    expect(groupsIn("h2")).toEqual(suggested("h2"));
    expect(schedule.windows["h1:group"]!.from).toBe(at("09:00"));
    expect(schedule.windows["h2:group"]!.from).toBe(at("10:00"));
  });
});
