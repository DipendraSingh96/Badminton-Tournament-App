import { EVENT_TYPES, type EventType, type FormatType, type Stage, type Unit } from "@/engine";

// What the plan editor holds while the organiser types. Every number starts
// empty (null): the app supplies no tournament values of its own. The schema
// turns a complete draft into engine inputs.

type N = number | null;

// Times are "HH:mm" in the tournament's time zone.

export interface RateBandDraft {
  id: string;
  /** Optional, e.g. "Peak"; shown as "Band N" when empty. */
  name: string;
  from: string;
  to: string;
  /** Hire per court per hour (£). */
  rate: N;
}

export interface CourtDraft {
  id: string;
  /** Null follows the hall's hours, so the court moves with them. */
  from: string | null;
  to: string | null;
  umpires: N;
}

export interface HallDraft {
  id: string;
  /** Optional; shown as "Hall N" when empty. */
  name: string;
  from: string;
  to: string;
  bands: RateBandDraft[];
  courts: CourtDraft[];
}

export interface FrameDraft {
  /** "YYYY-MM-DD". */
  date: string;
  timeZone: string;
  /** The day runs from the earliest hall opening to the latest closing. */
  halls: HallDraft[];
  /** Held back at the end of the whole day. */
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
}

export interface EventTimingDraft {
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
  /** Scoring per stage. */
  stageRules: Record<Stage, StageRulesDraft>;
  /** Timing per event type; only events in use need it. */
  eventTiming: Record<EventType, EventTimingDraft>;
  /** Percentage added to typical best-of-3 matches; needed when any stage is best of 3. */
  bestOfThreeAllowance: N;
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
  };
}

/** True when any stage is set to best of 3. */
export function usesBestOfThree(draft: PlanDraft): boolean {
  return Object.values(draft.stageRules).some((stage) => stage.bestOf === 3);
}

/**
 * Events the plan plays: each individual category's event, or every event
 * in a team line-up with at least one rubber. In the order of EVENT_TYPES.
 */
export function eventsInUse(draft: PlanDraft): EventType[] {
  const used = new Set<EventType>();
  for (const category of draft.categories) {
    if (draft.unit === "individual" && category.event) used.add(category.event);
    if (draft.unit === "team") {
      for (const event of EVENT_TYPES) if ((category.lineUp[event] ?? 0) > 0) used.add(event);
    }
  }
  return EVENT_TYPES.filter((event) => used.has(event));
}

export function emptyBand(): RateBandDraft {
  return { id: newId(), name: "", from: "", to: "", rate: null };
}

export function emptyCourt(): CourtDraft {
  return { id: newId(), from: null, to: null, umpires: null };
}

/** A new hall starts with one band (filled in once its hours are set) and one court. */
export function emptyHall(): HallDraft {
  return { id: newId(), name: "", from: "", to: "", bands: [emptyBand()], courts: [emptyCourt()] };
}

/** A court's hours: its own if narrowed, otherwise its hall's. */
export function courtHours(hall: HallDraft, court: CourtDraft): { from: string; to: string } {
  return { from: court.from ?? hall.from, to: court.to ?? hall.to };
}

/** Courts are numbered across the venue: Hall 1 has Courts 1-4, Hall 2 continues at 5. */
export function courtNumber(halls: HallDraft[], hallIndex: number, courtIndex: number): number {
  return halls.slice(0, hallIndex).reduce((sum, h) => sum + h.courts.length, 0) + courtIndex + 1;
}

export function hallName(hall: HallDraft, index: number): string {
  return hall.name.trim() || `Hall ${index + 1}`;
}

export function bandName(band: RateBandDraft, index: number): string {
  return band.name.trim() || `Band ${index + 1}`;
}

export function emptyCategory(): CategoryDraft {
  return {
    id: newId(),
    name: "",
    event: null,
    lineUp: Object.fromEntries(EVENT_TYPES.map((e) => [e, null])) as Record<EventType, N>,
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
      timeZone,
      halls: [emptyHall()],
      bufferMinutes: null,
    },
    categories: [emptyCategory()],
    stageRules: {
      group: emptyStageRules(),
      knockout: emptyStageRules(),
      bronze: emptyStageRules(),
      final: emptyStageRules(),
    },
    eventTiming: Object.fromEntries(
      EVENT_TYPES.map((e) => [e, { minutesPerGame: null, changeoverMinutes: null }]),
    ) as Record<EventType, EventTimingDraft>,
    bestOfThreeAllowance: null,
    finance: {
      shuttlesPerGame: null,
      costPerShuttle: null,
      prizes: [],
      otherCosts: [],
    },
  };
}
