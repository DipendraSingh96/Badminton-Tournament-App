import { describe, expect, it } from "vitest";
import { courtHire } from "./finance";
import { at, band, courts, hall } from "./fixtures.test-helpers";
import { bandCoverage, dayBounds, totalUmpires } from "./venue";

describe("bandCoverage", () => {
  const day = { from: 570, to: 1080 }; // 09:30 to 18:00 in minutes

  it("is clean when bands meet end to end", () => {
    expect(bandCoverage(day, [{ from: 570, to: 900 }, { from: 900, to: 1080 }])).toEqual({ gaps: [], overlaps: [] });
  });

  it("finds gaps, including at either end", () => {
    expect(bandCoverage(day, [{ from: 600, to: 720 }, { from: 780, to: 1020 }]).gaps).toEqual([
      { from: 570, to: 600 },
      { from: 720, to: 780 },
      { from: 1020, to: 1080 },
    ]);
  });

  it("finds overlaps", () => {
    expect(bandCoverage(day, [{ from: 570, to: 930 }, { from: 900, to: 1080 }])).toEqual({
      gaps: [],
      overlaps: [{ from: 900, to: 930 }],
    });
  });

  it("reports a missing span as one gap", () => {
    expect(bandCoverage(day, [])).toEqual({ gaps: [day], overlaps: [] });
  });
});

describe("dayBounds and totalUmpires", () => {
  const halls = [hall("h1", "09:30", "18:00", { courtCount: 4, umpires: 1 }), hall("h2", "10:00", "17:00", { courtCount: 2, umpires: 2 })];

  it("runs from the earliest opening to the latest closing", () => {
    expect(dayBounds(halls)).toEqual({ start: at("09:30"), end: at("18:00") });
  });

  it("sums umpires across every court", () => {
    expect(totalUmpires(halls)).toBe(4 * 1 + 2 * 2);
  });
});

describe("courtHire", () => {
  it("charges a single band for every booked hour on every court", () => {
    const hire = courtHire([hall("h1", "09:30", "18:00", { courtCount: 4, rate: 12 })]);
    expect(hire.total).toBe(4 * 8.5 * 12);
  });

  it("splits each court's time across peak and off-peak bands", () => {
    const hire = courtHire([
      hall("h1", "09:30", "18:00", {
        courtCount: 4,
        bands: [band("09:30", "15:00", 12, "Off-peak"), band("15:00", "18:00", 15, "Peak")],
      }),
    ]);
    // Each court: 5.5 h x £12 + 3 h x £15 = £111; four courts = £444.
    expect(hire.courts[0]!.bands).toEqual([
      { name: "Off-peak", hours: 5.5, rate: 12, amount: 66 },
      { name: "Peak", hours: 3, rate: 15, amount: 45 },
    ]);
    expect(hire.total).toBe(444);
  });

  it("charges a narrower court only for its own booked time", () => {
    const hire = courtHire([
      hall("h1", "09:30", "18:00", {
        bands: [band("09:30", "15:00", 12), band("15:00", "18:00", 15)],
        courts: [...courts(1, "09:30", "18:00"), { id: "narrow", from: at("10:00"), to: at("17:00"), umpires: 0 }],
      }),
    ]);
    // Narrow court: 5 h x £12 + 2 h x £15 = £90.
    expect(hire.courts[1]!.amount).toBe(90);
    expect(hire.total).toBe(111 + 90);
  });
});
