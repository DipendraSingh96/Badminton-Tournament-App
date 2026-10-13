// Inputs to the tournament engine. Every value is an organiser input; the
// engine supplies none of its own.

export type Stage = "group" | "knockout" | "bronze" | "final";

export const STAGES: readonly Stage[] = ["group", "knockout", "bronze", "final"];

export type StageCounts = Record<Stage, number>;

/** How a game ends when the score reaches points-per-game all. */
export type DeuceRule =
  | { type: "none" }
  | { type: "cap"; cap: number }
  | { type: "standard"; max: number };

/** Scoring for a stage; applies to every event played in it. */
export interface StageRules {
  pointsPerGame: number;
  deuce: DeuceRule;
  bestOf: 1 | 3;
}

/** Timing for a stage; applies to every event played in it. */
export interface Timing {
  /** Typical playing time for one game. */
  minutesPerGame: number;
  /** Organising time per match: walk-on, warm-up, changeover. */
  changeoverMinutes: number;
}

/** A stretch of a hall's day charged at one rate (e.g. peak, off-peak). */
export interface RateBand {
  name: string;
  /** UTC ISO timestamps. */
  from: string;
  to: string;
  /** Hire charged per court per unit of the hall's unit time within the band. */
  ratePerUnit: number;
}

export interface Court {
  id: string;
  /** Booked availability, UTC ISO; within its hall's hours. */
  from: string;
  to: string;
  umpires: number;
}

export interface Hall {
  id: string;
  name: string;
  /** Hall hours, UTC ISO. */
  from: string;
  to: string;
  /**
   * The time the hall charges by, e.g. 60, 40 or 30 minutes. Hall hours,
   * band edges and court hours fall on whole units from the opening time.
   */
  unitMinutes: number;
  /** Cover the hall's hours with no overlap. */
  bands: RateBand[];
  courts: Court[];
}

export interface Frame {
  timeZone: string;
  /** The day runs from the earliest hall opening to the latest closing. */
  halls: Hall[];
  /** Held back at the end of the whole day. */
  bufferMinutes: number;
  /**
   * UTC ISO. When the buffer is pinned to a time, play must end by its start;
   * otherwise by the last closing less the buffer.
   */
  bufferStart?: string;
}

/** Badminton events. Open is doubles only: any mix of pairs together. */
export type EventType = "MS" | "WS" | "MD" | "WD" | "XD" | "OPEN";

export const EVENT_TYPES: readonly EventType[] = ["MS", "WS", "MD", "WD", "XD", "OPEN"];

/** Players on court per side: 1 for singles, 2 for doubles. */
export function playersPerEntry(event: EventType): number {
  return event === "MS" || event === "WS" ? 1 : 2;
}

/** Chosen once per tournament. */
export type Unit = "individual" | "team";

/** Chosen once per tournament. */
export type FormatType = "groupsKnockout" | "knockout" | "groups";

/** Rubbers of one event type in every tie between two teams. */
export interface LineUpItem {
  event: EventType;
  count: number;
}

/** What one entry in a category is. */
export type EntryKind =
  | { type: "individual"; event: EventType }
  /** Each player plays one rubber, so the squad follows from the line-up. */
  | { type: "team"; lineUp: LineUpItem[] };

export type GroupMode =
  | { type: "fixed"; groupCount: number }
  | { type: "auto"; preferredSize: number };

export interface EntryFee {
  /** Per player, or per entry (a player, pair or team). */
  basis: "player" | "entry";
  amount: number;
  /** Fee for external entrants; defaults to `amount`. */
  externalAmount?: number;
  /** Expected external entries (players, pairs or teams), of the expected entries. */
  expectedExternal: number;
}

export interface Category {
  id: string;
  name: string;
  entry: EntryKind;
  /** Players, pairs or teams, as the entry kind says. */
  expectedEntries: number;
  /** Needed when the format has groups. */
  groups?: GroupMode;
  /** Needed for groups then knockout. */
  qualifiersPerGroup?: number;
  bronze: boolean;
  fee: EntryFee;
}

export interface Prize {
  categoryId: string;
  position: string;
  amount: number;
}

export type OtherCost =
  | { id: string; label: string; type: "fixed"; amount: number }
  | {
      id: string;
      label: string;
      type: "perPerson";
      amount: number;
      basis: "players" | "umpires" | "custom";
      /** Headcount when basis is "custom". */
      count?: number;
    };

/** Money in besides entry fees, e.g. sponsorship or spectator tickets. */
export type OtherIncome =
  | { id: string; label: string; type: "fixed"; amount: number }
  | {
      id: string;
      label: string;
      type: "perPerson";
      amount: number;
      basis: "players" | "custom";
      /** Headcount when basis is "custom". */
      count?: number;
    };

export interface Finance {
  shuttlesPerGame: number;
  costPerShuttle: number;
  prizes: Prize[];
  otherCosts: OtherCost[];
  otherIncome: OtherIncome[];
}

/** Criteria for ranking a group, applied in the organiser's order. */
export type TiebreakCriterion =
  | "matchesWon"
  | "gameDifference"
  | "pointDifference"
  | "headToHead"
  | "pointsWon"
  /** Team events only. */
  | "rubbersWon"
  /** Last only. */
  | "drawOfLots";

export const TIEBREAK_CRITERIA: readonly TiebreakCriterion[] = [
  "matchesWon",
  "gameDifference",
  "pointDifference",
  "headToHead",
  "pointsWon",
  "rubbersWon",
  "drawOfLots",
];

/**
 * Open doubles only: points head start in every game for the weaker pair
 * type when different pair types meet. The same in every stage.
 */
export type Handicap =
  | { enabled: false }
  | {
      enabled: true;
      /** Given to the mixed pair. */
      mixedVsMens: number;
      /** Given to the women's pair. */
      womensVsMens: number;
      /** Given to the women's pair. */
      womensVsMixed: number;
    };

export interface Eligibility {
  /** No limit when absent. */
  maxCategoriesPerPerson?: number;
  /** Category ids one person can't both enter. */
  exclusivePairs: [string, string][];
  /** Category ids open to members only; the rest are open to external players. */
  membersOnly: string[];
  allowMixedMemberExternalPairs: boolean;
}

/** After play starts; before the draw a withdrawal is always a bye. */
export type WithdrawalRule = "byesThenWalkovers" | "byesThenVoid";

export type WalkoverRule = "straightGamesAtTarget" | "winOnly";

/** Stored for the draw, standings and Live mode; not used in planning calculations. */
export interface Rules {
  tiebreaks: TiebreakCriterion[];
  handicap: Handicap;
  eligibility: Eligibility;
  withdrawal: WithdrawalRule;
  walkover: WalkoverRule;
}

export interface TournamentInputs {
  unit: Unit;
  format: FormatType;
  frame: Frame;
  categories: Category[];
  /** Only stages that have matches need rules. */
  stageRules: Partial<Record<Stage, StageRules>>;
  /** Only stages that have matches need timing. */
  stageTiming: Partial<Record<Stage, Timing>>;
  /**
   * Extra on the typical length of every best-of-3 match, as a fraction
   * (0.33 adds a third), because some go to a third game.
   */
  bestOfThreeAllowance: number;
  finance: Finance;
  rules: Rules;
}
