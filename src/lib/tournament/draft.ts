import { EVENT_TYPES, type EventType, type FormatType, type Stage, type Unit } from "@/engine";

// What the plan editor holds while the organiser types. Every number starts
// empty (null): the app supplies no tournament values of its own. The schema
// turns a complete draft into engine inputs.

type N = number | null;

export interface CourtWindowDraft {
  id: string;
  /** "HH:mm" in the tournament's time zone. */
  from: string;
  to: string;
  courts: N;
}

export interface FrameDraft {
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:mm" in the tournament's time zone. */
  startTime: string;
  endTime: string;
  timeZone: string;
  courtWindows: CourtWindowDraft[];
  umpires: N;
  bufferMinutes: N;
}

export interface CategoryDraft {
  id: string;
  /** Optional for individual entries (defaults to the event); required for teams. */
  name: string;
  /** Individual entries only. */
  event: EventType | null;
  /** Team events only: rubbers of each event type in a tie. */
  lineUp: Record<EventType, N>;
  /** Team events only. */
  playersPerTeam: N;
  /** Players, pairs or teams. */
  expectedEntries: N;
  groupMode: "auto" | "fixed" | null;
  groupCount: N;
  preferredGroupSize: N;
  qualifiersPerGroup: N;
  bronze: boolean;
  feeBasis: "player" | "entry" | null;
  feeAmount: N;
  externalFeeAmount: N;
  expectedExternal: N;
}

export interface StageRulesDraft {
  pointsPerGame: N;
  deuce: "none" | "cap" | "standard" | null;
  /** The cap or maximum, depending on `deuce`. */
  deuceLimit: N;
  bestOf: 1 | 3 | null;
  minutesPerGame: N;
  changeoverMinutes: N;
}

export interface PrizeDraft {
  id: string;
  categoryId: string;
  position: string;
  amount: N;
}

export interface OtherCostDraft {
  id: string;
  label: string;
  type: "fixed" | "perPerson" | null;
  amount: N;
  basis: "players" | "umpires" | "custom" | null;
  count: N;
}

export interface FinanceDraft {
  shuttlesPerGame: N;
  costPerShuttle: N;
  prizes: PrizeDraft[];
  otherCosts: OtherCostDraft[];
}

export interface PlanDraft {
  name: string;
  /** Chosen once per tournament. */
  unit: Unit | null;
  /** Chosen once per tournament. */
  format: FormatType | null;
  frame: FrameDraft;
  categories: CategoryDraft[];
  stageRules: Record<Stage, StageRulesDraft>;
  finance: FinanceDraft;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyStageRules(): StageRulesDraft {
  return {
    pointsPerGame: null,
    deuce: null,
    deuceLimit: null,
    bestOf: null,
    minutesPerGame: null,
    changeoverMinutes: null,
  };
}

export function emptyCourtWindow(): CourtWindowDraft {
  return { id: newId(), from: "", to: "", courts: null };
}

export function emptyCategory(): CategoryDraft {
  return {
    id: newId(),
    name: "",
    event: null,
    lineUp: Object.fromEntries(EVENT_TYPES.map((e) => [e, null])) as Record<EventType, N>,
    playersPerTeam: null,
    expectedEntries: null,
    groupMode: null,
    groupCount: null,
    preferredGroupSize: null,
    qualifiersPerGroup: null,
    bronze: false,
    feeBasis: null,
    feeAmount: null,
    externalFeeAmount: null,
    expectedExternal: null,
  };
}

export function emptyPrize(categoryId: string): PrizeDraft {
  return { id: newId(), categoryId, position: "", amount: null };
}

export function emptyOtherCost(): OtherCostDraft {
  return { id: newId(), label: "", type: null, amount: null, basis: null, count: null };
}

export function emptyDraft(timeZone: string): PlanDraft {
  return {
    name: "",
    unit: null,
    format: null,
    frame: {
      date: "",
      startTime: "",
      endTime: "",
      timeZone,
      courtWindows: [emptyCourtWindow()],
      umpires: null,
      bufferMinutes: null,
    },
    categories: [emptyCategory()],
    stageRules: {
      group: emptyStageRules(),
      knockout: emptyStageRules(),
      bronze: emptyStageRules(),
      final: emptyStageRules(),
    },
    finance: {
      shuttlesPerGame: null,
      costPerShuttle: null,
      prizes: [],
      otherCosts: [],
    },
  };
}
