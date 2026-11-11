// Dummy values: the one place in application code with tournament values of
// its own. They are used only when the organiser asks to fill a page with
// dummy data, and are always marked as dummy so they can be removed again
// (see CLAUDE.md). Plans and calculations never read them.

import type { EventType, TiebreakCriterion, WalkoverRule, WithdrawalRule } from "@/engine";
import type { StageRulesDraft } from "../draft";

export const DUMMY_TOURNAMENT_NAME = "Sample tournament";

/** The venue, when it hasn't been touched. */
export const DUMMY_HALL = { from: "09:00", to: "18:00", unitMinutes: 60, rate: 10, courts: 6, umpires: 1 };
export const DUMMY_BUFFER_MINUTES = 30;

/** Categories, when there are none. */
export const DUMMY_INDIVIDUAL_EVENTS: EventType[] = ["MD", "XD"];
export const DUMMY_TEAM_LINE_UP: Partial<Record<EventType, number>> = { OPEN: 2 };

export const DUMMY_CATEGORY = {
  expectedEntries: 16,
  preferredGroupSize: 4,
  groupCount: 4,
  qualifiersPerGroup: 2,
  feeAmount: 15,
  externalFeeAmount: 20,
  expectedExternal: 2,
};

export const DUMMY_STAGE_RULES: Omit<StageRulesDraft, "bestOf"> = {
  pointsPerGame: 21,
  deuce: "standard",
  deuceLimit: 30,
  minutesPerGame: 12,
  changeoverMinutes: 3,
};
export const DUMMY_BEST_OF_THREE_ALLOWANCE = 33;

export const DUMMY_FINANCE = { shuttlesPerGame: 1, tubePrice: 24, shuttlesPerTube: 12, winnersPrize: 50 };

export const DUMMY_RULES: { tiebreaks: TiebreakCriterion[]; withdrawal: WithdrawalRule; walkover: WalkoverRule } = {
  tiebreaks: ["matchesWon", "pointDifference", "headToHead", "drawOfLots"],
  withdrawal: "byesThenWalkovers",
  walkover: "straightGamesAtTarget",
};
export const DUMMY_HANDICAP = { mixedVsMens: 2, womensVsMens: 4, womensVsMixed: 2 };

export const DUMMY_TEAM_NAMES = [
  "Smashers",
  "Net Ninjas",
  "Shuttle Stars",
  "Drop Shots",
  "Feather Force",
  "Rally Kings",
  "Court Jesters",
  "Birdie Bunch",
  "Clear Winners",
  "Spin Doctors",
  "Lob Squad",
  "Kill Shot",
  "Hairpins",
  "Backcourt",
  "Flick Serve",
  "Tramliners",
];

export const DUMMY_FIRST_NAMES = [
  "Alex", "Priya", "Sam", "Hannah", "Arjun", "Chloe", "Tom", "Mei", "Ravi", "Grace",
  "Owen", "Aisha", "Jack", "Sofia", "Kiran", "Ellie", "Ben", "Nadia", "Luke", "Zara",
];
export const DUMMY_SURNAMES = [
  "Patel", "Smith", "Khan", "Jones", "Chen", "Taylor", "Singh", "Brown", "Williams", "Ahmed",
  "Evans", "Wilson", "Shah", "Davies", "Lee", "Hughes", "Gill", "Walker", "Roberts", "Kaur",
];

/** Share of players checked in by a dummy fill of check-in; a few more are absent. */
export const DUMMY_CHECK_IN = { arrived: 0.75, absent: 0.1 };

/**
 * The simulated day (Settings, Developer tools, Run simulation): how fast it
 * plays, and how its random day is drawn. Never read by a plan or a real result.
 */
export const SIMULATION = {
  /** Simulated minutes that pass in one second of watching. */
  minutesPerSecond: 5,
  /** The share of players not yet checked in who never turn up, and who turn up late. */
  absentShare: 0.04,
  lateShare: 0.12,
  /** Minutes before their first game that players check in: on time (from, to), and late (negative is after it was due). */
  arriveBefore: [50, 10],
  lateBefore: [3, -6],
  /** How long a game takes against its planned length: from early to late. */
  pace: [0.7, 1.35],
  /** The share of games that go past the points per game, where the rules allow it. */
  deuceShare: 0.15,
  /** The fewest points a game's loser is given, as a share of the points per game. */
  loserFloor: 0.35,
} as const;
