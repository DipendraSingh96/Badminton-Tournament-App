import { describe, expect, it } from "vitest";
import { emptyCourt, emptyHall } from "./draft";
import { bookedCourtMinutes, healthBars } from "./health-bar";

describe("bookedCourtMinutes", () => {
  it("adds up each court's hours, its own or its hall's, and skips courts without hours", () => {
    const set = { ...emptyHall(), from: "09:00", to: "13:00", courts: [emptyCourt(), { ...emptyCourt(), from: "10:00" }] };
    const unset = { ...emptyHall(), courts: [emptyCourt()] };
    expect(bookedCourtMinutes([set, unset])).toBe(240 + 180);
  });
});

describe("healthBars", () => {
  it("has a bar per booked hour, filled for the hours needed", () => {
    const bars = healthBars(4 * 60, 150, 48);
    expect(bars.hoursPerBar).toBe(1);
    expect(bars.fills).toEqual([1, 1, 0.5, 0]);
  });

  it("gives a part hour a bar of its own", () => {
    expect(healthBars(21 * 60 + 20, null, 48).fills).toHaveLength(22);
  });

  it("is empty until there's time needed, and full when more is needed than booked", () => {
    expect(healthBars(180, null, 48).fills).toEqual([0, 0, 0]);
    expect(healthBars(180, 600, 48).fills).toEqual([1, 1, 1]);
  });

  it("keeps to the most bars by making each stand for more hours", () => {
    const bars = healthBars(100 * 60, 50 * 60, 48);
    expect(bars.hoursPerBar).toBe(3);
    expect(bars.fills).toHaveLength(34);
    expect(bars.fills.filter((f) => f === 1)).toHaveLength(16);
    expect(bars.fills[16]).toBeCloseTo(2 / 3);
  });

  it("has no bars with nothing booked", () => {
    expect(healthBars(0, null, 48).fills).toEqual([]);
  });
});
