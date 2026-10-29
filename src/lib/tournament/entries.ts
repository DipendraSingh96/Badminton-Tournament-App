import { EVENT_TYPES, playersPerEntry, type EventType } from "@/engine";
import type { ImportedEntry } from "./csv";
import { emptyEntry, type CategoryDraft, type EntryDraft, type PlanDraft } from "./draft";

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

/** A team category's rubbers in a tie, numbered as the schedule numbers them (event order). */
export function rubbersOf(category: CategoryDraft): { number: number; event: EventType; players: number }[] {
  const rubbers: { number: number; event: EventType; players: number }[] = [];
  for (const event of EVENT_TYPES) {
    for (let i = 0; i < (category.lineUp[event] ?? 0); i++) {
      rubbers.push({ number: rubbers.length + 1, event, players: playersPerEntry(event) });
    }
  }
  return rubbers;
}

/**
 * How many players a new entry starts with: one or two for an individual
 * event, or for a team enough to play every rubber with nobody playing twice
 * (players can be removed, or play more than one rubber).
 */
export function playersFor(draft: PlanDraft, category: CategoryDraft): number {
  if (draft.unit === "team") return Math.max(1, rubbersOf(category).reduce((sum, r) => sum + r.players, 0));
  return category.event ? playersPerEntry(category.event) : 2;
}

/** Whether every rubber of a team has its players chosen; always true outside team events. */
export function lineUpComplete(draft: PlanDraft, entry: EntryDraft, category: CategoryDraft): boolean {
  if (draft.unit !== "team") return true;
  const ids = new Set(entry.players.map((p) => p.id));
  return rubbersOf(category).every((r) => {
    const chosen = (entry.lineUp[String(r.number)] ?? []).filter((id) => ids.has(id));
    return chosen.length === r.players;
  });
}

/** Seeds used more than once in a category. */
export function repeatedSeeds(entries: EntryDraft[]): Set<number> {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const e of entries) {
    if (e.seed === null) continue;
    if (seen.has(e.seed)) repeated.add(e.seed);
    seen.add(e.seed);
  }
  return repeated;
}

/** Entries read from a spreadsheet, as draft entries: individual entries get the players their event needs. */
export function importedEntries(draft: PlanDraft, imported: ImportedEntry[]): EntryDraft[] {
  return imported.map((row) => {
    const category = draft.categories.find((c) => c.id === row.categoryId)!;
    const needed = draft.unit === "team" ? row.players.length : playersFor(draft, category);
    const entry = emptyEntry(row.categoryId, Math.max(needed, row.players.length));
    entry.name = row.name;
    entry.external = row.external;
    entry.seed = row.seed;
    row.players.forEach((name, i) => (entry.players[i]!.name = name));
    return entry;
  });
}
