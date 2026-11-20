import { emptyDummyMarks, emptyResources, emptySuperMatch, newId, withOwnRules, type FinanceDraft, type HallDraft, type PlanDraft } from "./draft";
import { migrateV3, migrateV4 } from "./migrate";

// Browser-only saving for Plan mode until tournaments move to Supabase: a list
// of saved tournaments, each under its own key.
// Storage can be unavailable (private windows, blocked site data), so every
// access is guarded and failure just means nothing is remembered.

// The single draft kept before saved tournaments. v5: timing per stage,
// external entries counted in entries, rules. v4 and v3 drafts are migrated;
// earlier drafts are not read.
const KEY = "badminton:plan-draft:v5";
const V4_KEY = "badminton:plan-draft:v4";
const V3_KEY = "badminton:plan-draft:v3";

/** Finance as saved before per-tube pricing and other money in. */
type EarlyFinance = Omit<FinanceDraft, "shuttlePriceBasis" | "shuttlePrice" | "shuttlesPerTube" | "otherIncome"> &
  Partial<FinanceDraft> & { costPerShuttle?: number | null };

type EarlyHall = Omit<HallDraft, "unitMinutes" | "multipleRates"> & {
  unitMinutes?: number | null;
  multipleRates?: boolean;
};

/**
 * Fills in fields added during v5:
 * - A price saved as cost per shuttle keeps its meaning: per shuttle.
 * - Other money in starts empty.
 * - Halls saved before unit time were charged per hour, so their unit is 60.
 * - Halls saved before the rate-bands switch have it on when they have several bands.
 */
export function normaliseDraft(
  saved: Omit<
    PlanDraft,
    | "finance"
    | "frame"
    | "zoneMoves"
    | "matchMoves"
    | "groupCourts"
    | "courtGroups"
    | "stage"
    | "entries"
    | "draw"
    | "dummy"
    | "withdrawn"
    | "decided"
    | "superCourts"
    | "log"
    | "startedAt"
    | "resources"
    | "publicNames"
    | "publicLink"
  > & {
    /** Zones dragged in time before zone moves; their start carries over. */
    stageWindows?: Record<string, { from: string; to: string }>;
    zoneMoves?: PlanDraft["zoneMoves"];
    matchMoves?: PlanDraft["matchMoves"];
    results?: PlanDraft["results"];
    withdrawn?: PlanDraft["withdrawn"];
    decided?: PlanDraft["decided"];
    superCourts?: PlanDraft["superCourts"];
    log?: PlanDraft["log"];
    startedAt?: PlanDraft["startedAt"];
    overspill?: PlanDraft["overspill"];
    actuals?: PlanDraft["actuals"];
    resources?: PlanDraft["resources"];
    publicNames?: PlanDraft["publicNames"];
    publicLink?: PlanDraft["publicLink"];
    groupCourts?: PlanDraft["groupCourts"];
    courtGroups?: PlanDraft["courtGroups"];
    stage?: PlanDraft["stage"];
    entries?: PlanDraft["entries"];
    draw?: PlanDraft["draw"];
    dummy?: PlanDraft["dummy"];
    finance: EarlyFinance;
    frame: Omit<PlanDraft["frame"], "halls" | "bufferStart"> & { halls: EarlyHall[]; bufferStart?: string | null };
  },
): PlanDraft {
  const halls: HallDraft[] = saved.frame.halls.map((h) => ({
    ...h,
    unitMinutes: h.unitMinutes === undefined ? 60 : h.unitMinutes,
    // Halls saved before the switch had it on whenever they had several bands.
    multipleRates: h.multipleRates ?? h.bands.length > 1,
  }));
  const { stageWindows, ...rest } = saved;
  // Per-hall zones dragged in time keep their start; earlier stage, wave and round windows are dropped.
  const carried = Object.fromEntries(
    Object.entries(stageWindows ?? {})
      .filter(([key]) => saved.frame.halls.some((h) => key === `${h.id}:group` || key === `${h.id}:knockout`))
      .map(([key, w]) => [key, { start: w.from, hallId: null }]),
  );
  const draft = {
    ...rest,
    zoneMoves: saved.zoneMoves ?? carried,
    matchMoves: saved.matchMoves ?? {},
    // Saved before Live: nothing has been played.
    results: saved.results ?? {},
    // Saved before controlled changes: none have been made.
    withdrawn: saved.withdrawn ?? {},
    decided: saved.decided ?? {},
    // Saved before the super match: none placed, and its rules not set.
    superCourts: saved.superCourts ?? {},
    rules: { ...rest.rules, superMatch: { ...emptySuperMatch(), ...rest.rules.superMatch } },
    log: saved.log ?? [],
    // Saved before the tournament could be started by hand: not started.
    startedAt: saved.startedAt ?? null,
    // Saved before overspill: none.
    overspill: saved.overspill ?? null,
    // Saved before Results: nothing corrected.
    actuals: saved.actuals ?? {},
    // Saved before the Resources page: nothing prepared yet.
    resources: { ...emptyResources(), ...saved.resources },
    // Saved before the audience board: names in full.
    publicNames: saved.publicNames ?? "full",
    publicLink: typeof saved.publicLink === "string" ? saved.publicLink : null,
    // Groups keep their own courts unless the organiser chose to share them.
    groupCourts: saved.groupCourts ?? "own",
    courtGroups: saved.courtGroups ?? {},
    // Saved before entries: still planning, with none.
    stage: saved.stage ?? "plan",
    entries: saved.entries ?? [],
    draw: saved.draw ?? {},
    // Saved before dummy data: none of it is dummy.
    dummy: saved.dummy ?? emptyDummyMarks(),
    frame: { ...saved.frame, halls, bufferStart: saved.frame.bufferStart ?? null },
  };
  const { costPerShuttle, ...finance } = draft.finance;
  if (finance.shuttlePrice !== undefined) {
    // Saved before rules were set per category: each category gets a copy of the plan's.
    return withoutHardCap(withOwnRules({ ...draft, finance: { ...finance, otherIncome: finance.otherIncome ?? [] } as FinanceDraft }));
  }
  const price = costPerShuttle ?? null;
  return withoutHardCap(
    withOwnRules({
      ...draft,
      finance: {
        ...finance,
        shuttlePriceBasis: price === null ? null : "shuttle",
        shuttlePrice: price,
        shuttlesPerTube: null,
        otherIncome: finance.otherIncome ?? [],
      },
    }),
  );
}

/**
 * Saved when deuce could be a "hard cap": that was win by two with the cap
 * as its maximum, under another name. It opens as win by two with that
 * maximum, so nothing about how its games are scored or timed changes.
 */
function withoutHardCap(draft: PlanDraft): PlanDraft {
  const fix = <T extends Record<string, { deuce: string | null }>>(rules: T): T =>
    Object.fromEntries(Object.entries(rules).map(([stage, r]) => [stage, r.deuce === "cap" ? { ...r, deuce: "standard" } : r])) as T;
  return {
    ...draft,
    stageRules: fix(draft.stageRules),
    categories: draft.categories.map((c) => (c.stageRules ? { ...c, stageRules: fix(c.stageRules) } : c)),
  };
}

/** Storage as the store uses it; tests pass a fake. */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A saved tournament as the list shows it. */
export interface TournamentMeta {
  id: string;
  name: string;
  /** The tournament's date ("YYYY-MM-DD"), or "" before one is set. */
  date: string;
  /** When it was last changed, in milliseconds since the epoch. */
  updatedAt: number;
}

export interface TournamentIndex {
  currentId: string | null;
  items: TournamentMeta[];
}

const INDEX_KEY = "badminton:tournaments:v1";
const tournamentKey = (id: string) => `badminton:tournament:v1:${id}`;

function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function write(store: Store | null, key: string, value: unknown): boolean {
  try {
    store?.setItem(key, JSON.stringify(value));
    return store !== null;
  } catch {
    // Not saved; the editor keeps working.
    return false;
  }
}

/** The single draft kept before saved tournaments, if there is one. */
function loadLegacyDraft(store: Store): PlanDraft | null {
  try {
    const raw = store.getItem(KEY);
    if (raw) return normaliseDraft(JSON.parse(raw));
    const v4 = store.getItem(V4_KEY);
    if (v4) return normaliseDraft(migrateV4(JSON.parse(v4)));
    const v3 = store.getItem(V3_KEY);
    return v3 ? normaliseDraft(migrateV4(migrateV3(JSON.parse(v3)))) : null;
  } catch {
    return null;
  }
}

function metaOf(id: string, draft: PlanDraft, updatedAt: number): TournamentMeta {
  return { id, name: draft.name, date: draft.frame.date, updatedAt };
}

/**
 * The saved tournaments. The first time, the single draft kept before saved
 * tournaments becomes the first one; its old keys go once it is safely saved.
 */
export function loadIndex(store: Store | null = browserStore(), now = Date.now()): TournamentIndex {
  if (!store) return { currentId: null, items: [] };
  try {
    const raw = store.getItem(INDEX_KEY);
    if (raw) {
      const index = JSON.parse(raw) as TournamentIndex;
      if (Array.isArray(index.items)) return { currentId: index.currentId ?? null, items: index.items };
    }
  } catch {
    // Unreadable: start again from any earlier draft.
  }
  const legacy = loadLegacyDraft(store);
  if (!legacy) return { currentId: null, items: [] };
  const id = newId();
  const index = { currentId: id, items: [metaOf(id, legacy, now)] };
  if (write(store, tournamentKey(id), legacy) && write(store, INDEX_KEY, index)) {
    try {
      store.removeItem(KEY);
      store.removeItem(V4_KEY);
      store.removeItem(V3_KEY);
    } catch {
      // Left behind; never read again once the index exists.
    }
  }
  return index;
}

export function loadTournament(id: string, store: Store | null = browserStore()): PlanDraft | null {
  try {
    const raw = store?.getItem(tournamentKey(id));
    return raw ? normaliseDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Saves a tournament and brings its name, date and last-changed time up to date in the list. */
export function saveTournament(
  index: TournamentIndex,
  id: string,
  draft: PlanDraft,
  store: Store | null = browserStore(),
  now = Date.now(),
): TournamentIndex {
  write(store, tournamentKey(id), draft);
  const meta = metaOf(id, draft, now);
  const items = index.items.some((t) => t.id === id)
    ? index.items.map((t) => (t.id === id ? meta : t))
    : [...index.items, meta];
  const next = { ...index, items };
  write(store, INDEX_KEY, next);
  return next;
}

/** Saves a new tournament and makes it the current one. */
export function createTournament(
  index: TournamentIndex,
  draft: PlanDraft,
  store: Store | null = browserStore(),
  now = Date.now(),
): { id: string; index: TournamentIndex } {
  const id = newId();
  return { id, index: setCurrent(saveTournament(index, id, draft, store, now), id, store) };
}

export function setCurrent(index: TournamentIndex, id: string, store: Store | null = browserStore()): TournamentIndex {
  const next = { ...index, currentId: id };
  write(store, INDEX_KEY, next);
  return next;
}

/** Deletes a tournament. If it was the current one, the first left in the list becomes current. */
export function deleteTournament(
  index: TournamentIndex,
  id: string,
  store: Store | null = browserStore(),
): TournamentIndex {
  try {
    store?.removeItem(tournamentKey(id));
  } catch {
    // Its entry leaves the list anyway.
  }
  const items = index.items.filter((t) => t.id !== id);
  const currentId = index.currentId === id ? (sortTournaments(items)[0]?.id ?? null) : index.currentId;
  const next = { currentId, items };
  write(store, INDEX_KEY, next);
  return next;
}

/** What marks a file as a tournament saved from this app. */
const FILE_KIND = "badminton-tournament";

/** A tournament as a file: the whole of it as saved (plan, entries, draw, and its Live results if it has them). */
export function exportTournament(draft: PlanDraft): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, tournament: draft }, null, 2);
}

/** The file's name: the tournament's name, without what a file name can't hold. */
export function exportFileName(name: string): string {
  const clean = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean || "Untitled tournament"}.tournament.json`;
}

/**
 * Reads a tournament file. It goes through the same checks as a tournament
 * loaded from this device, so a file from an older build still opens. Null
 * when the file isn't a tournament.
 */
export function readTournamentFile(text: string): PlanDraft | null {
  try {
    const file = JSON.parse(text) as { kind?: unknown; tournament?: unknown } | null;
    if (!file || typeof file !== "object" || file.kind !== FILE_KIND) return null;
    const saved = file.tournament as Partial<PlanDraft> | null;
    if (!saved || typeof saved !== "object" || typeof saved.name !== "string" || !Array.isArray(saved.categories)) return null;
    if (!saved.frame || typeof saved.frame !== "object" || !Array.isArray(saved.frame.halls)) return null;
    // A tournament from a file is a new one here: it is not shared with players until it is switched on again.
    return { ...normaliseDraft(saved as Parameters<typeof normaliseDraft>[0]), publicLink: null };
  } catch {
    return null;
  }
}

/** Newest first: tournaments without a date yet (the ones being set up), then by date, latest first. */
export function sortTournaments(items: TournamentMeta[]): TournamentMeta[] {
  return [...items].sort((a, b) => {
    if (!a.date !== !b.date) return a.date ? 1 : -1;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });
}
