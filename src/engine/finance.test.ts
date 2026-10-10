import { describe, expect, it } from "vitest";
import { categoryRevenue, categoryRevenueWorking, courtHire, finance, playerCount } from "./finance";
import type { Category, Finance } from "./types";

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Sample",
    entry: { type: "individual", event: "MD" },
    expectedEntries: 10,
    groups: { type: "fixed", groupCount: 2 },
    qualifiersPerGroup: 2,
    bronze: false,
    fee: { basis: "entry", amount: 20, expectedExternal: 0 },
    ...overrides,
  };
}

function inputs(overrides: Partial<Finance> = {}): Finance {
  return {
    shuttlesPerGame: 1,
    costPerShuttle: 2,
    prizes: [],
    otherCosts: [],
    ...overrides,
  };
}

describe("categoryRevenue", () => {
  it("charges per pair", () => {
    expect(categoryRevenue(category())).toBe(200);
  });

  it("charges per player", () => {
    expect(
      categoryRevenue(
        category({ fee: { basis: "player", amount: 8, expectedExternal: 0 } }),
      ),
    ).toBe(160);
  });

  it("charges external entrants their own fee", () => {
    expect(
      categoryRevenueWorking(
        category({
          fee: { basis: "player", amount: 8, externalAmount: 12, expectedExternal: 5 },
        }),
      ),
    ).toMatchObject({ entrants: 20, external: 5, fee: 8, externalFee: 12 });
    expect(
      categoryRevenue(
        category({
          fee: {
            basis: "player",
            amount: 8,
            externalAmount: 12,
            expectedExternal: 5,
          },
        }),
      ),
    ).toBe(15 * 8 + 5 * 12);
  });

  it("never counts more external entrants than entrants", () => {
    expect(
      categoryRevenue(
        category({
          expectedEntries: 2,
          fee: { basis: "entry", amount: 10, externalAmount: 15, expectedExternal: 9 },
        }),
      ),
    ).toBe(30);
  });
});

describe("playerCount", () => {
  it("counts one player per singles entry and two per doubles entry", () => {
    expect(playerCount([category({ entry: { type: "individual", event: "MS" }, expectedEntries: 12 })])).toBe(12);
    expect(playerCount([category({ entry: { type: "individual", event: "XD" }, expectedEntries: 12 })])).toBe(24);
  });

  it("counts each team's squad from its line-up", () => {
    expect(
      playerCount([
        category({
          entry: {
            type: "team",
            lineUp: [
              { event: "MS", count: 3 },
              { event: "MD", count: 2 },
            ],
          },
          expectedEntries: 6,
        }),
      ]),
      // One player per rubber: 3 singles x 1 + 2 doubles x 2 = 7 per team.
    ).toBe(42);
  });

  it("charges teams per team or per player", () => {
    const team = { type: "team" as const, lineUp: [{ event: "MS" as const, count: 3 }, { event: "XD" as const, count: 1 }] };
    expect(
      categoryRevenue(category({ entry: team, expectedEntries: 4, fee: { basis: "entry", amount: 50, expectedExternal: 0 } })),
    ).toBe(200);
    expect(
      categoryRevenue(category({ entry: team, expectedEntries: 4, fee: { basis: "player", amount: 8, expectedExternal: 0 } })),
    ).toBe(160);
  });
});

describe("finance", () => {
  const context = { categories: [category()], courtWindows: [], games: 30, umpires: 4 };

  it("totals revenue, costs and profit", () => {
    const result = finance(
      inputs({
        prizes: [
          { categoryId: "c1", position: "Winners", amount: 40 },
          { categoryId: "c1", position: "Runners-up", amount: 20 },
        ],
        otherCosts: [
          { id: "hall", label: "Court hire", type: "fixed", amount: 50 },
        ],
      }),
      context,
    );
    expect(result.revenue).toBe(200);
    expect(result.shuttles).toBe(30);
    expect(result.shuttleCost).toBe(60);
    expect(result.prizeCost).toBe(60);
    expect(result.totalCost).toBe(170);
    expect(result.profit).toBe(30);
  });

  it("charges per-person costs by the chosen headcount", () => {
    const result = finance(
      inputs({
        shuttlesPerGame: 0,
        otherCosts: [
          { id: "a", label: "Player gift", type: "perPerson", amount: 1, basis: "players" },
          { id: "b", label: "Umpire food", type: "perPerson", amount: 5, basis: "umpires" },
          { id: "c", label: "Helpers", type: "perPerson", amount: 3, basis: "custom", count: 6 },
        ],
      }),
      context,
    );
    expect(result.otherCosts.map((c) => c.amount)).toEqual([20, 20, 18]);
    expect(result.otherCosts.map((c) => c.perPerson?.headcount)).toEqual([20, 4, 6]);
  });

  it("shows the cost to organisers with zero fees and prizes", () => {
    const result = finance(inputs(), {
      ...context,
      categories: [
        category({ fee: { basis: "entry", amount: 0, expectedExternal: 0 } }),
      ],
    });
    expect(result.revenue).toBe(0);
    expect(result.profit).toBe(-60);
  });
});

describe("courtHire", () => {
  const window = (from: string, to: string, courts: number, ratePerCourtHour: number) => ({
    from: `2026-05-02T${from}:00Z`,
    to: `2026-05-02T${to}:00Z`,
    courts,
    ratePerCourtHour,
  });

  it("charges every booked hour on every court at the window's rate", () => {
    const hire = courtHire([window("08:00", "12:00", 6, 12), window("12:00", "16:00", 4, 9.5)]);
    expect(hire.windows.map((w) => w.amount)).toEqual([288, 152]);
    expect(hire.total).toBe(440);
  });

  it("charges part hours", () => {
    expect(courtHire([window("08:00", "09:30", 2, 10)]).total).toBe(30);
  });

  it("is free at a zero rate", () => {
    expect(courtHire([window("08:00", "12:00", 6, 0)]).total).toBe(0);
  });

  it("is part of total cost and profit", () => {
    const result = finance(inputs({ shuttlesPerGame: 0 }), {
      categories: [category()],
      courtWindows: [window("08:00", "10:00", 3, 10)],
      games: 0,
      umpires: 0,
    });
    expect(result.courtHire.total).toBe(60);
    expect(result.totalCost).toBe(60);
    expect(result.profit).toBe(200 - 60);
  });
});
