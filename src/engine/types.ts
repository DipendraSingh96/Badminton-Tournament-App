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

export interface StageRules {
  pointsPerGame: number;
  deuce: DeuceRule;
  bestOf: 1 | 3;
  /** Typical playing time for one game. */
  minutesPerGame: number;
  /** Organising time per match: walk-on, warm-up, changeover. */
  changeoverMinutes: number;
}

export interface CourtWindow {
  /** UTC ISO timestamps. */
  from: string;
  to: string;
  courts: number;
}

export interface Frame {
  /** UTC ISO timestamps. */
  start: string;
  end: string;
  timeZone: string;
  courtWindows: CourtWindow[];
  umpires: number;
  /** Reserve held back at the end of the day. */
  bufferMinutes: number;
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
  | { type: "team"; lineUp: LineUpItem[]; playersPerTeam: number };

export type GroupMode =
  | { type: "fixed"; groupCount: number }
  | { type: "auto"; preferredSize: number };

export interface EntryFee {
  /** Per player, or per entry (a player, pair or team). */
  basis: "player" | "entry";
  amount: number;
  /** Fee for external entrants; defaults to `amount`. */
  externalAmount?: number;
  /** Expected external entrants, counted in the fee basis unit. */
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

export interface Finance {
  shuttlesPerGame: number;
  costPerShuttle: number;
  prizes: Prize[];
  otherCosts: OtherCost[];
}

export interface TournamentInputs {
  unit: Unit;
  format: FormatType;
  frame: Frame;
  categories: Category[];
  /** Only stages that have matches need rules. */
  stageRules: Partial<Record<Stage, StageRules>>;
  finance: Finance;
}
