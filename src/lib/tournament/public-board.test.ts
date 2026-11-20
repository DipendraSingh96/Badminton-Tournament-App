import { produce } from "immer";
import { describe, expect, it } from "vitest";
import type { BoardSource } from "./audience";
import { duplicateDraft, type PlanDraft } from "./draft";
import { liveDay } from "./live-day";
import { PUBLIC_BOARD_VERSION, followUrl, publicBoard, readPublicBoard } from "./public-board";
import { exportTournament, normaliseDraft, readTournamentFile } from "./storage";
import { minutesOfDay } from "./time";
import { scheduledGames, tourSamples } from "./tour-sample";

// The tour's sample tournament at each point of its day, with what must never leave it added: phone numbers.
const samples = tourSamples(new Date(2026, 10, 19), "Europe/London");
const PHONE = "07700 900";

function withPhones(draft: PlanDraft): PlanDraft {
  return produce(draft, (d) => {
    d.entries.forEach((entry, i) => entry.players.forEach((player, n) => void (player.phone = `${PHONE}${String(i).padStart(2, "0")}${n}`)));
  });
}

function board(state: keyof typeof samples, options: { rehearsal?: boolean; names?: PlanDraft["publicNames"] } = {}) {
  const draft = produce(withPhones(samples[state]), (d) => {
    if (options.names) d.publicNames = options.names;
  });
  const games = scheduledGames(draft)!.games as BoardSource[];
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: draft.frame.timeZone });
  const day = liveDay(draft, games, {
    now: 600,
    minuteOf: (iso) => minutesOfDay(clock.format(new Date(iso))),
    courtIds: draft.frame.halls.flatMap((h) => h.courts.map((c) => c.id)),
  });
  return { draft, board: publicBoard(draft, games, day, { clock: "10:00", rehearsal: options.rehearsal ?? false }) };
}

describe("the players' link's snapshot", () => {
  it("never carries a phone number, a check-in mark, money or the log", () => {
    for (const state of ["draw", "midday", "results"] as const) {
      const { draft, board: made } = board(state);
      const text = JSON.stringify(made);
      // The tournament does hold them.
      expect(JSON.stringify(draft)).toContain(PHONE);
      expect(text).not.toContain(PHONE);
      for (const word of ["phone", "attendance", "arrived", "notYet", "absent", "fee", "prize", "finance", "shuttle", "rate", "log", "actuals", "owner"]) {
        expect([state, word, text.includes(`"${word}`)]).toEqual([state, word, false]);
      }
      // No money figure of the plan's is in it.
      for (const category of draft.categories) {
        if (category.feeAmount !== null) expect(text).not.toContain(`"feeAmount":${category.feeAmount}`);
      }
      // And nothing is in it but what the page shows.
      expect(Object.keys(made).sort()).toEqual(["brackets", "clock", "date", "halls", "name", "placings", "progress", "rehearsal", "stage", "tables", "upNext", "v"]);
    }
  });

  it("shows the draw and the times before the day", () => {
    const { draft, board: made } = board("draw");
    expect(made).toMatchObject({ v: PUBLIC_BOARD_VERSION, name: draft.name, date: draft.frame.date, stage: "before", rehearsal: false });
    expect(made.progress).toMatch(/^Starts \d\d:\d\d$/);
    // Every group with its entries, and the matches in order with a time and a court.
    expect(made.tables.length).toBeGreaterThan(0);
    expect(made.tables.every((t) => t.rows.length > 0)).toBe(true);
    expect(made.upNext.length).toBeGreaterThan(0);
    expect(made.upNext.every((g) => /^\d\d:\d\d$/.test(g.time) && g.court !== null)).toBe(true);
    expect(made.brackets).toHaveLength(draft.categories.length);
    expect(made.placings).toEqual([]);
  });

  it("shows who is on court, with scores, while the day is played", () => {
    const { board: made } = board("midday");
    expect(made.stage).toBe("live");
    const courts = made.halls.flatMap((h) => h.courts);
    const onCourt = courts.filter((c) => c.state === "onCourt");
    expect(onCourt.length).toBeGreaterThan(0);
    expect(onCourt.every((c) => c.game !== null && c.game.sides.every((s) => s.name.length > 0))).toBe(true);
    // Finished games' scores are in the tables.
    expect(made.tables.some((t) => t.rows.some((r) => r.played > 0))).toBe(true);
    expect(made.progress).toMatch(/games played/);
  });

  it("shows the places once the tournament is finished", () => {
    const { draft, board: made } = board("results");
    expect(made.stage).toBe("finished");
    expect(made.progress).toBe("Finished");
    expect(made.placings).toHaveLength(draft.categories.length);
    for (const category of made.placings) {
      expect(category.places.map((p) => p.place).slice(0, 2)).toEqual([1, 2]);
      expect(category.places.every((p) => p.names.length > 0 && p.names.every((n) => n.length > 0))).toBe(true);
    }
    expect(made.brackets.every((b) => b.champion !== null)).toBe(true);
  });

  it("uses the names as the tournament shows them in public", () => {
    const full = JSON.stringify(board("midday", { names: "full" }).board);
    const initials = JSON.stringify(board("midday", { names: "initials" }).board);
    const someone = samples.midday.entries[0]!.players[0]!.name;
    expect(full).toContain(someone);
    expect(initials).not.toContain(someone);
  });

  it("says so when it is a rehearsal", () => {
    expect(board("midday", { rehearsal: true }).board.rehearsal).toBe(true);
    expect(board("midday").board.rehearsal).toBe(false);
  });

  it("is read back as it was stored, and anything else is refused", () => {
    const { board: made } = board("midday");
    expect(readPublicBoard(JSON.parse(JSON.stringify(made)))).toEqual(made);
    expect(readPublicBoard(null)).toBeNull();
    expect(readPublicBoard({})).toBeNull();
    expect(readPublicBoard({ ...made, v: PUBLIC_BOARD_VERSION + 1 })).toBeNull();
    expect(readPublicBoard({ ...made, halls: "x" })).toBeNull();
  });
});

describe("the link itself", () => {
  it("is off for a tournament saved before it existed, and is not carried by a copy or a file", () => {
    const saved = JSON.parse(JSON.stringify(samples.locked)) as Record<string, unknown>;
    delete saved.publicLink;
    expect(normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]).publicLink).toBeNull();

    const shared: PlanDraft = { ...samples.locked, publicLink: "3f2c1e0a-1111-4222-8333-444455556666" };
    expect(normaliseDraft(JSON.parse(JSON.stringify(shared))).publicLink).toBe(shared.publicLink);
    expect(duplicateDraft(shared).publicLink).toBeNull();
    expect(readTournamentFile(exportTournament(shared))!.publicLink).toBeNull();
  });

  it("carries only its own id in its address", () => {
    expect(followUrl("3f2c1e0a-1111-4222-8333-444455556666")).toBe("/follow?t=3f2c1e0a-1111-4222-8333-444455556666");
  });
});
