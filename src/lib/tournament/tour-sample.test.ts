import { describe, expect, it } from "vitest";
import { analyseTournament } from "@/engine";
import { canGoLive } from "./draft";
import { hasDummy } from "./dummy/marks";
import { gameState } from "./live";
import { canFinish, placings, stillOpen } from "./results";
import { parsePlan } from "./schema";
import { TOUR_STATES, scheduledGames, tourSamples } from "./tour-sample";

const today = new Date(2026, 10, 19);
const samples = tourSamples(today, "Europe/London");
const sample = (state: (typeof TOUR_STATES)[number]) => samples[state];

describe("the tour's sample tournament", () => {
  it("is one tournament from start to finish, and the same one each time the tour is taken", () => {
    // Each point is built on the one before: the same entries, the same draw, the same scores.
    expect(sample("locked").entries).toEqual(sample("draw").entries);
    expect(sample("played").entries.map((e) => e.id)).toEqual(sample("draw").entries.map((e) => e.id));
    expect(sample("played").draw).toEqual(sample("locked").draw);
    expect(sample("results").results).toEqual(sample("played").results);
    // Another time: ids are fresh, but it is the same tournament to look at.
    const again = tourSamples(today, "Europe/London");
    for (const state of TOUR_STATES) {
      expect(again[state].stage).toBe(sample(state).stage);
      expect(again[state].name).toBe(sample(state).name);
      expect(again[state].categories.map((c) => c.name)).toEqual(sample(state).categories.map((c) => c.name));
      expect(again[state].entries.map((e) => e.name)).toEqual(sample(state).entries.map((e) => e.name));
    }
  });

  it("starts as a new tournament does, and fills in a part at a time", () => {
    const blank = sample("blank");
    expect(blank.name).toBe("");
    expect([blank.unit, blank.categories.length, blank.frame.halls.length, blank.frame.halls[0]!.courts.length]).toEqual([null, 0, 1, 1]);
    const basics = sample("basics");
    expect([basics.name, basics.frame.date]).toEqual([sample("plan").name, sample("plan").frame.date]);
    expect(basics.frame.halls).toEqual(blank.frame.halls);
    // The hall's line is filled in; it still has the one court.
    const hall = sample("hall");
    expect(hall.frame.halls).toHaveLength(1);
    expect([hall.frame.halls[0]!.from, hall.frame.halls[0]!.unitMinutes]).toEqual([sample("plan").frame.halls[0]!.from, sample("plan").frame.halls[0]!.unitMinutes]);
    expect(hall.frame.halls[0]!.courts).toHaveLength(1);
    // The courts; nothing of the side panel yet.
    const courts = sample("courts");
    expect(courts.frame.halls).toEqual(sample("plan").frame.halls);
    expect([courts.unit, courts.format, courts.categories.length]).toEqual([null, null, 0]);
    // Setup: who enters, the categories, the format and the rules; no numbers, no money.
    const setup = sample("setup");
    expect([setup.unit, setup.format, setup.rules]).toEqual([sample("plan").unit, sample("plan").format, sample("plan").rules]);
    expect(setup.categories.map((c) => c.event)).toEqual(sample("plan").categories.map((c) => c.event));
    expect(setup.categories.every((c) => c.expectedEntries === null && c.feeAmount === null)).toBe(true);
    // Schedule: the numbers and timings; still no money.
    const schedule = sample("schedule");
    expect(schedule.categories.map((c) => c.expectedEntries)).toEqual(sample("plan").categories.map((c) => c.expectedEntries));
    expect(schedule.categories.every((c) => c.feeAmount === null)).toBe(true);
    expect(schedule.finance).toEqual(blank.finance);
    // None of them is a plan that can be read yet; the whole plan is.
    for (const state of ["blank", "basics", "hall", "courts", "setup", "schedule"] as const) expect([state, parsePlan(sample(state)).ok]).toEqual([state, false]);
  });

  it("is part-way through the day for the Live chapter: matches played, matches on court, and one court waiting for a player", () => {
    const midday = sample("midday");
    expect(midday.stage).toBe("live");
    expect(midday.startedAt).not.toBeNull();
    const states = scheduledGames(midday)!.games.map((g) => gameState(midday.results, g.id));
    expect(states.filter((x) => x === "finished").length).toBeGreaterThan(0);
    expect(states.filter((x) => x === "onCourt").length).toBeGreaterThan(0);
    expect(states.filter((x) => x === "waiting").length).toBeGreaterThan(states.length / 2);
    expect(midday.entries.flatMap((e) => e.players).filter((p) => p.attendance !== "arrived")).toHaveLength(1);
    expect(canFinish(midday)).toBe(false);
  });

  it("is a complete plan that fits, on a Saturday after today", () => {
    const plan = sample("plan");
    expect(plan.stage).toBe("plan");
    expect(plan.entries).toEqual([]);
    const parsed = parsePlan(plan);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const analysis = analyseTournament(parsed.inputs);
    expect(analysis.ok).toBe(true);
    if (analysis.ok) expect(analysis.analysis.capacity.status).not.toBe("doesNotFit");
    expect(new Date(`${plan.frame.date}T12:00:00`).getDay()).toBe(6);
    expect(plan.frame.date > "2026-11-19").toBe(true);
    // All of it is sample data, marked as such.
    expect(hasDummy(plan)).toBe(true);
  });

  it("has every category drawn, and not yet locked, on the Draw stage", () => {
    const draw = sample("draw");
    expect(draw.stage).toBe("draw");
    expect(draw.entries.length).toBeGreaterThan(0);
    expect(draw.categories.every((c) => draw.draw[c.id] && !draw.draw[c.id]!.locked)).toBe(true);
    expect(canGoLive(draw)).toBe(false);
  });

  it("can go Live once its draws are locked", () => {
    const locked = sample("locked");
    expect(locked.stage).toBe("draw");
    expect(canGoLive(locked)).toBe(true);
    expect(scheduledGames(locked)!.games.length).toBeGreaterThan(0);
  });

  it("is ready for a rehearsal with everyone checked in", () => {
    const ready = sample("ready");
    expect(ready.stage).toBe("draw");
    expect(canGoLive(ready)).toBe(true);
    expect(ready.entries.flatMap((e) => e.players).every((p) => p.attendance === "arrived")).toBe(true);
    expect(ready.draw).toEqual(sample("locked").draw);
  });

  it("has every match played and can be finished", () => {
    const played = sample("played");
    expect(played.stage).toBe("live");
    expect(played.startedAt).not.toBeNull();
    const games = scheduledGames(played)!.games;
    expect(games.every((g) => gameState(played.results, g.id) === "finished")).toBe(true);
    expect(stillOpen(played)).toEqual([]);
    expect(canFinish(played)).toBe(true);
  });

  it("is finished, with placings for every category, on the Results stage", () => {
    const results = sample("results");
    expect(results.stage).toBe("results");
    expect(results.log.at(-1)).toMatchObject({ kind: "finish" });
    for (const category of results.categories) {
      expect(placings(results, category).map((p) => p.place).slice(0, 2)).toEqual([1, 2]);
    }
  });
});
