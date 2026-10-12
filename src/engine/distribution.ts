/** One group's court time in the group stage. */
export interface GroupLoad {
  categoryId: string;
  /** 0-based within its category. */
  groupIndex: number;
  courtMinutes: number;
}

export interface HallCapacity {
  hallId: string;
  /** Court time the hall has in the playing time. */
  courtMinutes: number;
}

export interface HallShare {
  hallId: string;
  /** The hall's share of the venue's court time, 0 to 1. */
  share: number;
  /** Court time the hall's share of the group stage would be. */
  target: number;
  groups: GroupLoad[];
  /** Court time of the groups placed in the hall. */
  load: number;
}

/**
 * Suggests which hall each group plays in, keeping every group in one hall
 * and sharing the group stage across halls in proportion to their court
 * time. Largest groups are placed first, each in the hall that is left least
 * loaded for its size, so the split is as close to proportional as whole
 * groups allow.
 * Halls with no court time get no groups.
 */
export function distributeGroups(groups: GroupLoad[], halls: HallCapacity[]): HallShare[] {
  const totalCapacity = halls.reduce((sum, h) => sum + h.courtMinutes, 0);
  const totalLoad = groups.reduce((sum, g) => sum + g.courtMinutes, 0);
  const shares: HallShare[] = halls.map((hall) => {
    const share = totalCapacity > 0 ? hall.courtMinutes / totalCapacity : 0;
    return { hallId: hall.hallId, share, target: share * totalLoad, groups: [], load: 0 };
  });
  const open = shares.filter((s) => s.share > 0);
  if (open.length === 0) return shares;

  const order = [...groups].sort((a, b) => b.courtMinutes - a.courtMinutes);
  for (const group of order) {
    // The hall left least loaded for its size once the group is added; ties go to the earlier hall.
    const after = (hall: HallShare) => (hall.load + group.courtMinutes) / hall.share;
    let best = open[0]!;
    for (const hall of open) if (after(hall) < after(best)) best = hall;
    best.groups.push(group);
    best.load += group.courtMinutes;
  }
  // List each hall's groups in category order, then group order.
  const categoryOrder = new Map<string, number>();
  for (const g of groups) if (!categoryOrder.has(g.categoryId)) categoryOrder.set(g.categoryId, categoryOrder.size);
  for (const hall of shares) {
    hall.groups.sort(
      (a, b) =>
        categoryOrder.get(a.categoryId)! - categoryOrder.get(b.categoryId)! || a.groupIndex - b.groupIndex,
    );
  }
  return shares;
}
