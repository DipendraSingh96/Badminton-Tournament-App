import {
  EVENT_TYPES,
  categoryFormat,
  playersPerEntry,
  type CategoryFormat,
  type EventType,
  type GroupMode,
} from "@/engine";
import type { ImportedEntry } from "./csv";
import { emptyEntry, entryName, type CategoryDraft, type EntryDraft, type PlanDraft, type PlayerDraft } from "./draft";

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
  // Knockout only: "Seed 3" is the third place in the draw's one list.
  const seeded = /^Seed (\d+)$/.exec(slot);
  const match = seeded ? null : /^([A-Z])(\d+)$/.exec(slot);
  if (!seeded && !match) return null;
  const group = seeded ? 0 : groupIndexOf(match![1]!);
  const place = Number(seeded ? seeded[1] : match![2]) - 1;
  const id = group === null ? undefined : draft.draw[categoryId]?.groups[group]?.[place];
  return (id && draft.entries.find((e) => e.id === id)) || null;
}

/** A side's name once the draw places an entry there ("Smashers"); null for a slot not decided yet. */
export function sideName(draft: PlanDraft, categoryId: string, slot: string): string | null {
  const entry = entryForSlot(draft, categoryId, slot);
  return entry ? (entryName(entry) ?? "Unnamed entry") : null;
}

/**
 * Who plays for a side in a match: a team's players for the rubber (by its
 * fixed line-up), or a pair's or single's players. Empty until the draw
 * places someone there or the line-up is set.
 */
export function sidePlayers(draft: PlanDraft, categoryId: string, slot: string, rubber?: number): PlayerDraft[] {
  const entry = entryForSlot(draft, categoryId, slot);
  if (!entry) return [];
  if (draft.unit === "team") {
    const ids = rubber === undefined ? [] : (entry.lineUp[String(rubber)] ?? []);
    return ids.map((id) => entry.players.find((p) => p.id === id)).filter((p): p is PlayerDraft => Boolean(p));
  }
  return entry.players;
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

/** A category's format with its real entries: group sizes, qualifiers and the knockout, or why not yet. */
export function categoryFormatOf(
  draft: PlanDraft,
  category: CategoryDraft,
): { ok: true; format: CategoryFormat } | { ok: false; message: string } {
  const entries = draft.entries.filter((e) => e.categoryId === category.id).length;
  if (entries < 2) return { ok: false, message: "Add at least 2 entries first." };
  if (!draft.format) return { ok: false, message: "Choose a format on the Plan stage first." };
  const groups: GroupMode | undefined =
    category.groupMode === "fixed" && category.groupCount
      ? { type: "fixed", groupCount: category.groupCount }
      : category.groupMode === "auto" && category.preferredGroupSize
        ? { type: "auto", preferredSize: category.preferredGroupSize }
        : undefined;
  if (draft.format !== "knockout" && !groups) return { ok: false, message: "Set how groups are made on the Plan stage first." };
  const result = categoryFormat(
    { expectedEntries: entries, groups, qualifiersPerGroup: category.qualifiersPerGroup ?? undefined, bronze: category.bronze },
    draft.format,
  );
  if (!result.ok) return { ok: false, message: "The plan's group settings don't work with this many entries." };
  return { ok: true, format: result.format };
}

/**
 * The places a category's draw fills: its group sizes from the plan (with the
 * real entries), or for knockout only one list in seed order. A message
 * instead when the plan can't give them yet.
 */
export function drawSizes(draft: PlanDraft, category: CategoryDraft): { ok: true; sizes: number[] } | { ok: false; message: string } {
  const format = categoryFormatOf(draft, category);
  if (!format.ok) return format;
  if (draft.format === "knockout") return { ok: true, sizes: [format.format.qualifiers] };
  return { ok: true, sizes: format.format.groupSizes };
}

/** A draw made before the entries or group sizes changed: it no longer matches and must be made again. */
export function drawStale(draft: PlanDraft, category: CategoryDraft): boolean {
  const draw = draft.draw[category.id];
  if (!draw) return false;
  const sizes = drawSizes(draft, category);
  if (!sizes.ok) return true;
  const ids = draft.entries.filter((e) => e.categoryId === category.id).map((e) => e.id);
  const placed = draw.groups.flat();
  return (
    sizes.sizes.length !== draw.groups.length ||
    sizes.sizes.some((n, i) => draw.groups[i]!.length !== n) ||
    placed.length !== ids.length ||
    ids.some((id) => !placed.includes(id))
  );
}
