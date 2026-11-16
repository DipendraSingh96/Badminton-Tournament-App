import { describe, expect, it } from "vitest";
import { analyseTournament } from "@/engine";
import { awardMatch, finishTournament, goLive, reopenLive, reverseChange, withdrawEntry } from "./changes";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { finishGame, setScore, startGame } from "./live";
import { canFinish, dayReport, gamesPlayed, moneyReport, placings, stillOpen, workedFinance, type ResultsGame } from "./results";
import { parsePlan } from "./schema";
import { normaliseDraft } from "./storage";

const at = (hhmm: string) => `2026-07-04T${hhmm}:00.000Z`;
/** Stored times in these tests are UTC, read as minutes of the day. */
const minuteOf = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** Six entries drawn into two groups of three, the top two of each through; Live. */
function live(): PlanDraft {
  const draft = completeDraft();
  draft.stage = "draw";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => ({ ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` }));
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  goLive(draft, at("08:00"));
  return draft;
}

/** Plays a one-game match from a time for some minutes. */
function play(draft: PlanDraft, id: string, score: [number, number], from = "09:00", minutes = 15) {
  startGame(draft, id, at(from));
  setScore(draft, id, 0, 0, score[0], at(from));
  setScore(draft, id, 0, 1, score[1], at(from));
  const [h, m] = from.split(":").map(Number);
  const end = h! * 60 + m! + minutes;
  finishGame(draft, id, at(`${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`));
}

const group = (letter: string, a: number, b: number) => `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`;
const ko = (code: string) => `c1:ko:${code}:r1`;

/** Group A: e1 beats both, e2 beats e3. Group B: e6 beats both, e5 beats e4. */
function playGroups(draft: PlanDraft) {
  play(draft, group("A", 1, 2), [21, 15]);
  play(draft, group("A", 1, 3), [21, 10]);
  play(draft, group("A", 2, 3), [21, 19]);
  play(draft, group("B", 1, 2), [12, 21]);
  play(draft, group("B", 1, 3), [9, 21]);
  play(draft, group("B", 2, 3), [18, 21]);
}

/** Semi-finals: e1 beats e5, e6 beats e2. Bronze: e2 beats e5. Final: e1 beats e6. */
function playKnockout(draft: PlanDraft, bronze = true) {
  play(draft, ko("SF1"), [21, 17], "11:00");
  play(draft, ko("SF2"), [21, 12], "11:00");
  if (bronze) play(draft, ko("Bronze"), [15, 21], "11:30");
  play(draft, ko("Final"), [21, 19], "11:30");
}

describe("finishing a tournament", () => {
  it("waits for every match, then can be finished and reopened, both logged", () => {
    const draft = live();
    expect(canFinish(draft)).toBe(false);
    expect(stillOpen(draft)).toEqual(["10 matches still to play"]);
    playGroups(draft);
    play(draft, ko("SF1"), [21, 17]);
    startGame(draft, ko("SF2"), at("11:00"));
    expect(stillOpen(draft)).toEqual(["1 match is on court", "2 matches still to play"]);
    finishGame(draft, ko("SF2"), at("11:15"));
    // SF2 was finished with no score: nobody won it, so the final can't be played yet.
    expect(canFinish(draft)).toBe(false);

    const whole = live();
    playGroups(whole);
    playKnockout(whole);
    expect(stillOpen(whole)).toEqual([]);
    expect(canFinish(whole)).toBe(true);
    expect(finishTournament(whole, at("12:00"))).toBe(true);
    expect(whole.stage).toBe("results");
    expect(whole.log.at(-1)).toMatchObject({ kind: "finish", text: "The tournament was finished" });
    // Finished: not finished twice.
    expect(finishTournament(whole, at("12:01"))).toBe(false);
    expect(reopenLive(whole, at("12:05"), "wrong score")).toBe(true);
    expect(whole.stage).toBe("live");
    expect(whole.log.at(-1)).toMatchObject({ kind: "reopen", note: "wrong score" });
    // Reversing the reopening puts it back to finished.
    reverseChange(whole, whole.log.at(-1)!.id, at("12:06"));
    expect(whole.stage).toBe("results");
  });

  it("doesn't wait for matches that are no longer played, and does wait for a group that is level", () => {
    const draft = live();
    play(draft, group("A", 1, 2), [21, 15]);
    withdrawEntry(draft, { entryId: "e3", results: "void", now: at("09:30") });
    // Group A is now only e1 v e2, which is played; group B and the knockout remain.
    expect(stillOpen(draft)).toEqual(["7 matches still to play"]);

    const level = live();
    level.rules.tiebreaks = ["matchesWon", "pointDifference", "headToHead"];
    play(level, group("A", 1, 2), [21, 15]);
    play(level, group("A", 2, 3), [21, 15]);
    play(level, group("A", 1, 3), [15, 21]);
    play(level, group("B", 1, 2), [12, 21]);
    play(level, group("B", 1, 3), [9, 21]);
    play(level, group("B", 2, 3), [18, 21]);
    expect(stillOpen(level)).toContain("Group A is level: decide it");
  });
});

describe("placings", () => {
  it("come from the final and the bronze match", () => {
    const draft = live();
    playGroups(draft);
    expect(placings(draft, draft.categories[0]!)).toEqual([]);
    playKnockout(draft);
    expect(placings(draft, draft.categories[0]!)).toEqual([
      { place: 1, entryIds: ["e1"] },
      { place: 2, entryIds: ["e6"] },
      { place: 3, entryIds: ["e2"] },
    ]);
  });

  it("share third between the losing semi-finalists when no bronze match is played", () => {
    const draft = live();
    draft.categories[0]!.bronze = false;
    playGroups(draft);
    playKnockout(draft, false);
    expect(placings(draft, draft.categories[0]!)).toEqual([
      { place: 1, entryIds: ["e1"] },
      { place: 2, entryIds: ["e6"] },
      { place: 3, entryIds: ["e5", "e2"] },
    ]);
  });

  it("are each group's first three with groups only", () => {
    const draft = live();
    draft.format = "groups";
    playGroups(draft);
    expect(placings(draft, draft.categories[0]!)).toEqual([
      { place: 1, entryIds: ["e1"], group: "A" },
      { place: 2, entryIds: ["e2"], group: "A" },
      { place: 3, entryIds: ["e3"], group: "A" },
      { place: 1, entryIds: ["e6"], group: "B" },
      { place: 2, entryIds: ["e5"], group: "B" },
      { place: 3, entryIds: ["e4"], group: "B" },
    ]);
    expect(stillOpen(draft)).toEqual([]);
  });
});

describe("the day against the plan", () => {
  it("counts what was played and given, and how long each court was used", () => {
    const draft = live();
    draft.startedAt = at("09:20");
    // Two games on c1 (one runs 10 minutes over its slot), a walkover on c2, one never played.
    const games: ResultsGame[] = [
      { id: group("A", 1, 2), courtId: "c1", from: 540, to: 555 },
      { id: group("A", 1, 3), courtId: "c1", from: 555, to: 570 },
      { id: group("B", 1, 2), courtId: "c2", from: 540, to: 555 },
      { id: group("B", 1, 3), courtId: "c2", from: 555, to: 570 },
    ];
    play(draft, group("A", 1, 2), [21, 15], "09:20", 25);
    play(draft, group("A", 1, 3), [21, 10], "09:45", 12);
    awardMatch(draft, { matchId: group("B", 1, 2), winner: 0, reason: "walkover", now: at("09:30") });
    const report = dayReport(draft, games, minuteOf);
    expect(report).toMatchObject({ plannedStart: 540, start: 560, plannedFinish: 570, finish: 597, played: 2, walkovers: 1, retirements: 0, notPlayed: 1 });
    expect(report.overruns).toEqual([{ id: group("A", 1, 2), label: "Group A", courtNumber: 1, slot: 15, took: 25, over: 10 }]);
    // c1 is booked 09:00 to 17:00 (the hall's hours), c2 10:00 to 16:00.
    expect(report.courts).toEqual([
      { courtId: "c1", number: 1, played: 2, used: 37, booked: 480 },
      { courtId: "c2", number: 2, played: 0, used: 0, booked: 360 },
    ]);
    expect(report.courts.reduce((sum, c) => sum + c.played, 0)).toBe(report.played);
  });
});

describe("the money, plan and actual", () => {
  function reports(draft: PlanDraft) {
    const parsed = parsePlan(completeDraft());
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const analysis = analyseTournament(parsed.inputs);
    if (!analysis.ok) throw new Error("analysis");
    const planned = analysis.analysis.finance;
    return { planned, worked: workedFinance(draft, parsed.inputs), report: () => moneyReport(draft, planned, workedFinance(draft, parsed.inputs)) };
  }

  it("differs from the plan only where the day did: here, the games actually played", () => {
    const draft = live();
    playGroups(draft);
    const { planned, worked, report } = reports(draft);
    expect(gamesPlayed(draft)).toBe(6);
    expect(worked.shuttles).toBe(6 * planned.shuttlesPerGame);
    const money = report();
    // Every line but shuttles is as planned.
    for (const line of money.lines) {
      if (line.key === "shuttles") continue;
      expect([line.key, line.actual]).toEqual([line.key, line.planned]);
      expect(line.corrected).toBe(false);
    }
    expect(money.planned).toEqual({ moneyIn: planned.revenue, costs: planned.totalCost, profit: planned.profit });
    expect(money.actual.moneyIn).toBeCloseTo(planned.revenue);
    expect(money.actual.costs).toBeCloseTo(planned.totalCost - planned.shuttleCost + worked.shuttleCost);
    expect(money.actual.profit).toBeCloseTo(money.actual.moneyIn - money.actual.costs);
  });

  it("takes the organiser's correction for one line and leaves the rest", () => {
    const draft = live();
    playGroups(draft);
    const before = reports(draft).report();
    draft.actuals = { hire: 100, shuttles: 20 };
    const after = reports(draft).report();
    const line = (money: typeof after, key: string) => money.lines.find((l) => l.key === key)!;
    expect(line(after, "hire")).toMatchObject({ actual: 100, corrected: true, worked: line(before, "hire").worked });
    // Shuttles are corrected as a number used.
    expect(line(after, "shuttles")).toMatchObject({ corrected: true, shuttles: { actual: 20 } });
    expect(line(after, "shuttles").actual).toBeCloseTo(20 * line(after, "shuttles").shuttles!.each);
    for (const l of after.lines) {
      if (l.key === "hire" || l.key === "shuttles") continue;
      expect(l).toEqual(before.lines.find((x) => x.key === l.key));
    }
    expect(after.actual.costs).toBeCloseTo(before.actual.costs - line(before, "hire").actual + 100 - line(before, "shuttles").actual + line(after, "shuttles").actual);
    // A walkover's given games aren't played, so they use no shuttles.
    awardMatch(draft, { matchId: ko("SF1"), winner: 0, reason: "walkover", now: at("11:00") });
    expect(gamesPlayed(draft)).toBe(6);
  });

  it("opens a tournament saved before Results with nothing corrected", () => {
    const saved = JSON.parse(JSON.stringify(completeDraft()));
    delete saved.actuals;
    expect(normaliseDraft(saved).actuals).toEqual({});
  });
});
