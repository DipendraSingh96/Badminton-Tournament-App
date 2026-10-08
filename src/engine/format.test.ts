import { describe, expect, it } from "vitest";
import {
  categoryFormat,
  groupMatchCount,
  knockoutMatchCounts,
  proposeGroupSizes,
  splitEvenly,
} from "./format";
import type { Category } from "./types";

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Sample",
    expectedPairs: 12,
    groups: { type: "fixed", groupCount: 3 },
    qualifiersPerGroup: 2,
    bronze: false,
    fee: { basis: "pair", amount: 0, expectedExternal: 0 },
    ...overrides,
  };
}

describe("groupMatchCount", () => {
  it.each([
    [2, 1],
    [3, 3],
    [4, 6],
    [5, 10],
    [6, 15],
  ])("a group of %i plays %i matches (n(n−1)/2)", (size, matches) => {
    expect(groupMatchCount(size)).toBe(matches);
  });
});

describe("splitEvenly", () => {
  it("balances sizes to within one, largest first", () => {
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(12, 4)).toEqual([3, 3, 3, 3]);
  });
});

describe("proposeGroupSizes", () => {
  it("uses the fixed group count", () => {
    expect(proposeGroupSizes(11, { type: "fixed", groupCount: 2 })).toEqual([
      6, 5,
    ]);
  });

  it("picks the group count nearest the preferred size", () => {
    expect(proposeGroupSizes(16, { type: "auto", preferredSize: 4 })).toEqual([
      4, 4, 4, 4,
    ]);
    expect(proposeGroupSizes(14, { type: "auto", preferredSize: 4 })).toEqual([
      4, 4, 3, 3,
    ]);
  });

  it("never proposes groups of one", () => {
    expect(proposeGroupSizes(5, { type: "auto", preferredSize: 1 })).toEqual([
      3, 2,
    ]);
  });
});

describe("knockoutMatchCounts", () => {
  it("plays qualifiers − 1 matches, with byes filling the bracket", () => {
    const counts = knockoutMatchCounts(6, false);
    expect(counts.knockout + counts.final).toBe(5);
  });

  it("adds a bronze match only when there are two semifinal losers", () => {
    expect(knockoutMatchCounts(4, true).bronze).toBe(1);
    expect(knockoutMatchCounts(3, true).bronze).toBe(0);
    expect(knockoutMatchCounts(8, false).bronze).toBe(0);
  });

  it("has no knockout with fewer than two qualifiers", () => {
    expect(knockoutMatchCounts(1, true)).toEqual({
      knockout: 0,
      bronze: 0,
      final: 0,
    });
  });
});

describe("categoryFormat", () => {
  it("counts matches per stage", () => {
    const result = categoryFormat(category({ bronze: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format.groupSizes).toEqual([4, 4, 4]);
    expect(result.format.qualifiers).toBe(6);
    expect(result.format.matches).toEqual({
      group: 18,
      knockout: 4,
      bronze: 1,
      final: 1,
    });
    expect(result.format.totalMatches).toBe(24);
  });

  it.each([
    [true, 1, 64],
    [false, 0, 63],
  ])(
    "8 groups of 4 with 2 qualifiers each, bronze %s",
    (bronze, bronzeMatches, total) => {
      const result = categoryFormat(
        category({
          expectedPairs: 32,
          groups: { type: "fixed", groupCount: 8 },
          qualifiersPerGroup: 2,
          bronze,
        }),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.format.groupSizes).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
      expect(result.format.qualifiers).toBe(16);
      // 8 × 6 group matches; 16 qualifiers play 15 knockout matches.
      expect(result.format.matches).toEqual({
        group: 48,
        knockout: 14,
        bronze: bronzeMatches,
        final: 1,
      });
      expect(result.format.totalMatches).toBe(total);
    },
  );

  it("recomputes when entries change", () => {
    const before = categoryFormat(category({ expectedPairs: 12 }));
    const after = categoryFormat(category({ expectedPairs: 15 }));
    if (!before.ok || !after.ok) throw new Error("expected valid formats");
    expect(after.format.matches.group).toBeGreaterThan(
      before.format.matches.group,
    );
  });

  it("rejects too few pairs", () => {
    expect(categoryFormat(category({ expectedPairs: 1 }))).toEqual({
      ok: false,
      errors: [{ code: "tooFewPairs", minimum: 2 }],
    });
  });

  it("rejects more groups than pairs allow", () => {
    const result = categoryFormat(
      category({ expectedPairs: 5, groups: { type: "fixed", groupCount: 3 } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      code: "invalidGroupCount",
      maximum: 2,
    });
  });

  it("rejects more qualifiers than the smallest group", () => {
    const result = categoryFormat(
      category({ expectedPairs: 7, qualifiersPerGroup: 4 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      code: "invalidQualifiers",
      maximum: 2,
    });
  });
});
