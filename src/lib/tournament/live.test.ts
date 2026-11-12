import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { callUp, courtBoard, courtQueues, finishGame, gameState, reopenGame, setScore, startGame } from "./live";
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
});
