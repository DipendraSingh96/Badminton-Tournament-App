import type { CategoryFormat } from "./format";

// How much badminton an entry gets, by how far it goes: the trade-off between
// a good day for players and the size of the tournament. Counted in fixtures
// (a match, or a team's tie), from the format alone.

/** Where an entry's day can end. */
export type PlayedStep =
  /** The group stage. */
  | { type: "group" }
  /** A knockout round before the semi-finals, by its bracket size (16, 8…). */
  | { type: "round"; size: number }
  /** The semi-finals. With a bronze match nobody's day ends there, but it is still a step on the way. */
  | { type: "semi" }
  | { type: "final" }
  /** The final and the bronze match together: the semi-finalists all play one more. */
  | { type: "finalBronze" };

export interface PlayedSection {
  step: PlayedStep;
  /** Entries that play in this stage or round. */
  playing: number;
  /** Entries whose day ends here. Across every section they add up to the entries. */
  ending: number;
  /**
   * The section's share of the bar, in entries. It is `ending`, except at the
   * end with a bronze match: the last four all play on to the final or the
   * bronze match, so their share is split evenly between the semi-finals and
   * that. Across every section the shares add up to the entries.
   */
  share: number;
  /** Fixtures those entries have played by then: fewest and most (they differ with unequal groups, or byes). */
  matches: { min: number; max: number };
}

/**
 * The sections of a competition in play order: the group stage (those who go
 * out there), each knockout round (those who lose in it), and the end: the
 * semi-finals, then the final, or with a bronze match the final and the
 * bronze match together (the semi-final losers play on, level with the
 * finalists). A section with no share of the entries is left out.
 */
export function matchesPlayed(format: CategoryFormat): PlayedSection[] {
  const sections: PlayedSection[] = [];
  const add = (section: Omit<PlayedSection, "share"> & { share?: number }) => sections.push({ ...section, share: section.share ?? section.ending });
  const { groupSizes } = format;
  const hasKnockout = format.fixtures.final > 0;
  const qualifiers = hasKnockout ? format.qualifiers : 0;
  const inGroups = groupSizes.reduce((sum, n) => sum + n, 0);
  // What everyone has played before the knockout.
  const base = groupSizes.length > 0 ? { min: Math.min(...groupSizes) - 1, max: Math.max(...groupSizes) - 1 } : { min: 0, max: 0 };
  if (groupSizes.length > 0) {
    add({ step: { type: "group" }, playing: inGroups, ending: inGroups - qualifiers, matches: base });
  }
  if (qualifiers >= 2) {
    let bracket = 1;
    while (bracket < qualifiers) bracket *= 2;
    const byes = bracket - qualifiers;
    const bronze = format.fixtures.bronze > 0;
    // Knockout rounds played so far, the one in hand included.
    let round = 0;
    for (let size = bracket; size >= 4; size /= 2) {
      round += 1;
      const first = size === bracket;
      // The first round is played only by those without a bye.
      const playing = first ? 2 * (qualifiers - bracket / 2) : size;
      // Past the first round, an entry that had a bye has played one fewer.
      const matches = { min: base.min + round - (byes > 0 && !first ? 1 : 0), max: base.max + round };
      if (size === 4 && bronze) {
        // The semi-final losers play the bronze match: everyone left plays one more. The four share the end of the bar between the two steps.
        add({ step: { type: "semi" }, playing, ending: 0, share: playing / 2, matches });
        add({ step: { type: "finalBronze" }, playing: 4, ending: 4, share: 4 - playing / 2, matches: { min: matches.min + 1, max: matches.max + 1 } });
        return sections.filter((s) => s.share > 0);
      }
      add({ step: size === 4 ? { type: "semi" } : { type: "round", size }, playing, ending: playing / 2, matches });
    }
    round += 1;
    add({
      step: { type: "final" },
      playing: 2,
      ending: 2,
      matches: { min: base.min + round - (byes > 0 && round > 1 ? 1 : 0), max: base.max + round },
    });
  }
  return sections.filter((s) => s.share > 0);
}
