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

export type GroupMode =
  | { type: "fixed"; groupCount: number }
  | { type: "auto"; preferredSize: number };

export interface EntryFee {
  basis: "player" | "pair";
  amount: number;
  /** Fee for external entrants; defaults to `amount`. */
  externalAmount?: number;
  /** Expected external entrants, counted in the fee basis unit. */
  expectedExternal: number;
}

export interface Category {
  id: string;
  name: string;
  expectedPairs: number;
  groups: GroupMode;
  qualifiersPerGroup: number;
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
  frame: Frame;
  categories: Category[];
  /** Only stages that have matches need rules. */
  stageRules: Partial<Record<Stage, StageRules>>;
  finance: Finance;
}
