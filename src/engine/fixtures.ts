// Who plays whom, before entries exist: draw slots stand in for names.
// Group slots are a group letter and position ("A1"); knockout sides come
// from group places ("Winner A", "Runner-up B") or earlier matches
// ("Winner QF1").

/** Group letters: A, B, C… */
export function groupLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `G${index + 1}`;
}

/**
 * A round-robin by the circle method: rounds of pairings between slots
 * 1…size. Every pair meets once and a slot plays at most once a round; an
 * odd group has one slot resting each round. The rounds are the waves.
 */
export function groupFixtures(size: number): [number, number][][] {
  if (size < 2) return [];
  const slots = Array.from({ length: size }, (_, i) => i + 1);
  if (size % 2 === 1) slots.push(0); // 0 is the bye
  const m = slots.length;
  const rounds: [number, number][][] = [];
  let order = slots;
  for (let r = 0; r < m - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = order[i]!;
      const b = order[m - 1 - i]!;
      if (a !== 0 && b !== 0) round.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(round);
    // Keep the first slot fixed and rotate the rest one place.
    order = [order[0]!, order[m - 1]!, ...order.slice(1, m - 1)];
  }
  return rounds;
}

export interface KnockoutMatch {
  /** "QF1", "SF2", "R16-3", "Final", "Bronze". */
  code: string;
  /** Number within its round, from 1. */
  number: number;
  home: string;
  away: string;
}

export interface KnockoutRoundFixtures {
  /** Places in the round: 8 for the quarter-finals, 2 for the final. */
  size: number;
  matches: KnockoutMatch[];
}

export interface Bracket {
  /** First round to the final; rounds where every side has a bye are left out. */
  rounds: KnockoutRoundFixtures[];
  bronze: KnockoutMatch | null;
}

const PLACES = ["Winner", "Runner-up"];

function placeName(place: number): string {
  if (place <= PLACES.length) return PLACES[place - 1]!;
  const suffix = place % 10 === 3 && place % 100 !== 13 ? "rd" : "th";
  return `${place}${suffix}`;
}

/** Bracket positions for seeds: 1 v n, then halves kept apart, e.g. 8 → 1,8,4,5,2,7,3,6. */
export function seedPositions(bracket: number): number[] {
  let order = [1];
  while (order.length < bracket) {
    const size = order.length * 2;
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

function roundCode(size: number, number: number): string {
  if (size === 2) return "Final";
  if (size === 4) return `SF${number}`;
  if (size === 8) return `QF${number}`;
  return `R${size}-${number}`;
}

/**
 * A single-elimination bracket. Seeds run through group places: every
 * group's winner (A, B, C…), then every runner-up, and so on; knockout only
 * uses "Seed 1…n". Top seeds take the byes. With two qualifiers per group,
 * the 1 v n pattern keeps a group's winner and runner-up apart in the first
 * round. The bronze match is between the semi-final losers.
 */
export function knockoutBracket(qualifiers: number, groupCount: number, bronze: boolean): Bracket {
  if (qualifiers < 2) return { rounds: [], bronze: null };
  const perGroup = groupCount > 0 ? Math.ceil(qualifiers / groupCount) : 0;
  const seeds: string[] = [];
  if (groupCount > 0) {
    for (let place = 1; place <= perGroup; place++) {
      for (let g = 0; g < groupCount && seeds.length < qualifiers; g++) {
        seeds.push(`${placeName(place)} ${groupLetter(g)}`);
      }
    }
  } else {
    for (let i = 1; i <= qualifiers; i++) seeds.push(`Seed ${i}`);
  }

  let bracket = 1;
  while (bracket < qualifiers) bracket *= 2;
  let sides: (string | null)[] = seedPositions(bracket).map((seed) => seeds[seed - 1] ?? null);
  const rounds: KnockoutRoundFixtures[] = [];
  for (let size = bracket; size >= 2; size /= 2) {
    const matches: KnockoutMatch[] = [];
    const next: (string | null)[] = [];
    for (let i = 0; i < sides.length; i += 2) {
      const home = sides[i]!;
      const away = sides[i + 1]!;
      if (home === null || away === null) {
        next.push(home ?? away);
        continue;
      }
      const number = matches.length + 1;
      const code = roundCode(size, number);
      matches.push({ code, number, home, away });
      next.push(`Winner ${code}`);
    }
    if (matches.length > 0) rounds.push({ size, matches });
    sides = next;
  }

  const semis = rounds.find((r) => r.size === 4);
  const third =
    bronze && semis && semis.matches.length === 2
      ? { code: "Bronze", number: 1, home: `Loser ${semis.matches[0]!.code}`, away: `Loser ${semis.matches[1]!.code}` }
      : null;
  return { rounds, bronze: third };
}
