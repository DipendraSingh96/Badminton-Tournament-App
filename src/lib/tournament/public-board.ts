import {
  boardBracket,
  boardCourts,
  boardProgress,
  boardTables,
  boardUpNext,
  publicEntryName,
  type BoardBracket,
  type BoardGame,
  type BoardHall,
  type BoardSource,
  type BoardTable,
} from "./audience";
import type { PlanDraft } from "./draft";
import type { LiveDay } from "./live-day";
import { placings } from "./results";

// The players' link.
//
// A tournament is private to its organiser: it holds phone numbers, check-in
// and money. What the players' link shows is a separate snapshot, built here
// out of the audience board's own functions (audience.ts), which return only
// what may be shown in public: names as the organiser chose them to appear,
// courts, times, scores, tables, the bracket and the places. The snapshot is
// the only thing that ever leaves the tournament for the link. Nothing is
// copied into it from the tournament directly except its name and date.

/** The snapshot's shape; raised when the page could no longer read an older one. */
export const PUBLIC_BOARD_VERSION = 1;

/** How many waiting games the link lists: enough for the next few hours, not the whole day's paperwork. */
const UP_NEXT_SHOWN = 40;

/** A category's places, with the names as they appear in public. */
export interface PublicPlacing {
  categoryId: string;
  category: string;
  places: { place: number; names: string[]; group: string | null }[];
}

/** What the players' link shows. Plain data: it is stored and sent as JSON. */
export interface PublicBoard {
  v: number;
  name: string;
  /** The tournament's date, "YYYY-MM-DD", or "". */
  date: string;
  /** Before the day (the draw and the times), while it is being played, or finished (the results). */
  stage: "before" | "live" | "finished";
  /** A rehearsal is being shown: none of this is real. */
  rehearsal: boolean;
  /** How far the day has got: "Starts 09:00", "12 of 62 games played", "Finished". */
  progress: string;
  /** The desk's time when this was made ("10:32"), in the tournament's time zone. */
  clock: string | null;
  halls: BoardHall[];
  upNext: BoardGame[];
  tables: BoardTable[];
  brackets: BoardBracket[];
  placings: PublicPlacing[];
}

/**
 * The public snapshot of a tournament as the day stands. `games` and `day`
 * are the schedule and the day as the desk has them (a rehearsal's, when one
 * is being shown).
 */
export function publicBoard(
  draft: PlanDraft,
  games: BoardSource[],
  day: LiveDay,
  options: { clock: string | null; rehearsal: boolean },
): PublicBoard {
  const entryName = (id: string) => {
    const entry = draft.entries.find((e) => e.id === id);
    return entry ? publicEntryName(draft, entry) : "";
  };
  const categoryName = (id: string) => boardTables(draft).find((t) => t.categoryId === id)?.category;
  const brackets = draft.categories.flatMap((c) => boardBracket(draft, games, day, c) ?? []);
  return {
    v: PUBLIC_BOARD_VERSION,
    name: draft.name.trim(),
    date: draft.frame.date,
    stage: draft.stage === "results" ? "finished" : draft.stage === "live" ? "live" : "before",
    rehearsal: options.rehearsal,
    progress: boardProgress(draft, games, day),
    clock: options.clock,
    halls: boardCourts(draft, games, day),
    upNext: boardUpNext(draft, games, day).slice(0, UP_NEXT_SHOWN),
    tables: boardTables(draft),
    brackets,
    placings: draft.categories.flatMap((category): PublicPlacing[] => {
      const places = placings(draft, category).map((p) => ({ place: p.place, names: p.entryIds.map(entryName).filter(Boolean), group: p.group ?? null }));
      if (places.length === 0) return [];
      const name = categoryName(category.id) ?? brackets.find((b) => b.categoryId === category.id)?.category ?? category.name;
      return [{ categoryId: category.id, category: name, places }];
    }),
  };
}

/** Reads a stored snapshot; null when it isn't one this page can show. */
export function readPublicBoard(data: unknown): PublicBoard | null {
  if (!data || typeof data !== "object") return null;
  const board = data as Partial<PublicBoard>;
  if (board.v !== PUBLIC_BOARD_VERSION || typeof board.name !== "string") return null;
  if (!Array.isArray(board.halls) || !Array.isArray(board.upNext) || !Array.isArray(board.tables)) return null;
  if (!Array.isArray(board.brackets) || !Array.isArray(board.placings)) return null;
  return board as PublicBoard;
}

/** The address of a tournament's players' link: only the link's own id, never the tournament's or a name. */
export function followUrl(link: string): string {
  return `/follow?t=${encodeURIComponent(link)}`;
}
