import { describe, expect, it } from "vitest";
import { matchMinutes, maxPointsPerGame } from "./duration";
import type { StageRules } from "./types";

function rules(overrides: Partial<StageRules> = {}): StageRules {
  return {
    pointsPerGame: 20,
    deuce: { type: "none" },
    bestOf: 1,
    minutesPerGame: 10,
    changeoverMinutes: 4,
    ...overrides,
  };
}

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
    expect(matchMinutes(rules())).toMatchObject({ typical: 14, worst: 14 });
  });

  it("scales the worst case by the longest possible game", () => {
    expect(
      matchMinutes(rules({ deuce: { type: "standard", max: 30 } })),
    ).toMatchObject({ typical: 14, worst: 19 });
  });

  it("plays two games typically and three at worst in best of 3", () => {
    expect(matchMinutes(rules({ bestOf: 3 }))).toMatchObject({
      typical: 24,
      worst: 34,
    });
  });
});
