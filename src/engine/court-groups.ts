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
 * - A court the organiser gave to a group (a pin) then changes hands: it plays
 *   that group only, and the other courts keep their split. A group left with
 *   no court shares the court carrying the least. Pins to courts or groups not
 *   in this hall are ignored.
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
  if (courtIds.length === 0 || keys.length === 0) return result;

  // How much a court carries: each of its groups' court time, shared over that group's courts.
  const carrying = (court: string) =>
    keys.reduce((sum, k) => {
      const courts = result.get(k)!;
      return courts.includes(court) ? sum + load.get(k)! / courts.length : sum;
    }, 0);
  const leastCarrying = () => {
    let best = courtIds[0]!;
    for (const c of courtIds) if (carrying(c) < carrying(best)) best = c;
    return best;
  };

  if (courtIds.length >= keys.length) {
    const counts = new Map(keys.map((k) => [k, 1]));
    for (let spare = courtIds.length - keys.length; spare > 0; spare--) {
      let best = keys[0]!;
      for (const k of keys) if (load.get(k)! / counts.get(k)! > load.get(best)! / counts.get(best)!) best = k;
      counts.set(best, counts.get(best)! + 1);
    }
    let next = 0;
    for (const k of keys) for (let n = 0; n < counts.get(k)!; n++) result.get(k)!.push(courtIds[next++]!);
  } else {
    for (const k of [...keys].sort((a, b) => load.get(b)! - load.get(a)! || keys.indexOf(a) - keys.indexOf(b))) {
      result.get(k)!.push(leastCarrying());
    }
  }

  // Pins: the court plays its pinned group only.
  for (const court of courtIds) {
    const pinned = pins.get(court);
    if (!pinned || !result.has(pinned)) continue;
    for (const k of keys) result.set(k, result.get(k)!.filter((c) => c !== court));
    result.get(pinned)!.push(court);
  }
  for (const k of keys) {
    if (result.get(k)!.length === 0) result.get(k)!.push(leastCarrying());
    result.get(k)!.sort((a, b) => courtIds.indexOf(a) - courtIds.indexOf(b));
  }
  return result;
}
