import type { EntryDraft, PlanDraft } from "./draft";

// From draw slots to the people in them: "A1" is group A's first place, and
// the draw says which entry holds it. Before the draw, slots stay as they are.

/** A group's index from its letter: A is 0; groups past Z are "G27" and on. */
export function groupIndexOf(letter: string): number | null {
  if (/^[A-Z]$/.test(letter)) return letter.charCodeAt(0) - 65;
  const late = /^G(\d+)$/.exec(letter);
  return late ? Number(late[1]) - 1 : null;
}

/**
 * The entry holding a group slot ("A1"), or null before the draw. (Slots of
 * groups past Z, "G27…", run the group and place numbers together, so they
 * are read only up to 26 groups.)
 */
export function entryForSlot(draft: PlanDraft, categoryId: string, slot: string): EntryDraft | null {
  const match = /^([A-Z])(\d+)$/.exec(slot);
  if (!match) return null;
  const group = groupIndexOf(match[1]!);
  const place = Number(match[2]) - 1;
  const id = group === null ? undefined : draft.draw[categoryId]?.groups[group]?.[place];
  return (id && draft.entries.find((e) => e.id === id)) || null;
}

/** The players of a team who play a rubber, by the team's fixed line-up; empty when not set. */
export function rubberPlayers(entry: EntryDraft, rubber: number): string[] {
  const ids = entry.lineUp[String(rubber)] ?? [];
  return ids.map((id) => entry.players.find((p) => p.id === id)?.name.trim()).filter((n): n is string => Boolean(n));
}
