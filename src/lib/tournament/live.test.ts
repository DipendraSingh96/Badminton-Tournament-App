import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { callUp, courtBoard, courtQueues, projectDay, timingOf, finishGame, gameState, reopenGame, setScore, startGame } from "./live";
import { normaliseDraft } from "./storage";

const games = [
  { id: "a", courtId: "c1", from: 540 },
  { id: "b", courtId: "c2", from: 540 },
  { id: "c", courtId: "c1", from: 555 },
  { id: "d", courtId: "c2", from: 555 },
  { id: "e", courtId: "c1", from: 570 },
];
const NOW = "2026-11-21T09:00:00.000Z";
const LATER = "2026-11-21T09:14:00.000Z";

describe("live play", () => {
  it("makes each court's first unfinished game its current one", () => {
    const draft = emptyDraft("Europe/London");
    let queue = courtQueues(games, draft.results).get("c1")!;
    expect(queue.current?.id).toBe("a");
    expect(queue.next.map((g) => g.id)).toEqual(["c", "e"]);
    expect(queue.played).toEqual([]);

    startGame(draft, "a", NOW);
    expect(gameState(draft.results, "a")).toBe("onCourt");
    // On court is still the current game.
    expect(courtQueues(games, draft.results).get("c1")!.current?.id).toBe("a");

    finishGame(draft, "a", LATER);
    queue = courtQueues(games, draft.results).get("c1")!;
    expect(queue.current?.id).toBe("c");
    expect(queue.played.map((g) => g.id)).toEqual(["a"]);
    expect(draft.results.a).toMatchObject({ state: "finished", startedAt: NOW, finishedAt: LATER });
  });

  it("has no current game once a court has played everything", () => {
    const draft = emptyDraft("Europe/London");
    for (const id of ["b", "d"]) {
      startGame(draft, id, NOW);
      finishGame(draft, id, LATER);
    }
    expect(courtQueues(games, draft.results).get("c2")).toMatchObject({ current: null, next: [] });
  });

  it("calls up the games not yet started, soonest first, then in the courts' order", () => {
    const draft = emptyDraft("Europe/London");
    expect(callUp(games, draft.results, ["c2", "c1"]).map((g) => g.id)).toEqual(["b", "a", "d", "c", "e"]);
    startGame(draft, "b", NOW);
    expect(callUp(games, draft.results, ["c2", "c1"]).map((g) => g.id)).toEqual(["a", "d", "c", "e"]);
  });

  it("puts a game on court when its first score is entered, and keeps the scores by game", () => {
    const draft = emptyDraft("Europe/London");
    setScore(draft, "a", 0, 0, 21, NOW);
    setScore(draft, "a", 0, 1, 15, NOW);
    setScore(draft, "a", 1, 1, 21, NOW);
    expect(draft.results.a).toMatchObject({ state: "onCourt", startedAt: NOW, games: [[21, 15], [null, 21]] });
  });

  it("reopens a finished game to correct it, keeping its scores and start time", () => {
    const draft = emptyDraft("Europe/London");
    setScore(draft, "a", 0, 0, 21, NOW);
    finishGame(draft, "a", LATER);
    reopenGame(draft, "a");
    expect(draft.results.a).toMatchObject({ state: "onCourt", startedAt: NOW, finishedAt: null, games: [[21, null]] });
  });

  it("opens a tournament saved before results with none", () => {
    const saved = JSON.parse(JSON.stringify(emptyDraft("Europe/London")));
    delete saved.results;
    expect(normaliseDraft(saved).results).toEqual({});
  });

  it("keeps every court in its place with its game, and frees only a court with none", () => {
    const draft = emptyDraft("Europe/London");
    const order = ["c1", "c2", "c3"];
    const shape = () => {
      const board = courtBoard(games, draft.results, order);
      return { courts: board.courts.map((c) => [c.courtId, c.game?.id ?? null]), upNext: board.upNext.map((g) => g.id) };
    };
    // Nothing started: each court has its first game; a court with no games is free.
    expect(shape()).toEqual({ courts: [["c1", "a"], ["c2", "b"], ["c3", null]], upNext: ["c", "d", "e"] });

    // A game on court stays where it is.
    startGame(draft, "b", NOW);
    expect(shape().courts).toEqual([["c1", "a"], ["c2", "b"], ["c3", null]]);

    // A court that finishes shows the game it is due next: it isn't free while it has one.
    finishGame(draft, "b", LATER);
    expect(shape()).toEqual({ courts: [["c1", "a"], ["c2", "d"], ["c3", null]], upNext: ["c", "e"] });

    // Its last game finished, it is free.
    startGame(draft, "d", LATER);
    finishGame(draft, "d", LATER);
    expect(shape().courts).toEqual([["c1", "a"], ["c2", null], ["c3", null]]);
  });

  describe("the day as it is really going", () => {
    // Two courts, a game every 15 minutes from 09:00; "k" is a knockout game whose sides aren't known.
    const day = [
      { id: "a", courtId: "c1", from: 540, to: 555 },
      { id: "c", courtId: "c1", from: 555, to: 570 },
      { id: "e", courtId: "c1", from: 570, to: 585 },
      { id: "b", courtId: "c2", from: 540, to: 555 },
      { id: "k", courtId: "c2", from: 600, to: 615 },
    ];
    // Stored times here are just minutes as text.
    const at = (started: number | null, now: number | null, results: Parameters<typeof projectDay>[1]) =>
      Object.fromEntries(
        [...projectDay(day, results, { started, now, minuteOf: (iso) => Number(iso), known: (g) => g.id !== "k" })].map(([id, p]) => [id, p.gone ? "gone" : `${p.from}-${p.to}`]),
      );
    const played = (from: number, to: number | null, extra = {}) => ({
      state: to === null ? ("onCourt" as const) : ("finished" as const),
      games: [[21, 15]] as [number, number][],
      startedAt: String(from),
      finishedAt: to === null ? null : String(to),
      ...extra,
    });

    it("is the plan until the tournament starts", () => {
      expect(at(null, 700, {})).toEqual({ a: "540-555", c: "555-570", e: "570-585", b: "540-555", k: "600-615" });
    });

    it("shifts everything by a late start, an unknown knockout game by the same", () => {
      expect(at(560, 560, {})).toEqual({ a: "560-575", c: "575-590", e: "590-605", b: "560-575", k: "620-635" });
    });

    it("pulls the next game forward after an early finish, and pushes it back after a late one", () => {
      // "a" ran 09:00 to 09:09: "c" follows straight on.
      expect(at(540, 549, { a: played(540, 549) })).toMatchObject({ a: "540-549", c: "549-564", e: "564-579" });
      // "a" is still on at 09:20, past its slot: it runs to now, and the rest wait behind it.
      expect(at(540, 560, { a: played(540, null) })).toMatchObject({ a: "540-560", c: "560-575", e: "575-590" });
      // On court and inside its slot, it is shown to its planned length.
      expect(at(540, 545, { a: played(540, null) })).toMatchObject({ a: "540-555", c: "555-570" });
    });

    it("gives a walkover no time, and never puts a waiting game before now", () => {
      const walkover = { state: "finished" as const, games: [[21, 0]] as [number, number][], startedAt: null, finishedAt: "541", award: { winner: 0 as const, reason: "walkover" as const } };
      expect(at(540, 541, { a: walkover })).toMatchObject({ a: "gone", c: "541-556", e: "556-571" });
      // The court stood idle until 09:30 (its game was held back): what is waiting starts from now.
      expect(at(540, 570, {})).toMatchObject({ a: "570-585", c: "585-600" });
      // A known game moves up past its planned time; the unknown one waits for its own.
      expect(at(540, 556, { b: played(540, 556) })).toMatchObject({ b: "540-556", k: "600-615" });
    });

    it("says when a game is near the end of its slot, and when it is over it", () => {
      expect([11, 12, 14, 15, 30].map((minutes) => timingOf(540, 15, 540 + minutes))).toEqual(["ok", "near", "near", "over", "over"]);
    });
  });
});
