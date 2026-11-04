import { emptyDummyMarks, removeCategory, type DummyMarks, type PlanDraft } from "../draft";

// Dummy data is recorded by comparing the draft before and after a fill: each
// field that changed is a dummy value, each thing added a dummy item. Removing
// it takes back only what still matches; anything changed since is the
// organiser's and stays.

/** A step into the draft: a key, or the item of a list with this id. */
type Segment = string | { id: string };
type Path = Segment[];

const keyOf = (path: Path) => JSON.stringify(path);
const pathOf = (key: string) => JSON.parse(key) as Path;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A list of things with ids (courts, entries…), as opposed to a list of values. */
function isIdList(value: unknown): value is { id: string }[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => isPlainObject(v) && typeof v.id === "string");
}

/** A thing as compared for "has it been changed": check-in on the day isn't a change. */
function snapshot(value: unknown): string {
  return JSON.stringify(value, (key, v) => (key === "attendance" ? undefined : v));
}

const same = (a: unknown, b: unknown) => snapshot(a) === snapshot(b);

function step(container: unknown, segment: Segment): unknown {
  if (typeof segment === "string") return isPlainObject(container) ? container[segment] : undefined;
  return Array.isArray(container) ? container.find((v) => isPlainObject(v) && v.id === segment.id) : undefined;
}

function resolve(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((at, segment) => (at === undefined ? undefined : step(at, segment)), root);
}

/** Sets a value in place; false when the path no longer leads anywhere. */
function assign(root: unknown, path: Path, value: unknown): boolean {
  const parent = resolve(root, path.slice(0, -1));
  const last = path.at(-1)!;
  if (typeof last !== "string" || !isPlainObject(parent) || !(last in parent)) return false;
  parent[last] = value;
  return true;
}

/** Removes an item or a record's key in place. */
function remove(root: unknown, path: Path): void {
  const parent = resolve(root, path.slice(0, -1));
  const last = path.at(-1)!;
  if (typeof last === "string") {
    if (isPlainObject(parent)) delete parent[last];
    return;
  }
  if (Array.isArray(parent)) {
    const i = parent.findIndex((v) => isPlainObject(v) && v.id === last.id);
    if (i !== -1) parent.splice(i, 1);
  }
}

function diff(before: unknown, after: unknown, path: Path, marks: DummyMarks): void {
  if (isIdList(after) || (Array.isArray(after) && Array.isArray(before) && isIdList(before))) {
    const list = Array.isArray(before) ? before : [];
    for (const item of after as { id: string }[]) {
      const was = list.find((v) => isPlainObject(v) && v.id === item.id);
      if (was === undefined) marks.items[keyOf([...path, { id: item.id }])] = snapshot(item);
      else diff(was, item, [...path, { id: item.id }], marks);
    }
    return;
  }
  if (isPlainObject(after)) {
    const from = isPlainObject(before) ? before : {};
    for (const [key, value] of Object.entries(after)) {
      if (path.length === 0 && key === "dummy") continue;
      if (!(key in from)) marks.items[keyOf([...path, key])] = snapshot(value);
      else diff(from[key], value, [...path, key], marks);
    }
    return;
  }
  if (!same(before, after)) marks.values[keyOf(path)] = { was: before, value: after };
}

/**
 * Records what a fill changed as dummy data, on top of what was already
 * dummy. A field filled again keeps what it held before the first fill.
 */
export function markDummy(before: PlanDraft, after: PlanDraft): PlanDraft {
  const found = emptyDummyMarks();
  diff(before, after, [], found);
  const values = { ...before.dummy.values };
  for (const [key, mark] of Object.entries(found.values)) {
    values[key] = { was: values[key]?.was ?? mark.was, value: mark.value };
  }
  return { ...after, dummy: { values, items: { ...before.dummy.items, ...found.items } } };
}

/** The marks that still match the draft: dummy data not since changed by the organiser. */
export function liveMarks(draft: PlanDraft): DummyMarks {
  const values = Object.fromEntries(
    Object.entries(draft.dummy.values).filter(([key, mark]) => {
      const now = resolve(draft, pathOf(key));
      return now !== undefined && same(now, mark.value);
    }),
  );
  const items = Object.fromEntries(
    Object.entries(draft.dummy.items).filter(([key, shot]) => {
      const now = resolve(draft, pathOf(key));
      return now !== undefined && snapshot(now) === shot;
    }),
  );
  return { values, items };
}

export function hasDummy(draft: PlanDraft): boolean {
  const live = liveMarks(draft);
  return Object.keys(live.values).length + Object.keys(live.items).length > 0;
}

/** What dummy data there is, for the Remove button: "16 entries, 2 draws, 30 other values". */
export function dummySummary(draft: PlanDraft): string {
  const live = liveMarks(draft);
  let entries = 0;
  let draws = 0;
  let checkIns = 0;
  let other = 0;
  for (const key of Object.keys(live.values)) {
    if (pathOf(key).at(-1) === "attendance") checkIns++;
    else other++;
  }
  for (const key of Object.keys(live.items)) {
    const path = pathOf(key);
    if (path.length === 2 && path[0] === "entries") entries++;
    else if (path.length === 2 && path[0] === "draw") draws++;
    else other++;
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    entries > 0 ? plural(entries, "entry", "entries") : null,
    draws > 0 ? plural(draws, "draw", "draws") : null,
    checkIns > 0 ? plural(checkIns, "check-in", "check-ins") : null,
    other > 0 ? plural(other, "other value", "other values") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Takes the dummy data out: dummy values go back to what they were, dummy
 * things are removed, and draws that held a removed entry are cleared (which
 * unlocks them). Anything changed since it was filled is kept, as the
 * organiser's; so is a dummy category that has the organiser's own entries.
 */
export function removeDummy(draft: PlanDraft): PlanDraft {
  const live = liveMarks(draft);
  const next = structuredClone(draft);

  const items = Object.keys(live.items).map(pathOf);
  // Entries first, so a dummy category with entries of the organiser's own can be seen to have them.
  const isCategory = (p: Path) => p.length === 2 && p[0] === "categories";
  for (const path of items.filter((p) => !isCategory(p))) remove(next, path);
  for (const path of items.filter(isCategory)) {
    const id = (path[1] as { id: string }).id;
    if (!next.entries.some((e) => e.categoryId === id)) removeCategory(next, id);
  }
  for (const [key, mark] of Object.entries(live.values)) assign(next, pathOf(key), mark.was);

  // Tidy what pointed at removed things.
  const entryIds = new Set(next.entries.map((e) => e.id));
  const categoryIds = new Set(next.categories.map((c) => c.id));
  for (const [id, d] of Object.entries(next.draw)) {
    if (!categoryIds.has(id) || d.groups.some((g) => g.some((e) => !entryIds.has(e)))) delete next.draw[id];
  }
  const courtIds = new Set(next.frame.halls.flatMap((h) => h.courts.map((c) => c.id)));
  const hallIds = new Set(next.frame.halls.map((h) => h.id));
  for (const id of Object.keys(next.courtGroups)) if (!courtIds.has(id)) delete next.courtGroups[id];
  for (const [id, move] of Object.entries(next.matchMoves)) if (!courtIds.has(move.courtId)) delete next.matchMoves[id];
  for (const [key, move] of Object.entries(next.zoneMoves)) {
    if (!hallIds.has(key.split(":")[0]!) || (move.hallId !== null && !hallIds.has(move.hallId))) delete next.zoneMoves[key];
  }
  for (const entry of next.entries) {
    const players = new Set(entry.players.map((p) => p.id));
    for (const [rubber, ids] of Object.entries(entry.lineUp)) entry.lineUp[rubber] = ids.filter((id) => players.has(id));
  }
  // With no entries left, the plan uses the expected numbers again.
  if (next.entries.length === 0 && next.stage === "draw") next.stage = "plan";

  next.dummy = emptyDummyMarks();
  return next;
}
