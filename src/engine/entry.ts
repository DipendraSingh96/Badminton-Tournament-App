import { playersPerEntry, type Category } from "./types";

/**
 * Matches played each time two entries meet: one for individual entries, or
 * every rubber in the line-up for a team tie (all rubbers are played).
 */
export function rubbersPerFixture(category: Category): number {
  const { entry } = category;
  if (entry.type === "individual") return 1;
  return entry.lineUp.reduce((sum, item) => sum + item.count, 0);
}

/** Players making up one entry: 1 (singles), 2 (doubles) or a team's squad. */
export function playersPerCategoryEntry(category: Category): number {
  const { entry } = category;
  return entry.type === "individual" ? playersPerEntry(entry.event) : entry.playersPerTeam;
}
