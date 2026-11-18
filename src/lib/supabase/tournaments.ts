import type { SupabaseClient } from "@supabase/supabase-js";
import type { Remote } from "@/lib/tournament/cloud";

/**
 * The signed-in organiser's tournaments in Supabase (table `tournaments`).
 * Which rows these calls can see and change is decided by row level security:
 * only the user's own. A new row is theirs by the table's default.
 */
export function accountRemote(supabase: SupabaseClient): Remote {
  const table = () => supabase.from("tournaments");
  return {
    async list() {
      const { data, error } = await table().select("id, updated_at");
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id as string, updatedAt: Date.parse(row.updated_at as string) }));
    },
    async get(id) {
      const { data, error } = await table().select("data, updated_at").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? { data: data.data as unknown, updatedAt: Date.parse(data.updated_at as string) } : null;
    },
    async put(id, draft, updatedAt) {
      const { error } = await table().upsert({
        id,
        name: draft.name,
        event_date: draft.frame.date || null,
        data: draft,
        updated_at: new Date(updatedAt).toISOString(),
      });
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await table().delete().eq("id", id);
      if (error) throw error;
    },
  };
}
