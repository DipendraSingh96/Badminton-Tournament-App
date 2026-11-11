import { describe, expect, it } from "vitest";
import { gameWinner, matchOutcome } from "./score";
import type { StageRules } from "./types";

const plain: StageRules = { pointsPerGame: 21, deuce: { type: "none" }, bestOf: 1 };
const byTwo: StageRules = { pointsPerGame: 21, deuce: { type: "standard", max: 30 }, bestOf: 1 };
const capped: StageRules = { pointsPerGame: 15, deuce: { type: "cap", cap: 17 }, bestOf: 1 };

describe("gameWinner", () => {
  it("is nobody's while nothing or only one side is entered", () => {
    expect(gameWinner(plain, [null, null])).toEqual({ winner: null, problem: null });
    expect(gameWinner(plain, [21, null])).toEqual({ winner: null, problem: "Enter both sides' scores" });
  });

  it("with no deuce, is the first to the points per game", () => {
    expect(gameWinner(plain, [21, 20]).winner).toBe("home");
    expect(gameWinner(plain, [3, 21]).winner).toBe("away");
    expect(gameWinner(plain, [20, 18])).toEqual({ winner: null, problem: "20–18 isn't finished: first to 21" });
    expect(gameWinner(plain, [22, 20]).problem).toBe("22–20 can't happen: a game stops at 21");
  });

  it("with a deuce rule, needs two clear points up to the maximum", () => {
    expect(gameWinner(byTwo, [21, 19]).winner).toBe("home");
    expect(gameWinner(byTwo, [21, 20])).toEqual({ winner: null, problem: "21–20 isn't finished: win by two" });
    expect(gameWinner(byTwo, [22, 24]).winner).toBe("away");
    expect(gameWinner(byTwo, [25, 24]).problem).toBe("25–24 isn't finished: win by two");
    // The game would have stopped at 21–15.
    expect(gameWinner(byTwo, [24, 15]).problem).toBe("24–15 can't happen: the game was won at 21");
    // At the maximum, one clear is enough.
    expect(gameWinner(byTwo, [30, 29]).winner).toBe("home");
    expect(gameWinner(byTwo, [28, 30]).winner).toBe("away");
    expect(gameWinner(byTwo, [30, 20]).problem).toBe("30–20 can't happen: the game was won at 21");
    expect(gameWinner(byTwo, [31, 29]).problem).toBe("31–29 can't happen: a game stops at 30");
  });

  it("treats a hard cap the same way, at the cap", () => {
    expect(gameWinner(capped, [15, 13]).winner).toBe("home");
    expect(gameWinner(capped, [15, 14]).problem).toBe("15–14 isn't finished: win by two");
    expect(gameWinner(capped, [17, 16]).winner).toBe("home");
  });

  it("never ends level, and takes whole numbers only", () => {
    expect(gameWinner(byTwo, [21, 21]).problem).toBe("21–21 can't be a final score: a game can't end level");
    expect(gameWinner(plain, [10, 10]).problem).toBe("10–10 isn't finished");
    expect(gameWinner(plain, [21.5, 3]).problem).toBe("Scores are whole numbers from 0");
  });
});

describe("matchOutcome", () => {
  it("is one game for best of 1", () => {
    expect(matchOutcome(plain, [[21, 12]])).toMatchObject({ home: 1, away: 0, winner: "home", finished: true, problem: null });
    expect(matchOutcome(plain, [])).toMatchObject({ winner: null, finished: false, problem: null });
  });

  it("is the first to two games for best of 3", () => {
    const three: StageRules = { ...byTwo, bestOf: 3 };
    expect(matchOutcome(three, [[21, 12]])).toMatchObject({ home: 1, away: 0, winner: null, finished: false });
    expect(matchOutcome(three, [[21, 12], [21, 19]])).toMatchObject({ home: 2, away: 0, winner: "home", finished: true });
    expect(matchOutcome(three, [[21, 12], [18, 21], [19, 21]])).toMatchObject({ home: 1, away: 2, winner: "away", finished: true });
  });

  it("flags a game that wasn't played, and a gap", () => {
    const three: StageRules = { ...byTwo, bestOf: 3 };
    const extra = matchOutcome(three, [[21, 12], [21, 19], [21, 3]]);
    expect(extra.finished).toBe(false);
    expect(extra.problem).toBe("Game 3 wasn't played: the match was won in 2");
    const gap = matchOutcome(three, [[21, 12], [null, null], [21, 3]]);
    expect(gap.problem).toBe("Finish game 2 first");
  });

  it("isn't finished while a game's score is wrong", () => {
    const three: StageRules = { ...byTwo, bestOf: 3 };
    const result = matchOutcome(three, [[21, 12], [21, 20]]);
    expect(result).toMatchObject({ home: 1, winner: null, finished: false, problem: "21–20 isn't finished: win by two" });
  });
});
