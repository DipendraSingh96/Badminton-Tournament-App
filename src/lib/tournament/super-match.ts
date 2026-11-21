import type { MatchInfo, Stage, StageRules } from "@/engine";
import type { PlanDraft } from "./draft";
import { entrySlot, groupSuperId, groupTables, knockoutSuperId, knockoutTies } from "./entries";

// The super match: one extra game between two entries that every tiebreak
// before it leaves level, played for a place that matters. It isn't on the
// schedule: it comes into being from the table (or a knockout match-up that
// ended level), waits in the side panel, and is put on an empty court by the
// desk. From then on it is a game like any other; its score is kept in
// `results` under its own id and never counts in the group's table.

/** Is the super match among the tournament's tiebreaks? */
export function superMatchOn(draft: PlanDraft): boolean {
  return draft.rules.tiebreaks.includes("superMatch");
}

/** A super match's id, whichever kind it is. */
export function isSuperId(id: string): boolean {
  return id.includes(":super:");
}

/** How a super match is scored: one game to its points; won by two, up to its maximum, when that is chosen. Undefined until its rules are set. */
export function superRules(draft: PlanDraft): StageRules | undefined {
  const { points, deuce, deuceLimit } = draft.rules.superMatch;
  if (!points || points < 1 || !deuce) return undefined;
  if (deuce === "standard") return deuceLimit && deuceLimit > points ? { pointsPerGame: points, deuce: { type: "standard", max: deuceLimit }, bestOf: 1 } : undefined;
  return { pointsPerGame: points, deuce: { type: "none" }, bestOf: 1 };
}

export interface SuperMatch {
  id: string;
  categoryId: string;
  stage: Stage;
  /** Group stage: the group's letter. */
  group: string | null;
  /** Knockout: the match-up it decides ("SF1", "Final"). */
  code: string | null;
  /** The two entries, by id. */
  home: string;
  away: string;
}

/**
 * The super matches the day has made so far, played or still to play. A
 * finished group with exactly two entries level for a place that matters;
 * a knockout match-up that ended level on matches, games and points. One
 * settled by hand instead (and never played) isn't listed.
 */
export function superMatches(draft: PlanDraft): SuperMatch[] {
  if (!superMatchOn(draft)) return [];
  const out: SuperMatch[] = [];
  for (const category of draft.categories) {
    for (const table of groupTables(draft, category)) {
      if (!table.complete) continue;
      for (const row of table.rows) {
        if (!row.superWith || row.id > row.superWith) continue;
        const id = groupSuperId(category.id, table.letter, row.id, row.superWith);
        // Decided by hand without a game: nothing to play.
        if (!row.shared && !draft.results[id]) continue;
        out.push({ id, categoryId: category.id, stage: "group", group: table.letter, code: null, home: row.id, away: row.superWith });
      }
    }
  }
  for (const tie of knockoutTies(draft)) {
    const id = knockoutSuperId(tie.categoryId, tie.code);
    if (tie.byHand && !draft.results[id]) continue;
    const kept = draft.results[id]?.sides;
    out.push({
      id,
      categoryId: tie.categoryId,
      stage: tie.code === "Final" ? "final" : tie.code === "Bronze" ? "bronze" : "knockout",
      group: null,
      code: tie.code,
      home: kept?.[0] ?? tie.home,
      away: kept?.[1] ?? tie.away,
    });
  }
  return out;
}

/** What a super match is, as the day's games describe a match: its sides are entries, not draw slots. */
export function superMatchInfo(match: SuperMatch): MatchInfo {
  return {
    categoryId: match.categoryId,
    stage: match.stage,
    ...(match.group ? { group: match.group } : {}),
    ...(match.code ? { code: match.code } : {}),
    home: entrySlot(match.home),
    away: entrySlot(match.away),
    super: true,
  };
}

/** A super match with where and when it is on the day. */
export interface PlacedSuperMatch {
  match: SuperMatch;
  courtId: string;
  from: number;
  to: number;
}

/**
 * The super matches that have been put on a court, timed for the day's
 * games: each goes ahead of its court's games still waiting (and after one
 * already on court there), for the length of the day's shortest game. `games` are the schedule's; `minuteOf` reads a stored time
 * as minutes since midnight in the tournament's time zone.
 */
export function placedSuperMatches(
  draft: PlanDraft,
  games: { id: string; courtId: string; from: number; to: number }[],
  minuteOf: (iso: string) => number | null,
): PlacedSuperMatch[] {
  const placed = superMatches(draft).filter((m) => draft.superCourts[m.id]?.courtId);
  if (placed.length === 0) return [];
  const shortest = games.reduce((min, g) => Math.min(min, g.to - g.from), Infinity);
  const length = Number.isFinite(shortest) && shortest > 0 ? shortest : 1;
  const out: PlacedSuperMatch[] = [];
  for (const match of placed) {
    const { courtId, at } = draft.superCourts[match.id]!;
    const put = minuteOf(at) ?? 0;
    const there = [...games, ...out.map((p) => ({ id: p.match.id, courtId: p.courtId, from: p.from, to: p.to }))].filter((g) => g.courtId === courtId);
    // Ahead of the court's games still waiting; after one already on court there, which finishes first.
    const waiting = there.filter((g) => !draft.results[g.id]).reduce((min, g) => Math.min(min, g.from), Infinity);
    const playing = there.filter((g) => draft.results[g.id]?.state === "onCourt").reduce((max, g) => Math.max(max, g.from), -Infinity);
    const from = Math.max(Math.min(put, waiting - 0.5), playing + 0.25);
    out.push({ match, courtId, from, to: from + length });
  }
  return out;
}

/** The super matches waiting in the side panel: made by the table, not yet put on a court. */
export function unplacedSuperMatches(draft: PlanDraft): SuperMatch[] {
  // (One taken back off its court keeps a note with no court, so it isn't put straight back.)
  return superMatches(draft).filter((m) => !draft.superCourts[m.id]?.courtId && !draft.results[m.id]);
}
