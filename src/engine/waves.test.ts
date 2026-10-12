import { describe, expect, it } from "vitest";
import { groupMatchCount } from "./format";
import { fixturesPerEntry, groupRounds, groupStageWaves } from "./waves";

describe("groupRounds", () => {
  it("needs size − 1 rounds for an even group and size for an odd one", () => {
    expect([2, 3, 4, 5, 6].map(groupRounds)).toEqual([1, 3, 3, 5, 5]);
  });

  it("holds every fixture of the group across its rounds", () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      expect(groupRounds(size) * Math.floor(size / 2)).toBe(groupMatchCount(size));
    }
  });
});

describe("groupStageWaves", () => {
  it("takes its waves from the largest group", () => {
    expect(groupStageWaves([4, 4, 4, 3])).toEqual({
      waves: 3,
      fixturesPerWave: [7, 7, 7],
      mostFixtures: 7,
    });
    // A group of 5 needs 5 rounds; the groups of 4 sit out the last two.
    expect(groupStageWaves([5, 4])).toEqual({
      waves: 5,
      fixturesPerWave: [4, 4, 4, 2, 2],
      mostFixtures: 4,
    });
  });

  it("has no waves without groups", () => {
    expect(groupStageWaves([])).toEqual({ waves: 0, fixturesPerWave: [], mostFixtures: 0 });
  });
});

describe("fixturesPerEntry", () => {
  it("plays everyone else in the group once", () => {
    expect(fixturesPerEntry(4)).toBe(3);
  });
});
