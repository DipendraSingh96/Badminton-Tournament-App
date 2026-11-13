import { countFixture, knockoutBracket, type EventType, type Stage } from "@/engine";
import { courtNumber, hallName, type CategoryDraft, type EntryDraft, type PlanDraft, type PublicNames } from "./draft";
import {
  categoryFormatOf,
  categoryLabel,
  entryForSlot,
  fixtureMatchIds,
  groupStatus,
  groupTables,
  knockoutOutcome,
  knockoutRoundName,
  matchPlayers,
  matchRef,
  sidePlayers,
} from "./entries";
import { EVENT_LABELS } from "./events";
import { awardMark, courtQueues, gameState } from "./live";
import type { DayGame, LiveDay } from "./live-day";
import { clock } from "./time";

// What the audience board shows: the hall's screen, read by players and
// spectators. Everything here returns only what may be shown in public:
// names (as the organiser chose them to appear), courts, times, scores and
// places. No phone number, no check-in mark, no money and no log ever
// passes through these functions.

/** A game on the schedule with enough of what it is to name it on the board. */
export type BoardSource = DayGame & {
  match: {
    categoryId: string;
    stage: Stage;
    group?: string;
    code?: string;
    home: string;
    away: string;
    rubber?: { number: number; of: number; event: EventType };
  };
};

/** A person's name as it appears in public: in full, "Asha P.", or "A.P.". */
export function publicName(name: string, mode: PublicNames): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (mode === "full" || words.length === 0) return words.join(" ");
  const initial = (word: string) => word.charAt(0).toUpperCase();
  if (mode === "firstInitial") return words.length === 1 ? words[0]! : `${words[0]} ${initial(words.at(-1)!)}.`;
  // Initials: one for each part of the name, a double-barrelled name's parts included.
  return words
    .flatMap((w) => w.split("-"))
    .filter(Boolean)
    .map((w) => `${initial(w)}.`)
    .join("");
}

/**
 * An entry's name in public. A team's name is the team's, shown as it is. A
 * pair or a player is shown by its players' names, each as the organiser
 * chose; an entry with no players named falls back to its own name.
 */
export function publicEntryName(draft: PlanDraft, entry: EntryDraft): string {
  const own = entry.name.trim();
  const mode = draft.publicNames;
  if (draft.unit === "team") return own || "Unnamed team";
  const players = entry.players.map((p) => p.name.trim()).filter(Boolean);
  if (mode === "full") return own || (players.length > 0 ? players.join(" / ") : "Unnamed entry");
  if (players.length > 0) return players.map((p) => publicName(p, mode)).join(" / ");
  return own ? publicName(own, mode) : "Unnamed entry";
}

export interface BoardSide {
  /** The entry's public name, or its place in the draw until someone holds it ("Winner A"). */
  name: string;
  /** Known: an entry is there. */
  known: boolean;
  /** Teams only: who plays this rubber. */
  players: string[];
}

export interface BoardGame {
  id: string;
  courtId: string;
  /** The court's number; null if the court is no longer in the venue. */
  court: number | null;
  /** When it is due, as the day is really going ("09:35"). */
  time: string;
  from: number;
  state: "onCourt" | "waiting" | "finished";
  /** Waiting on a player who hasn't checked in. */
  held: boolean;
  category: string;
  /** "Group A", "Semi-final 1", "Final". */
  where: string;
  /** Teams only: "Rubber 2 of 5 · Men's doubles". */
  rubber: string | null;
  sides: [BoardSide, BoardSide];
  /** Points so far, a game at a time. */
  games: [number | null, number | null][];
  /** "W/O" or "Ret." for a match given to a side. */
  mark: string | null;
  /** Teams only: rubbers won by each side in this tie so far. */
  tie: [number, number] | null;
}

function courtNumbers(draft: PlanDraft): Map<string, number> {
  const numbers = new Map<string, number>();
  draft.frame.halls.forEach((hall, h) => hall.courts.forEach((court, c) => numbers.set(court.id, courtNumber(draft.frame.halls, h, c))));
  return numbers;
}

function side(draft: PlanDraft, game: BoardSource, slot: string): BoardSide {
  const m = game.match;
  const entry = entryForSlot(draft, m.categoryId, slot);
  return {
    name: entry ? publicEntryName(draft, entry) : slot,
    known: Boolean(entry),
    players:
      draft.unit === "team"
        ? sidePlayers(draft, m.categoryId, slot, m.rubber?.number)
            .map((p) => publicName(p.name, draft.publicNames))
            .filter(Boolean)
        : [],
  };
}

/** Rubbers won by each side of a team tie so far, from its finished rubbers. */
function tieScore(draft: PlanDraft, id: string): [number, number] | null {
  const ref = draft.unit === "team" ? matchRef(draft, id) : null;
  if (!ref) return null;
  const finished = fixtureMatchIds(draft, ref)
    .map((rubberId) => draft.results[rubberId])
    .filter((r) => r?.state === "finished");
  const count = countFixture(
    finished.map((r) => r!.games.filter(([h, a]) => h !== null || a !== null).map(([h, a]) => [h ?? 0, a ?? 0] as [number, number])),
    finished.map((r) => (r!.award ? { winner: r!.award.winner === 0 ? ("home" as const) : ("away" as const), open: r!.award.open } : null)),
  );
  return [count.rubbersWon, count.rubbersLost];
}

function boardGame(draft: PlanDraft, game: BoardSource, day: LiveDay, numbers: Map<string, number>): BoardGame {
  const m = game.match;
  const result = draft.results[game.id];
  const from = day.projection.get(game.id)?.from ?? game.from;
  return {
    id: game.id,
    courtId: game.courtId,
    court: numbers.get(game.courtId) ?? null,
    time: clock(Math.round(from)),
    from,
    state: gameState(draft.results, game.id),
    held: day.held.has(game.id),
    category: categoryLabel(draft, m.categoryId),
    where: m.stage === "group" ? `Group ${m.group ?? ""}`.trim() : knockoutRoundName(m.code ?? ""),
    rubber: m.rubber ? `Rubber ${m.rubber.number} of ${m.rubber.of} · ${EVENT_LABELS[m.rubber.event]}` : null,
    sides: [side(draft, game, m.home), side(draft, game, m.away)],
    games: (result?.games ?? []).filter(([h, a]) => h !== null || a !== null).map(([h, a]) => [h, a]),
    mark: awardMark(result?.award),
    tie: tieScore(draft, game.id),
  };
}

export type BoardCourtState = "onCourt" | "upNext" | "free" | "done";

export interface BoardCourt {
  courtId: string;
  number: number;
  state: BoardCourtState;
  /** The game on it, or due on it next. */
  game: BoardGame | null;
}

export interface BoardHall {
  id: string;
  name: string;
  courts: BoardCourt[];
}

/** Every court, hall by hall in the hall's own order (a flipped hall's courts reversed, as on the desk). */
export function boardCourts(draft: PlanDraft, games: BoardSource[], day: LiveDay): BoardHall[] {
  const queues = courtQueues(games, draft.results);
  const numbers = courtNumbers(draft);
  return draft.frame.halls.map((hall, h) => {
    const courts = hall.courts.map((court): BoardCourt => {
      const queue = queues.get(court.id);
      const current = queue?.current ?? null;
      const game = current ? boardGame(draft, current, day, numbers) : null;
      return {
        courtId: court.id,
        number: numbers.get(court.id)!,
        state: game ? (game.state === "onCourt" ? "onCourt" : "upNext") : queue && queue.played.length > 0 ? "done" : "free",
        game,
      };
    });
    return { id: hall.id, name: hallName(hall, h), courts: hall.flipped ? courts.reverse() : courts };
  });
}

/** Every waiting game, soonest first as the day is really going (then in the courts' order). */
export function boardUpNext(draft: PlanDraft, games: BoardSource[], day: LiveDay): BoardGame[] {
  const numbers = courtNumbers(draft);
  return games
    .filter((g) => gameState(draft.results, g.id) === "waiting")
    .map((g) => boardGame(draft, g, day, numbers))
    .sort((a, b) => a.from - b.from || (a.court ?? 0) - (b.court ?? 0));
}

export interface BoardCall {
  gameId: string;
  court: number | null;
  /** Who the desk is waiting for, as names appear in public. */
  names: string[];
}

/**
 * Who is called to the desk: for each court whose game can't start, the
 * players in it who haven't checked in yet. A player marked absent isn't
 * called: the desk already knows. Courts in their number order.
 */
export function boardCalls(draft: PlanDraft, games: BoardSource[], day: LiveDay): BoardCall[] {
  const numbers = courtNumbers(draft);
  const byId = new Map(games.map((g) => [g.id, g]));
  return [...day.stuck.values()]
    .flatMap((gameId) => {
      const game = byId.get(gameId);
      if (!game) return [];
      const names = matchPlayers(draft, game.match)
        .filter((p) => p.attendance === "notYet")
        .map((p) => publicName(p.name, draft.publicNames))
        .filter(Boolean);
      return names.length > 0 ? [{ gameId, court: numbers.get(game.courtId) ?? null, names }] : [];
    })
    .sort((a, b) => (a.court ?? 0) - (b.court ?? 0));
}

/** Where an entry stands in a finished group, in a word; null while the group is still being played. */
export type BoardStanding = "Through" | "Out" | "Level" | "Winner" | "Withdrawn" | null;

export interface BoardRow {
  place: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  /** Points for less points against, signed: "+12", "−3", "0". */
  difference: string;
  standing: BoardStanding;
  /** The qualifying line runs under this row. */
  cut: boolean;
}

export interface BoardTable {
  categoryId: string;
  category: string;
  letter: string;
  /** "Finished", or "3 of 6 games played". */
  progress: string;
  rows: BoardRow[];
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** Every group's table, category by category. Empty for a knockout-only tournament or before the draw. */
export function boardTables(draft: PlanDraft): BoardTable[] {
  const byId = new Map(draft.entries.map((e) => [e.id, e]));
  return draft.categories.flatMap((category) =>
    groupTables(draft, category).map((table): BoardTable => ({
      categoryId: category.id,
      category: categoryLabel(draft, category.id),
      letter: table.letter,
      progress: table.complete ? "Finished" : `${table.played} of ${table.total} ${draft.unit === "team" ? "ties" : "games"} played`,
      rows: table.rows.map((row, i) => {
        const entry = byId.get(row.id);
        const status = groupStatus(table, row);
        return {
          place: row.played === 0 && row.shared ? "–" : row.shared ? `${row.place}=` : String(row.place),
          name: entry ? publicEntryName(draft, entry) : "Unnamed entry",
          played: row.played,
          won: row.won,
          lost: row.lost,
          difference: signed(row.pointsWon - row.pointsLost),
          standing:
            status === "through" ? "Through" : status === "out" ? "Out" : status === "level" ? "Level" : status === "winner" ? "Winner" : status === "withdrawn" ? "Withdrawn" : null,
          cut: table.qualify > 0 && i === table.qualify - 1 && i < table.rows.length - 1,
        };
      }),
    })),
  );
}

export interface BoardMatch {
  code: string;
  /** "QF1", "Final", "Bronze match". */
  label: string;
  /** "On court", or "09:35 · Court 2"; null if it isn't on the schedule. */
  when: string | null;
  sides: [BoardSide & { won: boolean }, BoardSide & { won: boolean }];
  /** Each side's points game by game; for a team tie, its rubbers won. */
  scores: [string[], string[]];
  mark: string | null;
}

export interface BoardBracket {
  categoryId: string;
  category: string;
  /** Earliest round first; the last is the final. */
  rounds: { name: string; matches: BoardMatch[] }[];
  bronze: BoardMatch | null;
  /** The winner of a finished final. */
  champion: string | null;
  /** The knockout has begun: a group has finished or one of its games has been started. */
  begun: boolean;
}

function roundName(size: number): string {
  if (size === 2) return "Final";
  if (size === 4) return "Semi-finals";
  if (size === 8) return "Quarter-finals";
  return `Round of ${size}`;
}

function bracketOf(draft: PlanDraft, category: CategoryDraft) {
  const format = categoryFormatOf(draft, category);
  if (!format.ok || draft.format === "groups") return null;
  return knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);
}

/** A category's knockout as the results stand; null when it has none. */
export function boardBracket(draft: PlanDraft, games: BoardSource[], day: LiveDay, category: CategoryDraft): BoardBracket | null {
  const bracket = bracketOf(draft, category);
  if (!bracket) return null;
  const numbers = courtNumbers(draft);
  const box = (match: { code: string; home: string; away: string }): BoardMatch => {
    const own = games.filter((g) => g.match.categoryId === category.id && g.match.code === match.code).sort((a, b) => a.from - b.from);
    const first = own[0];
    const outcome = knockoutOutcome(draft, category, match.code);
    // Who played it, as kept when it started; otherwise who the results put there.
    const kept = own.map((g) => draft.results[g.id]?.sides).find(Boolean);
    const sideOf = (slot: string, i: 0 | 1): BoardMatch["sides"][number] => {
      const entry = kept ? draft.entries.find((e) => e.id === kept[i]) : entryForSlot(draft, category.id, slot);
      return { name: entry ? publicEntryName(draft, entry) : slot, known: Boolean(entry), players: [], won: outcome !== null && entry?.id === outcome.winner };
    };
    const sides: BoardMatch["sides"] = [sideOf(match.home, 0), sideOf(match.away, 1)];
    const rubbers = own.map((g) => (draft.results[g.id]?.games ?? []).filter(([h, a]) => h !== null || a !== null).map(([h, a]) => [h ?? 0, a ?? 0] as [number, number]));
    const tie = own.length > 1;
    const count = countFixture(
      rubbers,
      own.map((g) => {
        const given = draft.results[g.id]?.award;
        return given ? { winner: given.winner === 0 ? ("home" as const) : ("away" as const), open: given.open } : null;
      }),
    );
    const onCourt = own.some((g) => gameState(draft.results, g.id) === "onCourt");
    const done = own.length > 0 && own.every((g) => gameState(draft.results, g.id) === "finished");
    const from = first ? (day.projection.get(first.id)?.from ?? first.from) : null;
    return {
      code: match.code,
      label: match.code === "Final" ? "Final" : match.code === "Bronze" ? "Bronze match" : match.code,
      when: !first ? null : onCourt ? "On court" : done ? "Played" : `${clock(Math.round(from!))} · Court ${numbers.get(first.courtId) ?? "?"}`,
      sides,
      scores: tie
        ? rubbers.some((r) => r.length > 0)
          ? [[String(count.rubbersWon)], [String(count.rubbersLost)]]
          : [[], []]
        : [(rubbers[0] ?? []).map(([h]) => String(h)), (rubbers[0] ?? []).map(([, a]) => String(a))],
      mark: own.map((g) => awardMark(draft.results[g.id]?.award)).find(Boolean) ?? null,
    };
  };
  const champion = knockoutOutcome(draft, category, "Final");
  const championEntry = champion ? draft.entries.find((e) => e.id === champion.winner) : undefined;
  const tables = groupTables(draft, category);
  return {
    categoryId: category.id,
    category: categoryLabel(draft, category.id),
    rounds: bracket.rounds.map((round) => ({ name: roundName(round.size), matches: round.matches.map(box) })),
    bronze: bracket.bronze ? box(bracket.bronze) : null,
    champion: championEntry ? publicEntryName(draft, championEntry) : null,
    begun:
      // Knockout only: it is the whole tournament.
      draft.format === "knockout" ||
      tables.some((t) => t.complete) ||
      Object.keys(draft.results).some((id) => id.startsWith(`${category.id}:ko:`)),
  };
}

/** One page of the board's main area. */
export type BoardPage =
  | { kind: "courts" }
  | { kind: "tables"; categoryId: string; category: string; from: number; count: number; part: number; parts: number }
  | { kind: "knockout"; categoryId: string; category: string };

/**
 * The pages the board turns through. The courts come round between every
 * other page, so they are never far away. Each category's group tables are
 * split into pages of as many as fit; its knockout joins once it has begun.
 */
export function boardPages(
  tables: BoardTable[],
  brackets: Pick<BoardBracket, "categoryId" | "category" | "begun">[],
  categoryIds: string[],
  tablesPerPage: number,
): BoardPage[] {
  const per = Math.max(1, Math.floor(tablesPerPage));
  const others: BoardPage[] = [];
  for (const categoryId of categoryIds) {
    const own = tables.filter((t) => t.categoryId === categoryId);
    const parts = Math.ceil(own.length / per);
    for (let part = 0; part < parts; part++) {
      others.push({ kind: "tables", categoryId, category: own[0]!.category, from: part * per, count: Math.min(per, own.length - part * per), part: part + 1, parts });
    }
    const bracket = brackets.find((b) => b.categoryId === categoryId);
    if (bracket?.begun) others.push({ kind: "knockout", categoryId, category: bracket.category });
  }
  if (others.length === 0) return [{ kind: "courts" }];
  return others.flatMap((page): BoardPage[] => [{ kind: "courts" }, page]);
}

/** The line in the board's top band: how far the day has got. */
export function boardProgress(draft: PlanDraft, games: BoardSource[], day: LiveDay): string {
  const played = games.filter((g) => gameState(draft.results, g.id) === "finished").length;
  if (games.length > 0 && played === games.length) return "Finished";
  if (day.started === null) {
    const first = games.reduce((min, g) => Math.min(min, g.from), Infinity);
    return Number.isFinite(first) ? `Starts ${clock(first)}` : "";
  }
  return `${played} of ${games.length} games played`;
}
