import { playersPerEntry, type Category, type LineUpItem } from "./types";

/**
 * The matches played each time two entries meet, by event: one match of the
 * category's event for individual entries, or the whole line-up for a team
 * tie (all rubbers are played).
 */
export function eventsPerFixture(category: Category): LineUpItem[] {
  const { entry } = category;
  return entry.type === "individual" ? [{ event: entry.event, count: 1 }] : entry.lineUp;
}

/** Matches per fixture: 1, or the rubbers in a team tie. */
export function rubbersPerFixture(category: Category): number {
  return eventsPerFixture(category).reduce((sum, item) => sum + item.count, 0);
}

/**
 * Players making up one entry: 1 (singles) or 2 (doubles); for a team, the
 * players its line-up needs, since each player plays one rubber only.
 */
export function playersPerCategoryEntry(category: Category): number {
  return eventsPerFixture(category).reduce(
    (sum, item) => sum + item.count * playersPerEntry(item.event),
    0,
  );
}
