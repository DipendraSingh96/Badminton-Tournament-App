import { describe, expect, it } from "vitest";
import { TOUR_STATES } from "@/lib/tournament/tour-sample";
import { EXPLORE, TOUR, nextPlace, previousPlace, type TourPlace } from "./steps";

const steps = TOUR.flatMap((chapter) => chapter.steps);

describe("the tour's steps", () => {
  it("are ten chapters, each with steps, and every id is its own", () => {
    expect(TOUR).toHaveLength(10);
    expect(TOUR.every((chapter) => chapter.steps.length >= 2)).toBe(true);
    expect(new Set(TOUR.map((chapter) => chapter.id)).size).toBe(TOUR.length);
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });

  it("each light something, say something short, and name a sample the tour has", () => {
    for (const step of steps) {
      expect([step.id, step.target.trim().length > 0]).toEqual([step.id, true]);
      expect([step.id, step.title.length > 0 && step.title.length <= 40]).toEqual([step.id, true]);
      expect([step.id, step.body.length > 0 && step.body.length <= 260]).toEqual([step.id, true]);
      expect([step.id, TOUR_STATES.includes(step.screen.sample)]).toEqual([step.id, true]);
    }
  });

  it("are shown on a stage their sample has reached", () => {
    const planned = ["plan"];
    const drawn = ["plan", "draw"];
    const reached: Record<(typeof TOUR_STATES)[number], string[]> = {
      blank: planned,
      basics: planned,
      hall: planned,
      courts: planned,
      setup: planned,
      schedule: planned,
      plan: planned,
      draw: drawn,
      locked: drawn,
      ready: drawn,
      midday: [...drawn, "live"],
      played: [...drawn, "live"],
      results: [...drawn, "live", "results"],
    };
    for (const step of steps) {
      // A rehearsal shows Live on a tournament that is still at the draw.
      const stages = step.screen.rehearsal ? [...reached[step.screen.sample], "live"] : reached[step.screen.sample];
      expect([step.id, stages.includes(step.screen.stage)]).toEqual([step.id, true]);
      if (step.screen.rehearsal) expect([step.id, step.screen.sample]).toEqual([step.id, "ready"]);
    }
  });

  it("begin on a blank tournament with the side panel and the timeline folded, and open each only from its own chapter on", () => {
    expect(steps[0]!.screen).toEqual({ sample: "blank", stage: "plan" });
    const chapter = (id: string) => TOUR.findIndex((c) => c.id === id);
    TOUR.forEach((c, i) => {
      for (const step of c.steps) {
        if (i < chapter("panel")) expect([step.id, step.screen.panel ?? false]).toEqual([step.id, false]);
        if (i < chapter("timeline")) expect([step.id, step.screen.timeline ?? false]).toEqual([step.id, false]);
      }
    });
    // The sample only ever fills in as the tour goes on.
    const order = steps.map((step) => TOUR_STATES.indexOf(step.screen.sample));
    const replays = TOUR[chapter("live")]!.steps[0]!.id;
    steps.forEach((step, i) => {
      // (The real day's first step goes back to the locked draw, to show where Go Live is.)
      if (i > 0 && step.id !== replays) expect([step.id, order[i]! >= order[i - 1]!]).toEqual([step.id, true]);
    });
    expect(EXPLORE.sample).toBe("results");
  });

  it("run from the first to the last and back, across chapters", () => {
    let at: TourPlace | null = { chapter: 0, step: 0 };
    const forward: string[] = [];
    let last: TourPlace = at;
    while (at) {
      forward.push(TOUR[at.chapter]!.steps[at.step]!.id);
      last = at;
      at = nextPlace(at);
    }
    expect(forward).toEqual(steps.map((step) => step.id));
    const back: string[] = [];
    for (let place: TourPlace | null = last; place; place = previousPlace(place)) back.push(TOUR[place.chapter]!.steps[place.step]!.id);
    expect(back).toEqual([...forward].reverse());
  });
});
