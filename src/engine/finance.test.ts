import { describe, expect, it } from "vitest";
import { categoryRevenue, finance } from "./finance";
import type { Category, Finance } from "./types";

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Sample",
    expectedPairs: 10,
    groups: { type: "fixed", groupCount: 2 },
    qualifiersPerGroup: 2,
    bronze: false,
    fee: { basis: "pair", amount: 20, expectedExternal: 0 },
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
          expectedPairs: 2,
          fee: { basis: "pair", amount: 10, externalAmount: 15, expectedExternal: 9 },
        }),
      ),
    ).toBe(30);
  });
});

describe("finance", () => {
  const context = { categories: [category()], games: 30, umpires: 4 };

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
  });

  it("shows the cost to organisers with zero fees and prizes", () => {
    const result = finance(inputs(), {
      ...context,
      categories: [
        category({ fee: { basis: "pair", amount: 0, expectedExternal: 0 } }),
      ],
    });
    expect(result.revenue).toBe(0);
    expect(result.profit).toBe(-60);
  });
});
