import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { callUp, courtQueues, finishGame, gameState, reopenGame, setScore, startGame } from "./live";
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
    const { results: _results, ...saved } = emptyDraft("Europe/London");
    expect(normaliseDraft(JSON.parse(JSON.stringify(saved))).results).toEqual({});
  });
});
