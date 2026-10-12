/**
 * Rounds in a round-robin group: in each round every entry plays at most
 * once. An even group plays size − 1 rounds; an odd group needs one more,
 * with one entry resting each round.
 */
export function groupRounds(size: number): number {
  if (size < 2) return 0;
  return size % 2 === 0 ? size - 1 : size;
}

export interface GroupStageWaves {
  /** A wave is one round of every group; the largest group sets the count. */
  waves: number;
  /** Fixtures in each wave, summed across groups. */
  fixturesPerWave: number[];
  /** The most fixtures in any one wave. */
  mostFixtures: number;
}

/**
 * Waves for a set of groups. Each group spreads its fixtures as evenly as
 * possible over its own rounds: floor(size / 2) a round, so a group that
 * runs out of rounds sits out the later waves.
 */
export function groupStageWaves(groupSizes: number[]): GroupStageWaves {
  const waves = Math.max(0, ...groupSizes.map(groupRounds));
  const fixturesPerWave = Array.from({ length: waves }, (_, wave) =>
    groupSizes.reduce((sum, size) => sum + (wave < groupRounds(size) ? Math.floor(size / 2) : 0), 0),
  );
  return { waves, fixturesPerWave, mostFixtures: Math.max(0, ...fixturesPerWave) };
}

/** Fixtures one entry plays in a group of this size. */
export function fixturesPerEntry(size: number): number {
  return size - 1;
}

