import { describe, expect, it } from "vitest";
import { groupFixtures, knockoutBracket, seedPositions } from "./fixtures";
import { knockoutRounds } from "./format";
import { groupRounds } from "./waves";

describe("groupFixtures", () => {
  it("pairs every slot with every other once, at most once a round", () => {
    for (const size of [2, 3, 4, 5, 6, 7]) {
      const rounds = groupFixtures(size);
      expect(rounds).toHaveLength(groupRounds(size));
      const seen = new Set<string>();
      for (const round of rounds) {
        expect(round).toHaveLength(Math.floor(size / 2));
        const playing = round.flat();
        expect(new Set(playing).size).toBe(playing.length);
        for (const [a, b] of round) {
          expect(a).toBeLessThan(b);
          seen.add(`${a}-${b}`);
        }
      }
      expect(seen.size).toBe((size * (size - 1)) / 2);
    }
  });

  it("starts a group of four with 1 v 4 and 2 v 3", () => {
    expect(groupFixtures(4)[0]).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });
});

describe("seedPositions", () => {
  it("keeps the top seeds apart", () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("knockoutBracket", () => {
  it("seeds winners against runners-up of other groups", () => {
    // 4 groups, 2 qualifiers each: quarter-finals.
    const { rounds, bronze } = knockoutBracket(8, 4, true);
    expect(rounds.map((r) => r.size)).toEqual([8, 4, 2]);
    expect(rounds[0]!.matches).toEqual([
      { code: "QF1", number: 1, home: "Winner A", away: "Runner-up D" },
      { code: "QF2", number: 2, home: "Winner D", away: "Runner-up A" },
      { code: "QF3", number: 3, home: "Winner B", away: "Runner-up C" },
      { code: "QF4", number: 4, home: "Winner C", away: "Runner-up B" },
    ]);
    expect(rounds[1]!.matches).toEqual([
      { code: "SF1", number: 1, home: "Winner QF1", away: "Winner QF2" },
      { code: "SF2", number: 2, home: "Winner QF3", away: "Winner QF4" },
    ]);
    expect(rounds[2]!.matches).toEqual([{ code: "Final", number: 1, home: "Winner SF1", away: "Winner SF2" }]);
    expect(bronze).toEqual({ code: "Bronze", number: 1, home: "Loser SF1", away: "Loser SF2" });
  });

  it("gives the top seeds byes", () => {
    // 3 groups, 2 each: 6 qualifiers in a bracket of 8; winners A and B go straight to the semi-finals.
    const { rounds } = knockoutBracket(6, 3, false);
    expect(rounds[0]!.matches).toEqual([
      { code: "QF1", number: 1, home: "Runner-up A", away: "Runner-up B" },
      { code: "QF2", number: 2, home: "Winner C", away: "Runner-up C" },
    ]);
    expect(rounds[1]!.matches).toEqual([
      { code: "SF1", number: 1, home: "Winner A", away: "Winner QF1" },
      { code: "SF2", number: 2, home: "Winner B", away: "Winner QF2" },
    ]);
  });

  it("plays as many matches per round as the format counts", () => {
    for (const [q, groups] of [
      [4, 2],
      [6, 3],
      [8, 4],
      [12, 6],
    ] as const) {
      const { rounds } = knockoutBracket(q, groups, false);
      const beforeFinal = rounds.slice(0, -1).map((r) => r.matches.length);
      expect(beforeFinal).toEqual(knockoutRounds(q).map((r) => r.matches));
    }
  });

  it("uses seeds for knockout only", () => {
    expect(knockoutBracket(4, 0, false).rounds[0]!.matches[0]).toEqual({
      code: "SF1",
      number: 1,
      home: "Seed 1",
      away: "Seed 4",
    });
  });
});
