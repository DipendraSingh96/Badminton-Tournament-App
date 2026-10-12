import { describe, expect, it } from "vitest";
import { matchMinutes, maxPointsPerGame } from "./duration";
import type { StageRules, Timing } from "./types";

function rules(overrides: Partial<StageRules> = {}): StageRules {
  return {
    pointsPerGame: 20,
    deuce: { type: "none" },
    bestOf: 1,
    ...overrides,
  };
}

const timing: Timing = { minutesPerGame: 10, changeoverMinutes: 4 };

describe("maxPointsPerGame", () => {
  it("is the target with no deuce", () => {
    expect(maxPointsPerGame(rules())).toBe(20);
  });

  it("is the cap with a hard cap", () => {
    expect(maxPointsPerGame(rules({ deuce: { type: "cap", cap: 25 } }))).toBe(
      25,
    );
  });

  it("is the maximum with standard deuce", () => {
    expect(
      maxPointsPerGame(rules({ deuce: { type: "standard", max: 30 } })),
    ).toBe(30);
  });
});

describe("matchMinutes", () => {
  it("is the same typical and worst for a straight race, best of 1", () => {
    expect(matchMinutes(rules(), timing)).toMatchObject({ typical: 14, worst: 14 });
  });

  it("scales the worst case by the longest possible game", () => {
    expect(
      matchMinutes(rules({ deuce: { type: "standard", max: 30 } }), timing),
    ).toMatchObject({ typical: 14, worst: 19 });
  });

  it("plays two games typically and three at worst in best of 3", () => {
    expect(matchMinutes(rules({ bestOf: 3 }), timing)).toMatchObject({
      typical: 24,
      worst: 34,
    });
  });

  it("adds the best-of-3 allowance to the whole typical match", () => {
    const slot = matchMinutes(rules({ bestOf: 3 }), { minutesPerGame: 12, changeoverMinutes: 3 }, 0.33);
    expect(slot.typicalBeforeAllowance).toBe(27);
    expect(slot.typical).toBeCloseTo(35.91);
    expect(slot.worst).toBe(39);
    expect(slot.typicalGames).toBeCloseTo(2.66);
    expect(slot.capped).toBe(false);
  });

  it("leaves best of 1 unaffected by the allowance", () => {
    expect(matchMinutes(rules(), timing, 0.33)).toMatchObject({ typical: 14, allowance: 0, typicalGames: 1 });
  });

  it("never lets typical exceed the worst case", () => {
    const slot = matchMinutes(rules({ bestOf: 3 }), timing, 1);
    // (2 x 10 + 4) x 2 = 48 would pass the worst case of 3 x 10 + 4 = 34.
    expect(slot.typical).toBe(34);
    expect(slot.capped).toBe(true);
    expect(slot.typicalGames).toBe(3);
  });

  it("takes minutes and organising time from the stage's timing", () => {
    const longer: Timing = { minutesPerGame: 15, changeoverMinutes: 5 };
    expect(matchMinutes(rules({ bestOf: 3 }), longer)).toMatchObject({ typical: 35, worst: 50 });
  });
});
