import { describe, expect, it } from "vitest";
import { makeDraw, seededRandom } from "./draw";

const entries = (n: number, seeds = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, seed: i < seeds ? i + 1 : null }));

describe("makeDraw", () => {
  it("places every entry once, in groups of the given sizes", () => {
    const result = makeDraw(entries(14), [4, 4, 3, 3], 7);
    if (!result.ok) throw new Error("draw failed");
    expect(result.groups.map((g) => g.length)).toEqual([4, 4, 3, 3]);
    expect(new Set(result.groups.flat()).size).toBe(14);
  });

  it("spreads the seeds one per group, at the top, then snakes back", () => {
    const result = makeDraw(entries(16, 6), [4, 4, 4, 4], 1);
    if (!result.ok) throw new Error("draw failed");
    expect(result.groups.map((g) => g[0])).toEqual(["e1", "e2", "e3", "e4"]);
    // Seeds 5 and 6 go back down the groups: D then C.
    expect(result.groups[3]).toContain("e5");
    expect(result.groups[2]).toContain("e6");
  });

  it("gives the same draw for the same number, and another for a new one", () => {
    const a = makeDraw(entries(16), [4, 4, 4, 4], 42);
    const b = makeDraw(entries(16), [4, 4, 4, 4], 42);
    const c = makeDraw(entries(16), [4, 4, 4, 4], 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("refuses when the entries don't match the places", () => {
    expect(makeDraw(entries(10), [4, 4], 1)).toEqual({
      ok: false,
      error: { type: "sizeMismatch", entries: 10, places: 8 },
    });
  });

  it("draws numbers between 0 and 1", () => {
    const random = seededRandom(5);
    for (let i = 0; i < 100; i++) {
      const x = random();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
