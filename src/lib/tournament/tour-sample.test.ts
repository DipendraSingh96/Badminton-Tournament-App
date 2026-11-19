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
