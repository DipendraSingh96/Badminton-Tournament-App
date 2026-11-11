import { describe, expect, it } from "vitest";
import { countFixture, entryInPlace, fixtureWinner, groupStandings, type PlayedFixture } from "./standings";
import type { TiebreakCriterion } from "./types";

/** A one-game match. */
const match = (home: string, away: string, score: [number, number]): PlayedFixture => ({ home, away, rubbers: [[score]] });
const order = (rows: { id: string }[]) => rows.map((r) => r.id);
const ALL: TiebreakCriterion[] = ["matchesWon", "gameDifference", "pointDifference", "headToHead", "pointsWon"];

describe("group standings", () => {
  it("counts played, won, lost, games and points from finished fixtures", () => {
    const rows = groupStandings({
      entries: ["a", "b", "c"],
      fixtures: [
        { home: "a", away: "b", rubbers: [[[21, 15], [18, 21], [21, 19]]] },
        match("c", "a", [21, 10]),
      ],
      tiebreaks: ["matchesWon"],
    });
    const a = rows.find((r) => r.id === "a")!;
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, gamesWon: 2, gamesLost: 2, pointsWon: 70, pointsLost: 76 });
    expect(rows.find((r) => r.id === "b")).toMatchObject({ played: 1, won: 0, lost: 1, gamesWon: 1, gamesLost: 2, pointsWon: 55, pointsLost: 60 });
  });

  it("ranks by matches won first", () => {
    const rows = groupStandings({
      entries: ["a", "b", "c"],
      fixtures: [match("a", "b", [10, 21]), match("b", "c", [21, 5]), match("a", "c", [21, 19])],
      tiebreaks: ["matchesWon"],
    });
    expect(order(rows)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(rows.every((r) => !r.shared)).toBe(true);
  });

  // Three entries beat each other in a ring: one win each.
  const ring = [match("a", "b", [21, 19]), match("b", "c", [21, 10]), match("c", "a", [21, 15])];
  // Points: a 36–40 (−4), b 40–31 (+9), c 31–36 (−5).

  it("separates entries level on wins by point difference", () => {
    expect(order(groupStandings({ entries: ["a", "b", "c"], fixtures: ring, tiebreaks: ["matchesWon", "pointDifference"] }))).toEqual(["b", "a", "c"]);
  });

  it("separates by points won", () => {
    expect(order(groupStandings({ entries: ["a", "b", "c"], fixtures: ring, tiebreaks: ["matchesWon", "pointsWon"] }))).toEqual(["b", "a", "c"]);
  });

  it("separates by game difference", () => {
    const rows = groupStandings({
      entries: ["a", "b", "c"],
      fixtures: [
        { home: "a", away: "b", rubbers: [[[21, 10], [21, 10]]] },
        { home: "b", away: "c", rubbers: [[[21, 10], [10, 21], [21, 10]]] },
        { home: "c", away: "a", rubbers: [[[21, 10], [10, 21], [21, 10]]] },
      ],
      tiebreaks: ["matchesWon", "gameDifference"],
    });
    // Games: a 3–2, b 2–3, c 3–3.
    expect(order(rows)).toEqual(["a", "c", "b"]);
  });

  it("follows the configured order", () => {
    // Four entries; a and b level on wins. a has the better point difference, b beat a.
    const fixtures = [
      match("a", "b", [19, 21]),
      match("a", "c", [21, 2]),
      match("a", "d", [21, 2]),
      match("b", "c", [21, 19]),
      match("b", "d", [19, 21]),
      match("c", "d", [21, 19]),
    ];
    const entries = ["a", "b", "c", "d"];
    expect(order(groupStandings({ entries, fixtures, tiebreaks: ["matchesWon", "pointDifference", "headToHead"] })).slice(0, 2)).toEqual(["a", "b"]);
    expect(order(groupStandings({ entries, fixtures, tiebreaks: ["matchesWon", "headToHead", "pointDifference"] })).slice(0, 2)).toEqual(["b", "a"]);
  });

  it("looks only at the matches between the level entries for head-to-head", () => {
    // a, b, c each win two; d loses all. Among a, b, c it's a ring, so head-to-head can't split them.
    const fixtures = [...ring, match("a", "d", [21, 0]), match("b", "d", [21, 0]), match("c", "d", [21, 0])];
    const rows = groupStandings({ entries: ["a", "b", "c", "d"], fixtures, tiebreaks: ["matchesWon", "headToHead"] });
    expect(rows.map((r) => [r.id, r.place, r.shared])).toEqual([
      ["a", 1, true],
      ["b", 1, true],
      ["c", 1, true],
      ["d", 4, false],
    ]);
    // The next criterion then separates them.
    expect(order(groupStandings({ entries: ["a", "b", "c", "d"], fixtures, tiebreaks: ["matchesWon", "headToHead", "pointDifference"] }))).toEqual(["b", "a", "c", "d"]);
  });

  it("splits two level entries by the match between them", () => {
    // a and c both win two of three; c beat a.
    const fixtures = [
      match("a", "b", [21, 5]),
      match("a", "c", [19, 21]),
      match("a", "d", [21, 5]),
      match("b", "c", [21, 19]),
      match("b", "d", [5, 21]),
      match("c", "d", [21, 19]),
    ];
    expect(order(groupStandings({ entries: ["a", "b", "c", "d"], fixtures, tiebreaks: ["matchesWon", "headToHead"] })).slice(0, 2)).toEqual(["c", "a"]);
  });

  it("settles what's left by lots, the same way every time", () => {
    const input = { entries: ["a", "b", "c"], fixtures: ring, tiebreaks: ["matchesWon", "drawOfLots"] as TiebreakCriterion[], lots: { a: 7, b: 9, c: 2 } };
    const rows = groupStandings(input);
    expect(order(rows)).toEqual(["c", "a", "b"]);
    expect(rows.every((r) => !r.shared)).toBe(true);
    expect(order(groupStandings(input))).toEqual(["c", "a", "b"]);
  });

  it("shares a place between entries level on everything, in draw order", () => {
    const rows = groupStandings({ entries: ["a", "b", "c"], fixtures: [], tiebreaks: ALL });
    expect(rows.map((r) => [r.id, r.place, r.shared])).toEqual([
      ["a", 1, true],
      ["b", 1, true],
      ["c", 1, true],
    ]);
    expect(entryInPlace(rows, 1)).toBeNull();
  });

  it("names the entry in a settled place", () => {
    const rows = groupStandings({ entries: ["a", "b"], fixtures: [match("a", "b", [15, 21])], tiebreaks: ["matchesWon"] });
    expect(entryInPlace(rows, 1)).toBe("b");
    expect(entryInPlace(rows, 2)).toBe("a");
    expect(entryInPlace(rows, 3)).toBeNull();
  });

  it("counts a team tie by its rubbers", () => {
    const tie: [number, number][][] = [[[21, 10]], [[15, 21]], [[21, 19]]];
    expect(countFixture(tie)).toEqual({ rubbersWon: 2, rubbersLost: 1, gamesWon: 2, gamesLost: 1, pointsWon: 57, pointsLost: 50 });
    expect(fixtureWinner(tie)).toBe("home");
    const rows = groupStandings({
      entries: ["x", "y", "z"],
      fixtures: [
        { home: "x", away: "y", rubbers: tie },
        { home: "y", away: "z", rubbers: [[[21, 10]], [[21, 10]], [[21, 10]]] },
        { home: "z", away: "x", rubbers: [[[21, 10]], [[21, 10]], [[10, 21]]] },
      ],
      tiebreaks: ["matchesWon", "rubbersWon"],
    });
    // One tie each; rubbers won: x 3, y 4, z 2.
    expect(order(rows)).toEqual(["y", "x", "z"]);
    expect(rows[0]).toMatchObject({ played: 2, won: 1, lost: 1, rubbersWon: 4 });
  });

  it("gives an awarded match to the side it was given to, whatever the scores", () => {
    // A walkover with no games or points: a win and nothing else.
    const bare: PlayedFixture = { home: "a", away: "b", rubbers: [[]], awards: [{ winner: "away" }] };
    expect(fixtureWinner(bare.rubbers, bare.awards)).toBe("away");
    const rows = groupStandings({ entries: ["a", "b"], fixtures: [bare], tiebreaks: ["matchesWon"] });
    expect(rows[0]).toMatchObject({ id: "b", played: 1, won: 1, gamesWon: 0, pointsWon: 0 });
    // A walkover in straight games: the games and points count too.
    const straight: PlayedFixture = { home: "a", away: "b", rubbers: [[[21, 0], [21, 0]]], awards: [{ winner: "home" }] };
    expect(countFixture(straight.rubbers, straight.awards)).toMatchObject({ rubbersWon: 1, gamesWon: 2, pointsWon: 42 });
  });

  it("keeps a retired match's points, and its finished games, but not the game it stopped in", () => {
    // Home won the first game and led the second when they retired: away is given the match.
    const retired: PlayedFixture = { home: "a", away: "b", rubbers: [[[21, 15], [11, 5]]], awards: [{ winner: "away", open: true }] };
    expect(countFixture(retired.rubbers, retired.awards)).toEqual({ rubbersWon: 0, rubbersLost: 1, gamesWon: 1, gamesLost: 0, pointsWon: 32, pointsLost: 20 });
    expect(fixtureWinner(retired.rubbers, retired.awards)).toBe("away");
  });

  it("puts entries that withdrew after everyone else", () => {
    const rows = groupStandings({
      entries: ["a", "b", "c"],
      fixtures: [match("a", "b", [21, 10]), match("a", "c", [21, 10])],
      tiebreaks: ["matchesWon"],
      withdrawn: ["a"],
    });
    expect(rows.map((r) => [r.id, r.place])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
    ]);
  });

  it("orders entries still level by a decision made by hand", () => {
    const input = { entries: ["a", "b", "c"], fixtures: ring, tiebreaks: ["matchesWon"] as TiebreakCriterion[] };
    expect(groupStandings(input).every((r) => r.shared)).toBe(true);
    const rows = groupStandings({ ...input, byHand: ["c", "a", "b"] });
    expect(rows.map((r) => [r.id, r.place, r.shared])).toEqual([
      ["c", 1, false],
      ["a", 2, false],
      ["b", 3, false],
    ]);
    // A decision that leaves one of them out settles nothing.
    expect(groupStandings({ ...input, byHand: ["c", "a"] }).every((r) => r.shared)).toBe(true);
    // It never overrides a tiebreak that did separate them.
    expect(order(groupStandings({ ...input, tiebreaks: ["matchesWon", "pointDifference"], byHand: ["c", "a", "b"] }))).toEqual(["b", "a", "c"]);
  });

  it("gives a tie level on rubbers to games, then points", () => {
    expect(fixtureWinner([[[21, 10]], [[10, 21]]])).toBeNull();
    expect(fixtureWinner([[[21, 10]], [[10, 21], [20, 22]]])).toBe("away");
    expect(fixtureWinner([[[21, 10]], [[12, 21]]])).toBe("home");
  });
});
