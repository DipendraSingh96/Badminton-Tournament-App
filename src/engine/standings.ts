import type { TiebreakCriterion } from "./types";

// A group's table from its finished fixtures. A fixture is one match for
// individual entries, or a team tie of several rubbers. Scores were checked
// against the rules when they were entered, so here a game goes to the side
// with more points and a match to the side with more games.

/** A finished fixture between two of the group's entries. */
export interface PlayedFixture {
  home: string;
  away: string;
  /** One match's games, or each rubber's games for a team tie; each game is [home, away]. */
  rubbers: [number, number][][];
}

/** What one side took from a fixture. */
export interface FixtureCount {
  rubbersWon: number;
  rubbersLost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
}

/** A fixture counted from the home side: rubbers, games and points each way. */
export function countFixture(rubbers: [number, number][][]): FixtureCount {
  const count: FixtureCount = { rubbersWon: 0, rubbersLost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0 };
  for (const games of rubbers) {
    let won = 0;
    let lost = 0;
    for (const [home, away] of games) {
      count.pointsWon += home;
      count.pointsLost += away;
      if (home > away) won += 1;
      else if (away > home) lost += 1;
    }
    count.gamesWon += won;
    count.gamesLost += lost;
    if (won > lost) count.rubbersWon += 1;
    else if (lost > won) count.rubbersLost += 1;
  }
  return count;
}

/**
 * Who won a fixture: the side with most rubbers (for individual entries, the
 * match). A team tie level on rubbers goes to games, then points; still level
 * is nobody's.
 */
export function fixtureWinner(rubbers: [number, number][][]): "home" | "away" | null {
  const c = countFixture(rubbers);
  const by = c.rubbersWon - c.rubbersLost || c.gamesWon - c.gamesLost || c.pointsWon - c.pointsLost;
  return by > 0 ? "home" : by < 0 ? "away" : null;
}

export interface StandingRow {
  id: string;
  /** Place from 1; entries level on every tiebreak share one. */
  place: number;
  /** Level with another entry after every tiebreak. */
  shared: boolean;
  /** Fixtures: matches, or ties for teams. */
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  rubbersWon: number;
}

type Tally = Omit<StandingRow, "place" | "shared">;

function tally(ids: string[], fixtures: PlayedFixture[]): Map<string, Tally> {
  const rows = new Map<string, Tally>(
    ids.map((id) => [id, { id, played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, rubbersWon: 0 }]),
  );
  for (const f of fixtures) {
    const home = rows.get(f.home);
    const away = rows.get(f.away);
    if (!home || !away) continue;
    const c = countFixture(f.rubbers);
    const winner = fixtureWinner(f.rubbers);
    home.played += 1;
    away.played += 1;
    if (winner === "home") {
      home.won += 1;
      away.lost += 1;
    } else if (winner === "away") {
      away.won += 1;
      home.lost += 1;
    }
    home.gamesWon += c.gamesWon;
    home.gamesLost += c.gamesLost;
    home.pointsWon += c.pointsWon;
    home.pointsLost += c.pointsLost;
    home.rubbersWon += c.rubbersWon;
    away.gamesWon += c.gamesLost;
    away.gamesLost += c.gamesWon;
    away.pointsWon += c.pointsLost;
    away.pointsLost += c.pointsWon;
    away.rubbersWon += c.rubbersLost;
  }
  return rows;
}

/** A criterion's number for an entry: higher is better. */
function measure(criterion: TiebreakCriterion, row: Tally): number {
  switch (criterion) {
    case "matchesWon":
      return row.won;
    case "gameDifference":
      return row.gamesWon - row.gamesLost;
    case "pointDifference":
      return row.pointsWon - row.pointsLost;
    case "pointsWon":
      return row.pointsWon;
    case "rubbersWon":
      return row.rubbersWon;
    default:
      return 0;
  }
}

/** Splits entries into sets by a number, best first; entries with the same number stay together, in the order given. */
function split(ids: string[], value: (id: string) => number): string[][] {
  const values = [...new Set(ids.map(value))].sort((a, b) => b - a);
  return values.map((v) => ids.filter((id) => value(id) === v));
}

export interface StandingsInput {
  /** The group's entries, in draw order. */
  entries: string[];
  /** Finished fixtures only. */
  fixtures: PlayedFixture[];
  /** The tournament's tiebreak order. */
  tiebreaks: TiebreakCriterion[];
  /** Each entry's lot for a draw of lots: the lower number is placed higher. */
  lots?: Record<string, number>;
}

/**
 * A group's table, best first. The tiebreaks apply in order, each separating
 * only the entries still level after the ones before it. Head-to-head looks
 * only at the fixtures between the entries level at that point. Entries level
 * after every tiebreak share a place and keep their draw order.
 */
export function groupStandings({ entries, fixtures, tiebreaks, lots }: StandingsInput): StandingRow[] {
  const rows = tally(entries, fixtures);
  // Sets of entries still level, best first.
  let sets: string[][] = [entries];
  for (const criterion of tiebreaks) {
    sets = sets.flatMap((set) => {
      if (set.length < 2) return [set];
      if (criterion === "drawOfLots") return split(set, (id) => -(lots?.[id] ?? 0));
      if (criterion === "headToHead") {
        const among = tally(
          set,
          fixtures.filter((f) => set.includes(f.home) && set.includes(f.away)),
        );
        return split(set, (id) => among.get(id)!.won);
      }
      return split(set, (id) => measure(criterion, rows.get(id)!));
    });
  }
  let place = 1;
  return sets.flatMap((set) => {
    const at = place;
    place += set.length;
    return set.map((id) => ({ ...rows.get(id)!, place: at, shared: set.length > 1 }));
  });
}

/** The entry in a place (from 1) once it's settled: null when that place is shared. */
export function entryInPlace(rows: StandingRow[], place: number): string | null {
  const row = rows[place - 1];
  return row && !row.shared ? row.id : null;
}
