import { describe, expect, it } from "vitest";
import { knockoutBracket } from "@/engine";
import {
  boardBracket,
  boardCalls,
  boardCourts,
  boardPages,
  boardProgress,
  boardTables,
  boardUpNext,
  publicEntryName,
  publicName,
  type BoardSource,
} from "./audience";
import { awardMatch, startReadyGames } from "./changes";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { finishGame, setScore } from "./live";
import { liveDay } from "./live-day";

const NAMES = [
  ["Asha Patel", "Ravi Shah"],
  ["Mary-Jane Smith-Jones", "Tom O'Neil"],
  ["Cher", "Li Wei Chen"],
  ["Dan Hill", "Eve Stone"],
  ["Fay Moss", "Gus Park"],
  ["Hal Reed", "Ivy Lane"],
];

/** Six pairs in two groups of three on two courts from 09:00, then semi-finals, a final and a bronze match. Everyone checked in. */
function tournament(): { draft: PlanDraft; games: BoardSource[] } {
  const draft = completeDraft();
  draft.stage = "live";
  const category = draft.categories[0]!;
  draft.entries = NAMES.map((pair, i) => {
    const entry = { ...emptyEntry(category.id, 2), id: `e${i + 1}` };
    entry.players.forEach((p, n) => {
      p.name = pair[n]!;
      p.attendance = "arrived";
      p.phone = `07700 9000${i}${n}`;
    });
    return entry;
  });
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  const games: BoardSource[] = [];
  for (const [g, letter] of ["A", "B"].entries()) {
    [[1, 2], [1, 3], [2, 3]].forEach(([a, b], i) => {
      games.push({
        id: `c1:group:${letter}:${letter}${a}-${letter}${b}:r1`,
        courtId: g === 0 ? "c1" : "c2",
        from: 540 + i * 15,
        to: 555 + i * 15,
        match: { categoryId: "c1", stage: "group", group: letter, home: `${letter}${a}`, away: `${letter}${b}` },
      });
    });
  }
  const bracket = knockoutBracket(4, 2, true);
  [...bracket.rounds.flatMap((r) => r.matches), bracket.bronze!].forEach((m, i) => {
    const last = m.code === "Final" || m.code === "Bronze";
    games.push({
      id: `c1:ko:${m.code}:r1`,
      courtId: i % 2 === 0 ? "c1" : "c2",
      from: last ? 615 : 590,
      to: last ? 648 : 605,
      match: { categoryId: "c1", stage: m.code === "Final" ? "final" : m.code === "Bronze" ? "bronze" : "knockout", code: m.code, home: m.home, away: m.away },
    });
  });
  return { draft, games };
}

const minuteOf = (iso: string) => new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes();
const at = (hhmm: string) => `2026-07-04T${hhmm}:00.000Z`;
const courtIds = ["c1", "c2"];
const dayOf = (draft: PlanDraft, games: BoardSource[], now: number) => liveDay(draft, games, { now, minuteOf, courtIds });

/** Plays a game to 21–10 for the home side. */
function play(draft: PlanDraft, id: string, start: string, end: string) {
  setScore(draft, id, 0, 0, 21, at(start));
  setScore(draft, id, 0, 1, 10, at(start));
  finishGame(draft, id, at(end));
}

describe("names in public", () => {
  it("shows a name in full, as first name and initial, or as initials", () => {
    expect(publicName("  Asha  Patel ", "full")).toBe("Asha Patel");
    expect(publicName("Asha Patel", "firstInitial")).toBe("Asha P.");
    expect(publicName("Asha Patel", "initials")).toBe("A.P.");
    // One name only.
    expect(publicName("Cher", "firstInitial")).toBe("Cher");
    expect(publicName("Cher", "initials")).toBe("C.");
    // Middle names and double-barrelled names.
    expect(publicName("Li Wei Chen", "firstInitial")).toBe("Li C.");
    expect(publicName("Mary-Jane Smith-Jones", "firstInitial")).toBe("Mary-Jane S.");
    expect(publicName("Mary-Jane Smith-Jones", "initials")).toBe("M.J.S.J.");
    expect(publicName("", "initials")).toBe("");
  });

  it("names a pair by its players and a team by its own name", () => {
    const { draft } = tournament();
    const pair = draft.entries[0]!;
    expect(publicEntryName(draft, pair)).toBe("Asha Patel / Ravi Shah");
    draft.publicNames = "firstInitial";
    expect(publicEntryName(draft, pair)).toBe("Asha P. / Ravi S.");
    draft.publicNames = "initials";
    expect(publicEntryName(draft, pair)).toBe("A.P. / R.S.");
    // Two people with the same initials are left as they are.
    expect(publicEntryName(draft, { ...pair, players: pair.players.map((p) => ({ ...p, name: "Anna Price" })) })).toBe("A.P. / A.P.");
    // A team's name isn't a person's: it is shown whole.
    draft.unit = "team";
    expect(publicEntryName(draft, { ...pair, name: "Smash Brothers" })).toBe("Smash Brothers");
  });
});

describe("the audience board", () => {
  it("before the start shows the plan: every game waiting, in time order, and when play begins", () => {
    const { draft, games } = tournament();
    const day = dayOf(draft, games, 530);
    expect(boardProgress(draft, games, day)).toBe("Starts 09:00");
    const next = boardUpNext(draft, games, day);
    expect(next).toHaveLength(games.length);
    expect(next.map((g) => g.from)).toEqual([...next.map((g) => g.from)].sort((a, b) => a - b));
    expect(next[0]).toMatchObject({ time: "09:00", court: 1, where: "Group A", held: false, sides: [{ name: "Asha Patel / Ravi Shah" }, { name: "Mary-Jane Smith-Jones / Tom O'Neil" }] });
    expect(boardCourts(draft, games, day)[0]!.courts.map((c) => c.state)).toEqual(["upNext", "upNext"]);
    expect(boardCalls(draft, games, day)).toEqual([]);
  });

  it("shows each court's game and score, and takes started games out of Up next", () => {
    const { draft, games } = tournament();
    draft.startedAt = at("09:00");
    startReadyGames(draft, games, at("09:00"));
    setScore(draft, games[0]!.id, 0, 0, 11, at("09:05"));
    setScore(draft, games[0]!.id, 0, 1, 7, at("09:05"));
    const day = dayOf(draft, games, 545);
    const [hall] = boardCourts(draft, games, day);
    expect(hall!.courts[0]).toMatchObject({ number: 1, state: "onCourt", game: { games: [[11, 7]], where: "Group A", mark: null, tie: null } });
    expect(boardUpNext(draft, games, day).some((g) => g.id === games[0]!.id)).toBe(false);
    expect(boardProgress(draft, games, day)).toBe(`0 of ${games.length} games played`);
  });

  it("orders Up next by how the day is really going", () => {
    const { draft, games } = tournament();
    draft.startedAt = at("09:00");
    startReadyGames(draft, games, at("09:00"));
    // Court 1's first game ends early: its next game is now due before court 2's.
    play(draft, games[0]!.id, "09:00", "09:08");
    const day = dayOf(draft, games, 548);
    const next = boardUpNext(draft, games, day);
    expect(next[0]).toMatchObject({ id: games[1]!.id, time: "09:08", court: 1 });
    expect(next[1]).toMatchObject({ id: games[4]!.id, time: "09:15", court: 2 });
  });

  it("reverses a flipped hall's courts", () => {
    const { draft, games } = tournament();
    draft.frame.halls[0]!.flipped = true;
    expect(boardCourts(draft, games, dayOf(draft, games, 530))[0]!.courts.map((c) => c.number)).toEqual([2, 1]);
  });

  it("calls a held game's unchecked players to the desk until they arrive or the match is given", () => {
    const { draft, games } = tournament();
    // Entry 3 (Cher / Li Wei Chen) plays court 1's second game.
    draft.entries[2]!.players[0]!.attendance = "notYet";
    draft.startedAt = at("09:00");
    startReadyGames(draft, games, at("09:00"));
    // Not called while another game is still on their court.
    expect(boardCalls(draft, games, dayOf(draft, games, 541))).toEqual([]);
    play(draft, games[0]!.id, "09:00", "09:10");
    let day = dayOf(draft, games, 550);
    expect(boardCalls(draft, games, day)).toEqual([{ gameId: games[1]!.id, court: 1, names: ["Cher"] }]);
    expect(boardUpNext(draft, games, day).find((g) => g.id === games[1]!.id)).toMatchObject({ held: true });

    // Names follow the organiser's choice.
    draft.entries[2]!.players[1]!.attendance = "notYet";
    draft.publicNames = "firstInitial";
    expect(boardCalls(draft, games, dayOf(draft, games, 550))[0]!.names).toEqual(["Cher", "Li C."]);
    // Someone marked absent isn't called.
    draft.entries[2]!.players[1]!.attendance = "absent";
    expect(boardCalls(draft, games, dayOf(draft, games, 550))[0]!.names).toEqual(["Cher"]);

    // The match is given: the next game on the court is theirs too, so they are called for that one.
    awardMatch(draft, { matchId: games[1]!.id, winner: 0, reason: "walkover", now: at("09:12") });
    day = dayOf(draft, games, 552);
    expect(boardCalls(draft, games, day).map((c) => c.gameId)).toEqual([games[2]!.id]);
    // They arrive: nobody is called.
    for (const p of draft.entries[2]!.players) p.attendance = "arrived";
    expect(boardCalls(draft, games, dayOf(draft, games, 552))).toEqual([]);
  });

  it("gives the group tables with places, and who is through once a group is finished", () => {
    const { draft, games } = tournament();
    draft.startedAt = at("09:00");
    let tables = boardTables(draft);
    expect(tables.map((t) => t.letter)).toEqual(["A", "B"]);
    expect(tables[0]).toMatchObject({ progress: "0 of 3 games played" });
    expect(tables[0]!.rows.every((r) => r.standing === null && r.played === 0)).toBe(true);

    play(draft, games[0]!.id, "09:00", "09:10");
    play(draft, games[1]!.id, "09:10", "09:20");
    play(draft, games[2]!.id, "09:20", "09:30");
    tables = boardTables(draft);
    expect(tables[0]!.progress).toBe("Finished");
    expect(tables[0]!.rows.map((r) => [r.place, r.name, r.won, r.difference, r.standing, r.cut])).toEqual([
      ["1", "Asha Patel / Ravi Shah", 2, "+22", "Through", false],
      ["2", "Mary-Jane Smith-Jones / Tom O'Neil", 1, "0", "Through", true],
      ["3", "Cher / Li Wei Chen", 0, "−22", "Out", false],
    ]);
  });

  it("fills the knockout from results, to a champion", () => {
    const { draft, games } = tournament();
    const category = draft.categories[0]!;
    draft.startedAt = at("09:00");
    let bracket = boardBracket(draft, games, dayOf(draft, games, 540), category)!;
    expect(bracket.begun).toBe(false);
    expect(bracket.rounds.map((r) => r.name)).toEqual(["Semi-finals", "Final"]);
    expect(bracket.rounds[0]!.matches[0]!.sides.map((s) => [s.name, s.known])).toEqual([
      ["Winner A", false],
      ["Runner-up B", false],
    ]);
    expect(bracket.champion).toBeNull();

    let minute = 0;
    const stamp = () => {
      minute += 10;
      return `${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    };
    for (const g of games) play(draft, g.id, stamp(), stamp());
    bracket = boardBracket(draft, games, dayOf(draft, games, 700), category)!;
    expect(bracket.begun).toBe(true);
    expect(bracket.rounds[0]!.matches[0]).toMatchObject({ when: "Played", scores: [["21"], ["10"]], sides: [{ name: "Asha Patel / Ravi Shah", known: true, won: true }, { won: false }] });
    expect(bracket.champion).toBe("Asha Patel / Ravi Shah");
    expect(bracket.bronze).not.toBeNull();
    expect(boardProgress(draft, games, dayOf(draft, games, 700))).toBe("Finished");
  });

  it("never carries a phone number, a check-in mark or money", () => {
    const { draft, games } = tournament();
    draft.entries[2]!.players[0]!.attendance = "notYet";
    draft.startedAt = at("09:00");
    startReadyGames(draft, games, at("09:00"));
    play(draft, games[0]!.id, "09:00", "09:10");
    const day = dayOf(draft, games, 550);
    const everything = JSON.stringify([
      boardCourts(draft, games, day),
      boardUpNext(draft, games, day),
      boardCalls(draft, games, day),
      boardTables(draft),
      boardBracket(draft, games, day, draft.categories[0]!),
    ]);
    expect(everything).not.toMatch(/07700|phone|attendance|notYet|arrived|£|fee|prize|rate/i);
  });
});

describe("the pages the board turns through", () => {
  const table = (categoryId: string, letter: string) => ({ categoryId, category: categoryId.toUpperCase(), letter, progress: "", rows: [] });

  it("is only the courts when there is nothing else", () => {
    expect(boardPages([], [], ["a"], 4)).toEqual([{ kind: "courts" }]);
  });

  it("splits a category's tables by how many fit, with the courts between every page", () => {
    const tables = ["A", "B", "C", "D", "E"].map((l) => table("a", l));
    const pages = boardPages(tables, [{ categoryId: "a", category: "A", begun: false }], ["a"], 2);
    expect(pages.map((p) => p.kind)).toEqual(["courts", "tables", "courts", "tables", "courts", "tables"]);
    expect(pages.filter((p) => p.kind === "tables")).toEqual([
      { kind: "tables", categoryId: "a", category: "A", from: 0, count: 2, part: 1, parts: 3 },
      { kind: "tables", categoryId: "a", category: "A", from: 2, count: 2, part: 2, parts: 3 },
      { kind: "tables", categoryId: "a", category: "A", from: 4, count: 1, part: 3, parts: 3 },
    ]);
  });

  it("adds a category's knockout only once it has begun, after its tables", () => {
    const tables = [table("a", "A"), table("b", "A")];
    const brackets = [
      { categoryId: "a", category: "A", begun: true },
      { categoryId: "b", category: "B", begun: false },
    ];
    expect(boardPages(tables, brackets, ["a", "b"], 4).filter((p) => p.kind !== "courts")).toEqual([
      { kind: "tables", categoryId: "a", category: "A", from: 0, count: 1, part: 1, parts: 1 },
      { kind: "knockout", categoryId: "a", category: "A" },
      { kind: "tables", categoryId: "b", category: "B", from: 0, count: 1, part: 1, parts: 1 },
    ]);
  });

  it("shows a knockout-only tournament's bracket from the start", () => {
    expect(boardPages([], [{ categoryId: "a", category: "A", begun: true }], ["a"], 4)).toEqual([{ kind: "courts" }, { kind: "knockout", categoryId: "a", category: "A" }]);
  });
});
