import {
  EVENT_TYPES,
  categoryFormat,
  entryInPlace,
  fixtureWinner,
  groupFixtures,
  groupLetter,
  groupStandings,
  knockoutBracket,
  playersPerEntry,
  type CategoryFormat,
  type EventType,
  type GroupMode,
  type Award,
  type KnockoutMatch,
  type PlayedFixture,
  type Stage,
  type StandingRow,
} from "@/engine";
import type { ImportedEntry } from "./csv";
import {
  defaultCategoryName,
  emptyEntry,
  entryName,
  type CategoryDraft,
  type EntryDraft,
  type PlanDraft,
  type PlayerDraft,
} from "./draft";

// From draw slots to the people in them: "A1" is group A's first place, and
// the draw says which entry holds it. Before the draw, slots stay as they are.
// Knockout sides ("Winner A", "Winner QF1") are filled from results: a group's
// places once it has finished, a match's winner or loser once it's played.

/** A group's index from its letter: A is 0; groups past Z are "G27" and on. */
export function groupIndexOf(letter: string): number | null {
  if (/^[A-Z]$/.test(letter)) return letter.charCodeAt(0) - 65;
  const late = /^G(\d+)$/.exec(letter);
  return late ? Number(late[1]) - 1 : null;
}

export interface SlotOptions {
  /**
   * "If it ended now": group places are read from the tables as they stand,
   * finished or not. Match winners still need the match to be played.
   */
  provisional?: boolean;
}

/** The id of the entry in a slot; see `entryForSlot`. */
function entryIdForSlot(draft: PlanDraft, categoryId: string, slot: string, options?: SlotOptions): string | null {
  // Knockout only: "Seed 3" is the third place in the draw's one list.
  const seeded = /^Seed (\d+)$/.exec(slot);
  const drawn = seeded ? null : /^([A-Z])(\d+)$/.exec(slot);
  if (seeded || drawn) {
    const group = seeded ? 0 : groupIndexOf(drawn![1]!);
    const place = Number(seeded ? seeded[1] : drawn![2]) - 1;
    return (group === null ? undefined : draft.draw[categoryId]?.groups[group]?.[place]) ?? null;
  }
  const category = draft.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  // A group's place: "Winner A", "Runner-up B", "3rd C".
  const placed = /^(Winner|Runner-up|(\d+)(?:st|nd|rd|th)) ([A-Z]|G\d+)$/.exec(slot);
  if (placed) {
    const group = groupIndexOf(placed[3]!);
    const table = group === null ? null : groupTable(draft, category, group);
    if (!table) return null;
    const place = placed[1] === "Winner" ? 1 : placed[1] === "Runner-up" ? 2 : Number(placed[2]);
    if (options?.provisional) return table.rows[place - 1]?.id ?? null;
    return table.complete ? entryInPlace(table.rows, place) : null;
  }
  // A knockout match's winner or loser: "Winner QF1", "Loser SF2".
  const fed = /^(Winner|Loser) (\S+)$/.exec(slot);
  if (fed) {
    const outcome = knockoutOutcome(draft, category, fed[2]!);
    return outcome ? (fed[1] === "Winner" ? outcome.winner : outcome.loser) : null;
  }
  return null;
}

/**
 * The entry on a side: who holds a draw slot ("A1", "Seed 3"), who finished
 * in a group's place ("Winner A") once the group is played, or who won or
 * lost a knockout match ("Winner QF1") once it's finished. Null until then.
 * (Slots of groups past Z, "G27…", run the group and place numbers together,
 * so they are read only up to 26 groups.)
 */
export function entryForSlot(draft: PlanDraft, categoryId: string, slot: string, options?: SlotOptions): EntryDraft | null {
  const id = entryIdForSlot(draft, categoryId, slot, options);
  return (id && draft.entries.find((e) => e.id === id)) || null;
}

/** Matches in a fixture: 1, or the rubbers of a team tie. */
function rubberCount(draft: PlanDraft, category: CategoryDraft): number {
  return draft.unit === "team" ? Math.max(1, rubbersOf(category).length) : 1;
}

/**
 * A fixture's games once every one of its matches is finished (a team tie's
 * rubbers share the fixture's id, numbered ":r1", ":r2"…); null until then.
 */
function finishedFixture(
  draft: PlanDraft,
  fixtureId: string,
  rubbers: number,
): { rubbers: [number, number][][]; awards: (Award | null)[] } | null {
  const all: [number, number][][] = [];
  const awards: (Award | null)[] = [];
  for (let r = 1; r <= rubbers; r++) {
    const result = draft.results[`${fixtureId}:r${r}`];
    if (result?.state !== "finished") return null;
    all.push(result.games.filter(([home, away]) => home !== null || away !== null).map(([home, away]) => [home ?? 0, away ?? 0]));
    // A match given to a side (a walkover, a retirement) is that side's whatever the scores.
    awards.push(result.award ? { winner: result.award.winner === 0 ? "home" : "away", open: result.award.open } : null);
  }
  return { rubbers: all, awards };
}

/** An entry's lot in its group, from the draw's stored number: the same every time, and different for each place. */
function lotOf(randomSeed: number, group: number, place: number): number {
  let x = (randomSeed ^ Math.imul(group + 1, 0x9e3779b1) ^ Math.imul(place + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return (x % 1_000_000) * 100 + place;
}

/** Where an entry stands once its group has finished. */
export type GroupStatus = "contention" | "through" | "out" | "level" | "winner" | "placed" | "withdrawn";

export interface GroupTable {
  index: number;
  letter: string;
  /** Best first, by the tournament's tiebreak order. */
  rows: StandingRow[];
  /** Fixtures finished, and how many the group has. */
  played: number;
  total: number;
  /** Every fixture is finished. */
  complete: boolean;
  /** How many go through to the knockout; 0 for groups only. */
  qualify: number;
  /** Entries that withdrew during the group stage: last in the table. */
  withdrawn: string[];
}

/** A group's table from the results so far; null before the draw. */
export function groupTable(draft: PlanDraft, category: CategoryDraft, group: number): GroupTable | null {
  const draw = draft.draw[category.id];
  const ids = draft.format === "knockout" ? undefined : draw?.groups[group];
  if (!draw || !ids) return null;
  const letter = groupLetter(group);
  const rubbers = rubberCount(draft, category);
  // Entries that withdrew with group games to play come last; one whose results were voided has no games that count.
  const withdrawn = ids.filter((id) => draft.withdrawn[id]?.stage === "group");
  const voided = new Set(withdrawn.filter((id) => draft.withdrawn[id]!.results === "void"));
  const pairs = groupFixtures(ids.length)
    .flat()
    .filter(([a, b]) => !voided.has(ids[a - 1]!) && !voided.has(ids[b - 1]!));
  const fixtures: PlayedFixture[] = [];
  for (const [a, b] of pairs) {
    const played = finishedFixture(draft, `${category.id}:group:${letter}:${letter}${a}-${letter}${b}`, rubbers);
    if (played) fixtures.push({ home: ids[a - 1]!, away: ids[b - 1]!, ...played });
  }
  const rows = groupStandings({
    entries: ids,
    fixtures,
    tiebreaks: draft.rules.tiebreaks,
    lots: Object.fromEntries(ids.map((id, p) => [id, lotOf(draw.randomSeed, group, p)])),
    byHand: draft.decided[`${category.id}:${group}`],
    withdrawn,
  });
  return {
    index: group,
    letter,
    rows,
    played: fixtures.length,
    total: pairs.length,
    complete: pairs.length > 0 && fixtures.length === pairs.length,
    qualify: draft.format === "groupsKnockout" ? (category.qualifiersPerGroup ?? 0) : 0,
    withdrawn,
  };
}

/** Every group's table in a category; empty before the draw or for knockout only. */
export function groupTables(draft: PlanDraft, category: CategoryDraft): GroupTable[] {
  return (draft.draw[category.id]?.groups ?? []).flatMap((_, g) => groupTable(draft, category, g) ?? []);
}

/**
 * Where a row stands: in contention until the group is finished; then
 * through or out by the qualifying line. Entries level on every tiebreak are
 * "level" when the line runs between them (or, with no knockout, when first
 * place is among them): that needs deciding by hand.
 */
export function groupStatus(table: GroupTable, row: StandingRow): GroupStatus {
  if (table.withdrawn.includes(row.id)) return "withdrawn";
  if (!table.complete) return "contention";
  const last = row.place + table.rows.filter((r) => r.place === row.place).length - 1;
  if (table.qualify === 0) return row.shared ? (row.place === 1 ? "level" : "placed") : row.place === 1 ? "winner" : "placed";
  if (last <= table.qualify) return "through";
  if (row.place > table.qualify) return "out";
  return "level";
}

/** A category's knockout match by its code ("QF1", "Final", "Bronze"); null when there's none. */
export function knockoutMatchOf(draft: PlanDraft, category: CategoryDraft, code: string): KnockoutMatch | null {
  const format = categoryFormatOf(draft, category);
  if (!format.ok || draft.format === "groups") return null;
  const bracket = knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);
  if (bracket.bronze?.code === code) return bracket.bronze;
  return bracket.rounds.flatMap((r) => r.matches).find((m) => m.code === code) ?? null;
}

/** The ids of the matches (one, or a tie's rubbers) that make up a knockout match. */
function knockoutIds(draft: PlanDraft, category: CategoryDraft, code: string): string[] {
  return Array.from({ length: rubberCount(draft, category) }, (_, r) => `${category.id}:ko:${code}:r${r + 1}`);
}

/**
 * A finished knockout match's winner and loser, as entry ids: the two entries
 * that played it (as kept when it was started), by its scores. Null until
 * every rubber is finished, or if a tie ended level on rubbers, games and points.
 */
export function knockoutOutcome(draft: PlanDraft, category: CategoryDraft, code: string): { winner: string; loser: string } | null {
  const match = knockoutMatchOf(draft, category, code);
  if (!match) return null;
  const played = finishedFixture(draft, `${category.id}:ko:${code}`, rubberCount(draft, category));
  if (!played) return null;
  const kept = knockoutIds(draft, category, code)
    .map((id) => draft.results[id]?.sides)
    .find(Boolean);
  const home = kept?.[0] ?? entryIdForSlot(draft, category.id, match.home);
  const away = kept?.[1] ?? entryIdForSlot(draft, category.id, match.away);
  const winner = fixtureWinner(played.rubbers, played.awards);
  if (!home || !away || !winner) return null;
  return winner === "home" ? { winner: home, loser: away } : { winner: away, loser: home };
}

/**
 * A started match whose sides are no longer who the results say should be in
 * it: a score corrected after the fact changed a group's places or an earlier
 * match's winner. Nothing is changed; the desk decides what to do.
 */
export function sidesChanged(draft: PlanDraft, categoryId: string, matchId: string, home: string, away: string): boolean {
  const kept = draft.results[matchId]?.sides;
  if (!kept) return false;
  return kept[0] !== entryIdForSlot(draft, categoryId, home) || kept[1] !== entryIdForSlot(draft, categoryId, away);
}

/** A knockout match's name from its code: "Quarter-final 1", "Final", "Bronze match". */
export function knockoutRoundName(code: string): string {
  if (code === "Final") return "Final";
  if (code === "Bronze") return "Bronze match";
  const quarter = /^QF(\d+)$/.exec(code);
  if (quarter) return `Quarter-final ${quarter[1]}`;
  const semi = /^SF(\d+)$/.exec(code);
  if (semi) return `Semi-final ${semi[1]}`;
  const round = /^R(\d+)-(\d+)$/.exec(code);
  return round ? `Round of ${round[1]}, match ${round[2]}` : code;
}

/** A category's name: its own, or its event's. */
export function categoryLabel(draft: PlanDraft, categoryId: string): string {
  const index = draft.categories.findIndex((c) => c.id === categoryId);
  return draft.categories[index]?.name.trim() || defaultCategoryName(draft, index);
}

/** A match read from its id: its category and stage, the two sides' slots, and what to call it. */
export interface MatchRef {
  id: string;
  categoryId: string;
  stage: Stage;
  /** Group stage: the group's index. */
  group: number | null;
  /** Knockout: "QF1", "Final", "Bronze". */
  code: string | null;
  home: string;
  away: string;
  /** "Group A", "Quarter-final 1"; with "rubber 2" for a team tie, and the category when there are several. */
  label: string;
}

/** The match with an id as the schedule makes them ("<category>:group:A:A1-A2:r1", "<category>:ko:QF1:r1"); null for any other. */
export function matchRef(draft: PlanDraft, id: string): MatchRef | null {
  const parts = /^(.*):(?:group:([A-Z]|G\d+):(\w+)-(\w+)|ko:([^:]+)):r(\d+)$/.exec(id);
  if (!parts) return null;
  const categoryId = parts[1]!;
  const category = draft.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const code = parts[5] ?? null;
  const knockout = code ? knockoutMatchOf(draft, category, code) : null;
  if (code && !knockout) return null;
  const rubber = draft.unit === "team" && rubberCount(draft, category) > 1 ? `, rubber ${parts[6]}` : "";
  const of = draft.categories.length > 1 ? `${categoryLabel(draft, categoryId)}, ` : "";
  return {
    id,
    categoryId,
    stage: !code ? "group" : code === "Final" ? "final" : code === "Bronze" ? "bronze" : "knockout",
    group: code ? null : groupIndexOf(parts[2]!),
    code,
    home: knockout ? knockout.home : parts[3]!,
    away: knockout ? knockout.away : parts[4]!,
    label: `${of}${code ? knockoutRoundName(code) : `Group ${parts[2]}`}${rubber}`,
  };
}

/** The ids of every match (rubber) in a group fixture or knockout match that a match belongs to. */
export function fixtureMatchIds(draft: PlanDraft, ref: MatchRef): string[] {
  const category = draft.categories.find((c) => c.id === ref.categoryId)!;
  const base = ref.id.replace(/:r\d+$/, "");
  return Array.from({ length: rubberCount(draft, category) }, (_, r) => `${base}:r${r + 1}`);
}

/** Every match id of a category: its group fixtures, then its knockout, in bracket order. */
export function categoryMatchIds(draft: PlanDraft, category: CategoryDraft): string[] {
  const rubbers = rubberCount(draft, category);
  const ids: string[] = [];
  const add = (base: string) => {
    for (let r = 1; r <= rubbers; r++) ids.push(`${base}:r${r}`);
  };
  if (draft.format !== "knockout") {
    (draft.draw[category.id]?.groups ?? []).forEach((group, g) => {
      const letter = groupLetter(g);
      for (const [a, b] of groupFixtures(group.length).flat()) add(`${category.id}:group:${letter}:${letter}${a}-${letter}${b}`);
    });
  }
  const format = categoryFormatOf(draft, category);
  if (format.ok && draft.format !== "groups") {
    const bracket = knockoutBracket(format.format.qualifiers, format.format.groupSizes.length, category.bronze);
    for (const m of [...bracket.rounds.flatMap((r) => r.matches), ...(bracket.bronze ? [bracket.bronze] : [])]) add(`${category.id}:ko:${m.code}`);
  }
  return ids;
}

/** The id of the entry on a side, by the draw or by results; null until it's known. */
export function entryIdOn(draft: PlanDraft, categoryId: string, slot: string): string | null {
  return entryIdForSlot(draft, categoryId, slot);
}

/** A side's name once an entry is there, by the draw or by results ("Smashers"); null for a side not decided yet. */
export function sideName(draft: PlanDraft, categoryId: string, slot: string, options?: SlotOptions): string | null {
  const entry = entryForSlot(draft, categoryId, slot, options);
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

/** Everyone playing a match, home side then away: the players a game waits for. */
export function matchPlayers(draft: PlanDraft, match: { categoryId: string; home: string; away: string; rubber?: { number: number } }): PlayerDraft[] {
  return [match.home, match.away].flatMap((slot) => sidePlayers(draft, match.categoryId, slot, match.rubber?.number));
}

/** How many of some players have arrived, are still awaited, or are absent. */
export interface AttendanceCounts {
  arrived: number;
  notYet: number;
  absent: number;
}

export function attendanceCounts(players: PlayerDraft[]): AttendanceCounts {
  const counts = { arrived: 0, notYet: 0, absent: 0 };
  for (const p of players) counts[p.attendance === "arrived" ? "arrived" : p.attendance === "absent" ? "absent" : "notYet"] += 1;
  return counts;
}

/** Entries that sit together: a group of a category, a knockout-only category's seeds, or a category's entries not drawn yet. */
export interface EntryGroup {
  key: string;
  categoryId: string;
  kind: "group" | "seeds" | "undrawn";
  /** The group's index in its category's draw; null for seeds and undrawn entries. */
  group: number | null;
  /** In draw order (place in the group, or seed); undrawn entries as entered. */
  entries: EntryDraft[];
  counts: AttendanceCounts;
}

/**
 * Entries gathered by where the draw put them, a category at a time: each
 * group in order, then that category's entries not drawn. Empty ones are
 * left out. Given a list, only those entries are gathered.
 */
export function entryGroups(draft: PlanDraft, entries: EntryDraft[] = draft.entries): EntryGroup[] {
  const out: EntryGroup[] = [];
  const add = (key: string, categoryId: string, kind: EntryGroup["kind"], group: number | null, list: EntryDraft[]) => {
    if (list.length > 0) out.push({ key, categoryId, kind, group, entries: list, counts: attendanceCounts(list.flatMap((e) => e.players)) });
  };
  for (const category of draft.categories) {
    const own = entries.filter((e) => e.categoryId === category.id);
    const byId = new Map(own.map((e) => [e.id, e]));
    const drawn = new Set<string>();
    for (const [g, ids] of (draft.draw[category.id]?.groups ?? []).entries()) {
      const list = ids.map((id) => byId.get(id)).filter((e): e is EntryDraft => Boolean(e));
      for (const e of list) drawn.add(e.id);
      add(`${category.id}:${g}`, category.id, draft.format === "knockout" ? "seeds" : "group", draft.format === "knockout" ? null : g, list);
    }
    add(`${category.id}:undrawn`, category.id, "undrawn", null, own.filter((e) => !drawn.has(e.id)));
  }
  return out;
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
    row.phones?.forEach((phone, i) => phone && (entry.players[i]!.phone = phone));
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

/** Swaps two entries' places in their category's draw (in place); nothing happens if either isn't drawn or the draw is locked. */
export function swapDrawn(draft: PlanDraft, categoryId: string, first: string, second: string): void {
  const draw = draft.draw[categoryId];
  if (!draw || draw.locked || first === second) return;
  const at = (id: string) => {
    const g = draw.groups.findIndex((list) => list.includes(id));
    return g === -1 ? null : ([g, draw.groups[g]!.indexOf(id)] as const);
  };
  const a = at(first);
  const b = at(second);
  if (!a || !b) return;
  draw.groups[a[0]]![a[1]] = second;
  draw.groups[b[0]]![b[1]] = first;
}
