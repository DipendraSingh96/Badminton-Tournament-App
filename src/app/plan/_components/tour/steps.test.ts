import { describe, expect, it } from "vitest";
import { TOUR_STATES } from "@/lib/tournament/tour-sample";
import { TOUR, nextPlace, previousPlace, type TourPlace } from "./steps";

const steps = TOUR.flatMap((chapter) => chapter.steps);

describe("the tour's steps", () => {
  it("are nine chapters, each with steps, and every id is its own", () => {
    expect(TOUR).toHaveLength(9);
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
    const reached = { plan: ["plan"], draw: ["plan", "draw"], locked: ["plan", "draw"], ready: ["plan", "draw"], played: ["plan", "draw", "live"], results: ["plan", "draw", "live", "results"] };
    for (const step of steps) {
      // A rehearsal shows Live on a tournament that is still at the draw.
      const stages = step.screen.rehearsal ? [...reached[step.screen.sample], "live"] : reached[step.screen.sample];
      expect([step.id, stages.includes(step.screen.stage)]).toEqual([step.id, true]);
      if (step.screen.rehearsal) expect([step.id, step.screen.sample]).toEqual([step.id, "ready"]);
    }
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
