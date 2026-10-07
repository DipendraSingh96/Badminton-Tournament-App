import type { Category, GroupMode, StageCounts } from "./types";

export type FormatError =
  | { code: "tooFewPairs"; minimum: number }
  | { code: "invalidGroupCount"; maximum: number }
  | { code: "invalidQualifiers"; maximum: number };

export interface CategoryFormat {
  groupSizes: number[];
  qualifiers: number;
  matches: StageCounts;
  totalMatches: number;
}

export type FormatResult =
  | { ok: true; format: CategoryFormat }
  | { ok: false; errors: FormatError[] };

/** A group of n pairs plays everyone once: n(n−1)/2 matches. */
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

export function categoryFormat(category: Category): FormatResult {
  const pairs = category.expectedPairs;
  if (pairs < 2) {
    return { ok: false, errors: [{ code: "tooFewPairs", minimum: 2 }] };
  }

  const errors: FormatError[] = [];
  const groupSizes = proposeGroupSizes(pairs, category.groups);
  if (groupSizes.length === 0 || groupSizes.some((size) => size < 2)) {
    errors.push({ code: "invalidGroupCount", maximum: Math.floor(pairs / 2) });
  }

  const smallest = Math.min(...groupSizes);
  if (
    category.qualifiersPerGroup < 1 ||
    category.qualifiersPerGroup > smallest
  ) {
    errors.push({
      code: "invalidQualifiers",
      maximum: Number.isFinite(smallest) ? smallest : 0,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const qualifiers = groupSizes.length * category.qualifiersPerGroup;
  const matches: StageCounts = {
    group: groupSizes.reduce((sum, size) => sum + groupMatchCount(size), 0),
    ...knockoutMatchCounts(qualifiers, category.bronze),
  };
  const totalMatches =
    matches.group + matches.knockout + matches.bronze + matches.final;

  return { ok: true, format: { groupSizes, qualifiers, matches, totalMatches } };
}
