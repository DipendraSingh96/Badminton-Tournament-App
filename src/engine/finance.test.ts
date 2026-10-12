import { describe, expect, it } from "vitest";
import { categoryRevenue, categoryRevenueWorking, finance, playerCount } from "./finance";
import { hall } from "./fixtures.test-helpers";
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
    otherIncome: [],
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

  it("charges external entries their own fee, counting players for a per-player fee", () => {
    // 5 external pairs of 10: 10 of the 20 players pay the external fee.
    expect(
      categoryRevenueWorking(
        category({
          fee: { basis: "player", amount: 8, externalAmount: 12, expectedExternal: 5 },
        }),
      ),
    ).toMatchObject({ entrants: 20, external: 10, fee: 8, externalFee: 12 });
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
    ).toBe(10 * 8 + 10 * 12);
    expect(
      categoryRevenue(
        category({ fee: { basis: "entry", amount: 20, externalAmount: 30, expectedExternal: 5 } }),
      ),
    ).toBe(5 * 20 + 5 * 30);
  });

  it("never counts more external entries than entries", () => {
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
  const context = { categories: [category()], halls: [], games: 30, umpires: 4 };

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

  it("adds other money in to revenue, fixed or per person", () => {
    const result = finance(
      inputs({
        otherIncome: [
          { id: "s", label: "Sponsorship", type: "fixed", amount: 200 },
          { id: "p", label: "Sponsor per player", type: "perPerson", amount: 2, basis: "players" },
          { id: "t", label: "Spectator tickets", type: "perPerson", amount: 3, basis: "custom", count: 10 },
        ],
      }),
      context,
    );
    expect(result.entryRevenue).toBe(200);
    expect(result.otherIncome.map((i) => i.amount)).toEqual([200, 40, 30]);
    expect(result.otherIncome[1]!.perPerson).toEqual({ rate: 2, basis: "players", headcount: 20 });
    expect(result.incomeTotal).toBe(270);
    expect(result.revenue).toBe(470);
    expect(result.profit).toBe(470 - result.totalCost);
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

describe("court hire in finance", () => {
  it("is part of total cost and profit", () => {
    const result = finance(inputs({ shuttlesPerGame: 0 }), {
      categories: [category()],
      halls: [hall("h1", "08:00", "10:00", { courtCount: 3, rate: 10 })],
      games: 0,
      umpires: 0,
    });
    expect(result.courtHire.total).toBe(60);
    expect(result.totalCost).toBe(60);
    expect(result.profit).toBe(200 - 60);
  });
});
