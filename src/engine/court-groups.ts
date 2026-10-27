import type { GroupLoad } from "./distribution";

/** A group's key across the tournament: "categoryId:groupIndex". */
export function groupKey(categoryId: string, groupIndex: number): string {
  return `${categoryId}:${groupIndex}`;
}

/**
 * Shares one hall's courts between the groups playing there, so each group
 * keeps its own courts through the group stage.
 * - A court the organiser gave to a group (a pin) is that group's only; a
 *   group with pins plays on its pinned courts alone. Pins to courts or groups
 *   not in this hall are ignored.
 * - With at least as many courts left as groups, every group gets one, and
 *   each spare court goes to the group with the most court time per court so
 *   far. Courts are handed out in court order, so a group's courts sit together.
 * - With more groups than courts, each group (largest first) goes onto the
 *   court carrying the least so far, and groups on a court take turns.
 * Returns each group's courts, in court order.
 */
export function assignGroupCourts(
  groups: GroupLoad[],
  courtIds: string[],
  pins: Map<string, string> = new Map(),
): Map<string, string[]> {
  const keys = groups.map((g) => groupKey(g.categoryId, g.groupIndex));
  const load = new Map(groups.map((g) => [groupKey(g.categoryId, g.groupIndex), g.courtMinutes]));
  const result = new Map<string, string[]>(keys.map((k) => [k, []]));

  const pinned = new Set<string>();
  for (const court of courtIds) {
    const key = pins.get(court);
    if (key && result.has(key)) {
      result.get(key)!.push(court);
      pinned.add(court);
    }
  }
  const free = courtIds.filter((c) => !pinned.has(c));
  const waiting = keys.filter((k) => result.get(k)!.length === 0);
  if (waiting.length === 0) return result;

  if (free.length >= waiting.length) {
    const counts = new Map(waiting.map((k) => [k, 1]));
    for (let spare = free.length - waiting.length; spare > 0; spare--) {
      let best = waiting[0]!;
      for (const k of waiting) if (load.get(k)! / counts.get(k)! > load.get(best)! / counts.get(best)!) best = k;
      counts.set(best, counts.get(best)! + 1);
    }
    let next = 0;
    for (const k of waiting) for (let n = 0; n < counts.get(k)!; n++) result.get(k)!.push(free[next++]!);
    return result;
  }

  // More groups than courts: share, least-carrying court first (or any court, when all are pinned).
  const pool = free.length > 0 ? free : courtIds;
  if (pool.length === 0) return result;
  const carrying = new Map(pool.map((c) => [c, 0]));
  for (const k of [...waiting].sort((a, b) => load.get(b)! - load.get(a)! || keys.indexOf(a) - keys.indexOf(b))) {
    let best = pool[0]!;
    for (const c of pool) if (carrying.get(c)! < carrying.get(best)!) best = c;
    carrying.set(best, carrying.get(best)! + load.get(k)!);
    result.get(k)!.push(best);
  }
  return result;
}
