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

  it("splits each court's time across peak and off-peak bands, in the hall's units", () => {
    const hire = courtHire([
      hall("h1", "09:30", "18:00", {
        courtCount: 4,
        unitMinutes: 30,
        bands: [band("09:30", "15:00", 6, "Off-peak"), band("15:00", "18:00", 7.5, "Peak")],
      }),
    ]);
    // Each court: 11 half hours x £6 + 6 half hours x £7.50 = £111; four courts = £444.
    expect(hire.courts[0]!.bands).toEqual([
      { name: "Off-peak", minutes: 330, units: 11, unitMinutes: 30, rate: 6, amount: 66 },
      { name: "Peak", minutes: 180, units: 6, unitMinutes: 30, rate: 7.5, amount: 45 },
    ]);
    expect(hire.total).toBe(444);
  });

  it("charges a 40-minute hall per 40 minutes", () => {
    const hire = courtHire([
      hall("h1", "09:00", "18:20", {
        courtCount: 2,
        unitMinutes: 40,
        bands: [band("09:00", "15:40", 8, "Off-peak"), band("15:40", "18:20", 10, "Peak")],
      }),
    ]);
    // Each court: 10 units x £8 + 4 units x £10 = £120; two courts = £240.
    expect(hire.courts[0]!.bands.map((b) => [b.units, b.amount])).toEqual([
      [10, 80],
      [4, 40],
    ]);
    expect(hire.total).toBe(240);
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
