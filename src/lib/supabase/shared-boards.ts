import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublicBoard, type PublicBoard } from "@/lib/tournament/public-board";

// The players' link in Supabase (table `shared_boards`, function `shared_board`).
// The organiser's side writes a public snapshot under the link's secret id;
// row level security keeps that to the tournament's owner. The public side
// reads one snapshot through the function, by its id, with no session.

/** What the organiser's app does with a tournament's players' link. */
export interface Sharing {
  /** Puts the snapshot under the link. Throws when it couldn't be sent. */
  publish(link: string, tournamentId: string, board: PublicBoard): Promise<void>;
  /** Takes the tournament's link away: whoever has it sees that it is no longer shared. */
  stop(tournamentId: string): Promise<void>;
}

export function accountSharing(supabase: SupabaseClient): Sharing {
  return {
    async publish(link, tournamentId, board) {
      const { error } = await supabase
        .from("shared_boards")
        .upsert({ id: link, tournament_id: tournamentId, data: board, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw error;
    },
    async stop(tournamentId) {
      const { error } = await supabase.from("shared_boards").delete().eq("tournament_id", tournamentId);
      if (error) throw error;
    },
  };
}

/** What a players' link gives: its snapshot and when the desk last sent it; null when it isn't shared. */
export interface Followed {
  board: PublicBoard;
  updatedAt: number;
}

/** Reads a players' link. Null: not shared (or never was). Throws when it couldn't be reached. */
export async function followBoard(supabase: SupabaseClient, link: string): Promise<Followed | null> {
  // A link is a uuid: anything else is not one, and isn't sent.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link)) return null;
  const { data, error } = await supabase.rpc("shared_board", { link });
  if (error) throw error;
  const found = data as { data?: unknown; updated_at?: string } | null;
  const board = readPublicBoard(found?.data);
  if (!found || !board) return null;
  return { board, updatedAt: found.updated_at ? Date.parse(found.updated_at) : Date.now() };
}
