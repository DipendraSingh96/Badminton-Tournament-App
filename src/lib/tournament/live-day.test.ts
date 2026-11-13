import { describe, expect, it } from "vitest";
import { startReadyGames } from "./changes";
import { emptyEntry, type PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { finishGame } from "./live";
import { liveDay, projectedGames, type DayGame } from "./live-day";

/** Two groups of three on two courts, a game every 15 minutes from 09:00; everyone checked in. */
function tournament(): { draft: PlanDraft; games: DayGame[] } {
  const draft = completeDraft();
  draft.stage = "live";
  const category = draft.categories[0]!;
  draft.entries = Array.from({ length: 6 }, (_, i) => {
    const entry = { ...emptyEntry(category.id, 2), id: `e${i + 1}`, name: `Entry ${i + 1}` };
    for (const p of entry.players) p.attendance = "arrived";
    return entry;
  });
  draft.draw[category.id] = { groups: [["e1", "e2", "e3"], ["e4", "e5", "e6"]], randomSeed: 1, locked: true };
  const games: DayGame[] = [];
  for (const [g, letter] of ["A", "B"].entries()) {
    [[1, 2], [1, 3], [2, 3]].forEach(([a, b], i) => {
      games.push({
        id: `${category.id}:group:${letter}:${letter}${a}-${letter}${b}:r1`,
        courtId: g === 0 ? "c1" : "c2",
        from: 540 + i * 15,
        to: 555 + i * 15,
        match: { categoryId: category.id, home: `${letter}${a}`, away: `${letter}${b}` },
      });
    });
  }
  return { draft, games };
}

/** Minutes since midnight of a UTC time, for a tournament kept in UTC here. */
const minuteOf = (iso: string) => new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes();
const at = (hhmm: string) => `2026-07-04T${hhmm}:00.000Z`;
const courtIds = ["c1", "c2"];

describe("the day as it is really going", () => {
  it("is the plan until play begins, with the games that are missing a player already known and no court calling for the desk", () => {
    const { draft, games } = tournament();
    // Entry 1 plays court 1's first two games.
    draft.entries[0]!.players[0]!.attendance = "notYet";
    const day = liveDay(draft, games, { now: 545, minuteOf, courtIds });
    expect(day.started).toBeNull();
    expect([...day.held].sort()).toEqual([games[0]!.id, games[1]!.id].sort());
    expect(day.byCourt.size).toBe(0);
    expect(day.stuck.size).toBe(0);
    expect(projectedGames(games, day.projection)).toEqual(games);
  });

  it("shifts by a late start and names each court's game", () => {
    const { draft, games } = tournament();
    draft.startedAt = at("09:20");
    startReadyGames(draft, games, at("09:20"));
    const day = liveDay(draft, games, { now: 560, minuteOf, courtIds });
    expect(day.started).toBe(560);
    expect(day.byCourt.get("c1")).toBe(games[0]!.id);
    expect(day.byCourt.get("c2")).toBe(games[3]!.id);
    expect(projectedGames(games, day.projection).map((g) => g.from)).toEqual([560, 575, 590, 560, 575, 590]);
    expect([...day.held]).toEqual([]);
  });

  it("holds a game whose player hasn't checked in, and marks its court as stuck", () => {
    const { draft, games } = tournament();
    // Entry 3 plays the second and third games on court 1.
    draft.entries[2]!.players[0]!.attendance = "notYet";
    draft.startedAt = at("09:00");
    startReadyGames(draft, games, at("09:00"));
    let day = liveDay(draft, games, { now: 540, minuteOf, courtIds });
    expect([...day.held].sort()).toEqual([games[1]!.id, games[2]!.id].sort());
    // Its court isn't stuck while another game is on it.
    expect(day.stuck.size).toBe(0);

    finishGame(draft, games[0]!.id, at("09:10"));
    day = liveDay(draft, games, { now: 550, minuteOf, courtIds });
    expect(day.stuck.get("c1")).toBe(games[1]!.id);
    // The held game follows on from the early finish all the same.
    expect(day.projection.get(games[1]!.id)).toMatchObject({ from: 550 });

    draft.entries[2]!.players[0]!.attendance = "arrived";
    day = liveDay(draft, games, { now: 550, minuteOf, courtIds });
    expect(day.held.size).toBe(0);
    expect(day.stuck.size).toBe(0);
  });

  it("says which courts have nothing left that can be played now", () => {
    const { draft, games } = tournament();
    draft.startedAt = at("09:00");
    // Nothing started yet, everyone there: no court is open to another hall's game.
    expect([...liveDay(draft, games, { now: 540, minuteOf, courtIds }).open]).toEqual([]);
    // Entry 6 isn't there: court 2's last two games (B1 v B3, B2 v B3) can't be played; its first can.
    draft.entries[5]!.players[0]!.attendance = "absent";
    expect([...liveDay(draft, games, { now: 540, minuteOf, courtIds }).open]).toEqual([]);
    startReadyGames(draft, games, at("09:00"));
    finishGame(draft, games[3]!.id, at("09:10"));
    expect([...liveDay(draft, games, { now: 550, minuteOf, courtIds }).open]).toEqual(["c2"]);
    // A court with no games at all is open too.
    expect(liveDay(draft, games, { now: 550, minuteOf, courtIds: ["c1", "c2", "c9"] }).open.has("c9")).toBe(true);
  });
});
