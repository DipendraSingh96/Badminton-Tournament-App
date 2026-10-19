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
    // One pill per match.
    expect(court1.map((s) => [s.stage, s.round, s.from])).toEqual([
      ["group", { type: "wave", wave: 1 }, at("09:00")],
      ["group", { type: "wave", wave: 1 }, at("09:15")],
      ["group", { type: "wave", wave: 2 }, at("09:30")],
      ["group", { type: "wave", wave: 2 }, at("09:45")],
      ["group", { type: "wave", wave: 3 }, at("10:00")],
      ["group", { type: "wave", wave: 3 }, at("10:15")],
      ["knockout", { type: "knockout", size: 8 }, at("10:30")],
      ["knockout", { type: "knockout", size: 4 }, at("10:45")],
      ["bronze", null, at("11:00")],
    ]);
    expect(court1.every((s) => s.matches === 1)).toBe(true);
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

  it("keeps matches that run past closing on their court, flagged", () => {
    const plan = tournament();
    plan.frame.halls = [hall("h1", "09:00", "10:00", { courtCount: 2 })];
    const { analysis, schedule } = estimate(plan);
    // 2 courts × 4 slots fit before 10:00; the other matches run on, flagged.
    const all = schedule.courts.flatMap((c) => c.segments.map((s) => s.details[0]!));
    expect(all).toHaveLength(analysis.totalMatches);
    expect(schedule.unplaced).toBe(0);
    expect(schedule.late).toBe(analysis.totalMatches - 8);
    expect(all.filter((d) => d.late).every((d) => d.to > at("10:00"))).toBe(true);
    expect(schedule.windows["h1:group"]!.late).toBeGreaterThan(0);
  });

  it("never moves a match when a hall's hours change", () => {
    const plan = tournament();
    plan.frame.halls = [
      hall("h1", "09:00", "17:00", { courtCount: 4 }),
      hall("h2", "09:00", "14:30", { courtCount: 4 }),
    ];
    const where = (schedule: ReturnType<typeof estimateSchedule>) =>
      new Map(schedule.courts.flatMap((c) => c.segments.map((s) => [s.details[0]!.id, c.courtId])));
    const before = where(estimate(plan).schedule);
    plan.frame.halls[1] = hall("h2", "09:00", "11:00", { courtCount: 4 });
    const after = where(estimate(plan).schedule);
    expect(after).toEqual(before);
  });

  it("carries each match's fixture: group, wave and draw slots", () => {
    const { schedule } = estimate(tournament());
    // Wave 1 fills the four courts group by group: A1 v A4, A2 v A3, B1 v B4, B2 v B3, then C and D.
    const court1 = schedule.courts[0]!.segments.slice(0, 2).flatMap((s) => s.details);
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

  it("shows each hall's group and KO zones, from where their matches are played", () => {
    const { schedule } = estimate(tournament());
    expect(schedule.windows["h1:group"]).toEqual({ from: at("09:00"), to: at("10:30"), categoryIds: ["md"], moved: false, late: 0 });
    expect(schedule.windows["h1:knockout"]).toEqual({ from: at("10:30"), to: at("11:15"), categoryIds: ["md"], moved: false, late: 0 });
  });

  it("starts a zone dragged later from there, leaving free time, and what follows waits", () => {
    const plan = tournament();
    plan.zoneMoves = [{ key: "h1:knockout", start: at("11:00") }];
    const { schedule } = estimate(plan);
    expect(schedule.windows["h1:group"]!.to).toBe(at("10:30"));
    expect(schedule.windows["h1:knockout"]).toMatchObject({ from: at("11:00"), moved: true });
    expect(schedule.finish).toBe(at("11:45"));
  });

  it("reports when a zone is dragged to start before what it depends on has finished", () => {
    const plan = tournament();
    plan.zoneMoves = [{ key: "h1:knockout", start: at("10:00") }];
    const { schedule } = estimate(plan);
    expect(schedule.windows["h1:knockout"]).toMatchObject({ from: at("10:30"), earliest: at("10:30") });
  });

  function twoHalls() {
    const plan = tournament();
    plan.frame.halls = [
      hall("h1", "09:00", "17:00", { courtCount: 4 }),
      hall("h2", "09:00", "17:00", { courtCount: 2 }),
    ];
    return plan;
  }
  const hallsPlaying = (schedule: ReturnType<typeof estimateSchedule>, stage: string) =>
    new Set(schedule.courts.filter((c) => c.segments.some((s) => s.stage === stage)).map((c) => c.hallId));

  it("keeps each group in its hall, and halls can start their groups at different times", () => {
    const plan = twoHalls();
    plan.zoneMoves = [{ key: "h2:group", start: at("10:00") }];
    const { analysis, schedule } = estimate(plan);
    const groupsIn = (hallId: string) =>
      new Set(
        schedule.courts
          .filter((c) => c.hallId === hallId)
          .flatMap((c) => c.segments.flatMap((s) => s.details.map((d) => d.match.group)))
          .filter(Boolean),
      );
    const suggested = (hallId: string) =>
      new Set(
        analysis.groupsPerHall.find((h) => h.hallId === hallId)!.groups.map((g) => String.fromCharCode(65 + g.groupIndex)),
      );
    expect(groupsIn("h1")).toEqual(suggested("h1"));
    expect(groupsIn("h2")).toEqual(suggested("h2"));
    expect(schedule.windows["h1:group"]!.from).toBe(at("09:00"));
    expect(schedule.windows["h2:group"]!.from).toBe(at("10:00"));
  });

  it("moves a whole zone to another hall", () => {
    const plan = twoHalls();
    // The knockout fits in Hall 1; moving that zone sends it all to Hall 2.
    expect(hallsPlaying(estimate(plan).schedule, "knockout")).toEqual(new Set(["h1"]));
    plan.zoneMoves = [{ key: "h1:knockout", hallId: "h2" }];
    const { schedule } = estimate(plan);
    expect(hallsPlaying(schedule, "knockout")).toEqual(new Set(["h2"]));
    expect(hallsPlaying(schedule, "final")).toEqual(new Set(["h2"]));
    expect(schedule.windows["h1:knockout"]).toBeUndefined();
    expect(schedule.windows["h2:knockout"]!.moved).toBe(true);
  });

  const matchesOn = (schedule: ReturnType<typeof estimateSchedule>, court: number) =>
    schedule.courts[court]!.segments.map((s) => s.details[0]!);

  it("moves a match on its court, and the matches after it shift along", () => {
    const base = estimate(tournament()).schedule;
    const [first, second, third] = matchesOn(base, 0);
    const plan = tournament();
    // A1 v A4 goes after C1 v C4.
    plan.matchMoves = [{ matchId: first!.id, courtId: "h1-c1", before: third!.id }];
    const after = matchesOn(estimate(plan).schedule, 0);
    expect(after[0]!.id).toBe(second!.id);
    expect(after[1]).toMatchObject({ id: first!.id, moved: true, from: at("09:15") });
  });

  it("moves a match to another court of its hall, but not out of its hall", () => {
    const base = estimate(twoHalls()).schedule;
    const match = matchesOn(base, 0)[0]!;
    const plan = twoHalls();
    plan.matchMoves = [{ matchId: match.id, courtId: "h1-c4", before: null }];
    expect(matchesOn(estimate(plan).schedule, 3).some((d) => d.id === match.id && d.moved)).toBe(true);

    plan.matchMoves = [{ matchId: match.id, courtId: "h2-c1", before: null }];
    const refused = estimate(plan).schedule;
    const inHall2 = refused.courts.filter((c) => c.hallId === "h2").flatMap((c) => c.segments);
    expect(inHall2.some((s) => s.details[0]!.id === match.id)).toBe(false);
  });

  it("keeps knockout order: a semi-final moved first still waits for its quarter-finals", () => {
    const all = (schedule: ReturnType<typeof estimateSchedule>) => schedule.courts.flatMap((c) => c.segments.map((s) => s.details[0]!));
    const base = all(estimate(tournament()).schedule);
    const semi = base.find((d) => d.match.code === "SF1")!;
    const quarter = base.find((d) => d.match.code === "QF1")!;
    const plan = tournament();
    plan.matchMoves = [{ matchId: semi.id, courtId: "h1-c1", before: quarter.id }];
    const after = all(estimate(plan).schedule);
    const sf = after.find((d) => d.id === semi.id)!;
    const quarters = after.filter((d) => d.match.code === "QF1" || d.match.code === "QF2");
    expect(quarters.every((q) => sf.from >= q.to)).toBe(true);
    expect(sf.moved).toBe(true);
  });

  it("never loses matches when one is moved ahead of what it waits for on the same court", () => {
    const all = (schedule: ReturnType<typeof estimateSchedule>) => schedule.courts.flatMap((c) => c.segments.map((s) => s.details[0]!));
    // Team ties: each rubber is a match, and the bronze tie's rubbers wait for both semi-finals.
    const teams = () => {
      const plan = tournament();
      plan.unit = "team";
      plan.categories[0] = {
        ...plan.categories[0]!,
        entry: { type: "team", lineUp: [{ event: "MD", count: 3 }] },
      };
      return plan;
    };
    const base = estimate(teams()).schedule;
    const semi = all(base).find((d) => d.match.code === "SF1" && d.match.rubber?.number === 2)!;
    const bronze = all(base).find((d) => d.match.code === "Bronze" && d.match.rubber?.number === 2)!;
    const court = base.courts.find((c) => c.segments.some((s) => s.details[0]!.id === semi.id))!;
    const plan = teams();
    // A bronze rubber goes on the semi-final's court, before it: it can't be played there first.
    plan.matchMoves = [{ matchId: bronze.id, courtId: court.courtId, before: semi.id }];
    const after = estimate(plan).schedule;
    expect(all(after)).toHaveLength(all(base).length);
    expect(after.unplaced).toBe(0);
    const sf = all(after).find((d) => d.id === semi.id)!;
    expect(Date.parse(all(after).find((d) => d.id === bronze.id)!.from)).toBeGreaterThanOrEqual(Date.parse(sf.to));
  });

  it("never has a side in two matches at once", () => {
    const base = estimate(tournament()).schedule;
    const court1 = matchesOn(base, 0);
    const court2 = matchesOn(base, 1);
    const plan = tournament();
    // A1 v A3 moved onto court 2 before C2 v C3, alongside A2 v A3's slot: A3 can't be on two courts at once.
    plan.matchMoves = [{ matchId: court1[2]!.id, courtId: "h1-c2", before: court2[1]!.id }];
    const all = estimate(plan).schedule.courts.flatMap((c) => c.segments.map((s) => s.details[0]!));
    for (const a of all) {
      for (const b of all) {
        if (a === b || a.match.categoryId !== b.match.categoryId) continue;
        const shared = [a.match.home, a.match.away].some((x) => x === b.match.home || x === b.match.away);
        if (shared) expect(a.to <= b.from || b.to <= a.from).toBe(true);
      }
    }
  });

  it("ignores moves for matches that no longer exist", () => {
    const plan = tournament();
    plan.matchMoves = [{ matchId: "md:group:Z:Z1-Z2:r1", courtId: "h1-c1", before: null }];
    expect(estimate(plan).schedule.finish).toBe(at("11:15"));
  });
});
