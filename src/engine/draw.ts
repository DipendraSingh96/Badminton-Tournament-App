// The draw: which entry takes which place in which group. Seeds are spread
// across the groups first, the rest are placed at random. The randomness comes
// from a stored number, so the same inputs always give the same draw and a
// redraw is a new number.

export interface DrawEntry {
  id: string;
  /** 1 is the top seed; null is unseeded. */
  seed: number | null;
}

export type DrawResult =
  | { ok: true; groups: string[][] }
  | { ok: false; error: { type: "sizeMismatch"; entries: number; places: number } };

/** A small seeded random number generator (mulberry32): the same seed gives the same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Places every entry in a group of the given sizes.
 * - Seeds, in seed order, go snake-wise across the groups (A, B, C, D, then
 *   D, C, B, A), each at the top of its group, so the top seeds meet late.
 * - The rest are shuffled with `randomSeed` and fill the remaining places,
 *   group by group, in turn.
 * Group places are in order: index 0 is slot 1 ("A1").
 */
export function makeDraw(entries: DrawEntry[], groupSizes: number[], randomSeed: number): DrawResult {
  const places = groupSizes.reduce((sum, n) => sum + n, 0);
  if (places !== entries.length) {
    return { ok: false, error: { type: "sizeMismatch", entries: entries.length, places } };
  }
  const groups: string[][] = groupSizes.map(() => []);
  const count = groupSizes.length;

  const seeded = entries.filter((e) => e.seed !== null).sort((a, b) => a.seed! - b.seed!);
  let turn = 0;
  for (const entry of seeded) {
    // Snake order over the groups that still have room.
    let placed = false;
    for (let tries = 0; tries < count * 2 && !placed; tries++, turn++) {
      const round = Math.floor(turn / count);
      const step = turn % count;
      const g = round % 2 === 0 ? step : count - 1 - step;
      if (groups[g]!.length < groupSizes[g]!) {
        groups[g]!.push(entry.id);
        placed = true;
      }
    }
    if (!placed) groups.find((g, i) => g.length < groupSizes[i]!)!.push(entry.id);
  }

  const random = seededRandom(randomSeed);
  const rest = entries.filter((e) => e.seed === null).map((e) => e.id);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  let g = 0;
  for (const id of rest) {
    while (groups[g % count]!.length >= groupSizes[g % count]!) g++;
    groups[g % count]!.push(id);
    g++;
  }
  return { ok: true, groups };
}
