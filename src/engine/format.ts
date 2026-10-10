import type { Category, FormatType, GroupMode, StageCounts } from "./types";

export type FormatError =
  | { code: "tooFewEntries"; minimum: number }
  | { code: "missingGroups" }
  | { code: "invalidGroupCount"; maximum: number }
  | { code: "invalidQualifiers"; maximum: number };

/**
 * The structure of one category. Fixtures are contests between two entries:
 * a match for individual entries, a tie of several rubbers for teams.
 */
export interface CategoryFormat {
  /** Empty for knockout only. */
  groupSizes: number[];
  /** Entries in the knockout: qualifiers, or every entry for knockout only. */
  qualifiers: number;
  fixtures: StageCounts;
  totalFixtures: number;
}

export type FormatResult =
  | { ok: true; format: CategoryFormat }
  | { ok: false; errors: FormatError[] };

/** A group of n entries plays everyone once: n(n−1)/2 fixtures. */
export function groupMatchCount(size: number): number {
  return (size * (size - 1)) / 2;
}

/** Split `total` into `parts` sizes that differ by at most one, largest first. */
export function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Group sizes for a category. In auto mode the group count is the nearest to
 * the preferred size that still leaves every group with at least two pairs.
 */
export function proposeGroupSizes(pairs: number, mode: GroupMode): number[] {
  if (mode.type === "fixed") {
    return mode.groupCount >= 1 ? splitEvenly(pairs, mode.groupCount) : [];
  }
  const maxGroups = Math.max(1, Math.floor(pairs / 2));
  const count = Math.min(
    maxGroups,
    Math.max(1, Math.round(pairs / mode.preferredSize)),
  );
  return splitEvenly(pairs, count);
}

/**
 * Single-elimination matches for a number of qualifiers. Byes fill the
 * bracket, so qualifiers − 1 matches are played. A bronze match needs two
 * semifinal losers, so at least four qualifiers.
 */
export function knockoutMatchCounts(
  qualifiers: number,
  bronze: boolean,
): Omit<StageCounts, "group"> {
  if (qualifiers < 2) return { knockout: 0, bronze: 0, final: 0 };
  return {
    knockout: qualifiers - 2,
    bronze: bronze && qualifiers >= 4 ? 1 : 0,
    final: 1,
  };
}

function total(counts: StageCounts): number {
  return counts.group + counts.knockout + counts.bronze + counts.final;
}

/** The parts of a category its structure depends on. */
export type FormatInputs = Pick<Category, "expectedEntries" | "groups" | "qualifiersPerGroup" | "bronze">;

export function categoryFormat(category: FormatInputs, format: FormatType): FormatResult {
  const entries = category.expectedEntries;
  if (entries < 2) {
    return { ok: false, errors: [{ code: "tooFewEntries", minimum: 2 }] };
  }

  if (format === "knockout") {
    const fixtures: StageCounts = { group: 0, ...knockoutMatchCounts(entries, category.bronze) };
    return {
      ok: true,
      format: { groupSizes: [], qualifiers: entries, fixtures, totalFixtures: total(fixtures) },
    };
  }

  if (!category.groups) return { ok: false, errors: [{ code: "missingGroups" }] };

  const errors: FormatError[] = [];
  const groupSizes = proposeGroupSizes(entries, category.groups);
  if (groupSizes.length === 0 || groupSizes.some((size) => size < 2)) {
    errors.push({ code: "invalidGroupCount", maximum: Math.floor(entries / 2) });
  }

  const smallest = Math.min(...groupSizes);
  const perGroup = category.qualifiersPerGroup ?? 0;
  if (format === "groupsKnockout" && (perGroup < 1 || perGroup > smallest)) {
    errors.push({
      code: "invalidQualifiers",
      maximum: Number.isFinite(smallest) ? smallest : 0,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const group = groupSizes.reduce((sum, size) => sum + groupMatchCount(size), 0);
  if (format === "groups") {
    const fixtures: StageCounts = { group, knockout: 0, bronze: 0, final: 0 };
    return { ok: true, format: { groupSizes, qualifiers: 0, fixtures, totalFixtures: group } };
  }

  const qualifiers = groupSizes.length * perGroup;
  const fixtures: StageCounts = { group, ...knockoutMatchCounts(qualifiers, category.bronze) };
  return {
    ok: true,
    format: { groupSizes, qualifiers, fixtures, totalFixtures: total(fixtures) },
  };
}
