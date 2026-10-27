import type { GroupLoad } from "./distribution";

/** A group's key across the tournament: "categoryId:groupIndex". */
export function groupKey(categoryId: string, groupIndex: number): string {
  return `${categoryId}:${groupIndex}`;
}

/**
 * Shares one hall's courts between the groups playing there, so each group
 * keeps its own courts through the group stage.
 * - With at least as many courts as groups, every group gets one, and each
 *   spare court goes to the group with the most court time per court so far.
 *   Courts are handed out in court order, so a group's courts sit together.
 * - With more groups than courts, each group (largest first) goes onto the
 *   court carrying the least so far, and groups on a court take turns.
 * Returns each group's courts, in court order.
 */
export function assignGroupCourts(groups: GroupLoad[], courtIds: string[]): Map<string, string[]> {
  const keys = groups.map((g) => groupKey(g.categoryId, g.groupIndex));
  const load = new Map(groups.map((g) => [groupKey(g.categoryId, g.groupIndex), g.courtMinutes]));
  const result = new Map<string, string[]>(keys.map((k) => [k, []]));
  if (courtIds.length === 0 || keys.length === 0) return result;

  if (courtIds.length >= keys.length) {
    const counts = new Map(keys.map((k) => [k, 1]));
    for (let spare = courtIds.length - keys.length; spare > 0; spare--) {
      let best = keys[0]!;
      for (const k of keys) if (load.get(k)! / counts.get(k)! > load.get(best)! / counts.get(best)!) best = k;
      counts.set(best, counts.get(best)! + 1);
    }
    let next = 0;
    for (const k of keys) for (let n = 0; n < counts.get(k)!; n++) result.get(k)!.push(courtIds[next++]!);
    return result;
  }
  const carrying = new Map(courtIds.map((c) => [c, 0]));
  for (const k of [...keys].sort((a, b) => load.get(b)! - load.get(a)! || keys.indexOf(a) - keys.indexOf(b))) {
    let best = courtIds[0]!;
    for (const c of courtIds) if (carrying.get(c)! < carrying.get(best)!) best = c;
    carrying.set(best, carrying.get(best)! + load.get(k)!);
    result.get(k)!.push(best);
  }
  return result;
}

export interface HallCourts {
  hallId: string;
  courtIds: string[];
}

/** A group with no court of its own, and the court it shares meanwhile. */
export interface HomelessGroup {
  key: string;
  courtId: string;
}

/**
 * Every group's courts for the group stage, across the venue.
 * 1. Each hall's courts are shared between the groups placed in it
 *    (assignGroupCourts).
 * 2. Courts the organiser set by hand then change hands, in any hall: a court
 *    given to a group plays that group only (the group keeps its other
 *    courts), and a court set to no group plays none. Pins to unknown courts
 *    or groups are ignored.
 * 3. A group left with no court shares the court carrying the least in its
 *    hall (one not set by hand if there is one), and is reported, so no match
 *    is lost while the organiser chooses a court for it.
 * `pins` maps a court to a group key, or to "" for no group.
 */
export function resolveGroupCourts(
  halls: HallCourts[],
  groups: (GroupLoad & { hallId: string })[],
  pins: Map<string, string> = new Map(),
): { courtsOf: Map<string, string[]>; homeless: HomelessGroup[] } {
  const order = halls.flatMap((h) => h.courtIds);
  const courtsOf = new Map<string, string[]>();
  for (const hall of halls) {
    const here = groups.filter((g) => g.hallId === hall.hallId);
    for (const [key, courts] of assignGroupCourts(here, hall.courtIds)) courtsOf.set(key, courts);
  }
  for (const [court, key] of pins) {
    if (!order.includes(court) || (key !== "" && !courtsOf.has(key))) continue;
    for (const [k, courts] of courtsOf) courtsOf.set(k, courts.filter((c) => c !== court));
    if (key !== "") courtsOf.get(key)!.push(court);
  }

  const load = new Map(groups.map((g) => [groupKey(g.categoryId, g.groupIndex), g.courtMinutes]));
  const carrying = (court: string) =>
    [...courtsOf].reduce((sum, [k, courts]) => (courts.includes(court) ? sum + load.get(k)! / courts.length : sum), 0);
  const homeless: HomelessGroup[] = [];
  for (const g of groups) {
    const key = groupKey(g.categoryId, g.groupIndex);
    if (courtsOf.get(key)!.length > 0) continue;
    const hallCourts = halls.find((h) => h.hallId === g.hallId)?.courtIds ?? [];
    const candidates = [
      hallCourts.filter((c) => !pins.has(c)),
      hallCourts.filter((c) => pins.get(c)),
      hallCourts,
    ].find((list) => list.length > 0);
    if (!candidates) continue;
    let best = candidates[0]!;
    for (const c of candidates) if (carrying(c) < carrying(best)) best = c;
    courtsOf.get(key)!.push(best);
    homeless.push({ key, courtId: best });
  }
  for (const [k, courts] of courtsOf) courtsOf.set(k, courts.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  return { courtsOf, homeless };
}
