import {
  EVENT_TYPES,
  type EventType,
  type FormatType,
  type Stage,
  type TiebreakCriterion,
  type Unit,
  type WalkoverRule,
  type WithdrawalRule,
} from "@/engine";
import { EVENT_LABELS } from "./events";
import { clock, minutesOfDay } from "./time";

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
  /** Hire per court per unit of the hall's unit time (£). */
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
  /** Minutes the hall charges by, e.g. 60, 40 or 30. */
  unitMinutes: N;
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
  /** "HH:mm" when the buffer is pinned on the timeline; null shows it after the last match. */
  bufferStart: string | null;
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

/** A stage's scoring and timing; applies to every event played in it. */
export interface StageRulesDraft {
  pointsPerGame: N;
  deuce: "none" | "cap" | "standard" | null;
  /** The cap or maximum, depending on `deuce`. */
  deuceLimit: N;
  bestOf: 1 | 3 | null;
  /** Typical playing time per game. */
  minutesPerGame: N;
  /** Walk-on, warm-up and changeover per match. */
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

export interface OtherIncomeDraft {
  id: string;
  label: string;
  type: "fixed" | "perPerson" | null;
  amount: N;
  basis: "players" | "custom" | null;
  count: N;
}

export interface FinanceDraft {
  shuttlesPerGame: N;
  /** Whether the price is for one shuttle or a tube. */
  shuttlePriceBasis: "shuttle" | "tube" | null;
  /** Price (£) per shuttle or per tube. */
  shuttlePrice: N;
  /** Per tube only. */
  shuttlesPerTube: N;
  prizes: PrizeDraft[];
  otherCosts: OtherCostDraft[];
  otherIncome: OtherIncomeDraft[];
}

export interface ExclusivePairDraft {
  id: string;
  first: string | null;
  second: string | null;
}

export interface RulesDraft {
  /** In the order they are applied. */
  tiebreaks: TiebreakCriterion[];
  /** Open doubles only: points head start per matchup, given to the weaker pair type. */
  handicap: { enabled: boolean; mixedVsMens: N; womensVsMens: N; womensVsMixed: N };
  eligibility: {
    /** Empty means no limit. */
    maxCategoriesPerPerson: N;
    exclusivePairs: ExclusivePairDraft[];
    /** Category ids. */
    membersOnly: string[];
    allowMixedMemberExternalPairs: boolean;
  };
  withdrawal: WithdrawalRule | null;
  walkover: WalkoverRule | null;
}

export interface PlanDraft {
  name: string;
  /** Chosen once per tournament. */
  unit: Unit | null;
  /** Chosen once per tournament. */
  format: FormatType | null;
  frame: FrameDraft;
  categories: CategoryDraft[];
  /** Scoring and timing per stage. */
  stageRules: Record<Stage, StageRulesDraft>;
  /** Percentage added to typical best-of-3 matches; needed when any stage is best of 3. */
  bestOfThreeAllowance: N;
  finance: FinanceDraft;
  /** Set once for the tournament. */
  rules: RulesDraft;
  /**
   * Stage, wave and round windows pinned on the timeline, keyed like the
   * engine's window keys ("group", "wave:2", "round:8"); "HH:mm".
   */
  stageWindows: Record<string, { from: string; to: string }>;
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

/**
 * Stages the format can play: groups unless knockout only; knockout rounds
 * and the final unless groups only; bronze when a category has it switched
 * on. Other stages need no scoring or timing.
 */
export function stagesInPlay(draft: PlanDraft): Stage[] {
  const { format } = draft;
  if (!format) return [];
  const stages: Stage[] = [];
  if (format !== "knockout") stages.push("group");
  if (format !== "groups") {
    stages.push("knockout");
    if (draft.categories.some((c) => c.bronze)) stages.push("bronze");
    stages.push("final");
  }
  return stages;
}

/** True when any stage is set to best of 3. */
export function usesBestOfThree(draft: PlanDraft): boolean {
  return stagesInPlay(draft).some((stage) => draft.stageRules[stage].bestOf === 3);
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

/** True when Open doubles is played, as a category or as team rubbers. */
export function openDoublesInUse(draft: PlanDraft): boolean {
  return eventsInUse(draft).includes("OPEN");
}

/** True when any pair is played, so members and external players could pair up. */
export function pairsInUse(draft: PlanDraft): boolean {
  return eventsInUse(draft).some((event) => event !== "MS" && event !== "WS");
}

/**
 * The name shown for a category left unnamed. An individual category takes
 * its event, numbered from the second of that event: "Men's doubles",
 * "Men's doubles 2". A team competition is "Competition N".
 */
export function defaultCategoryName(draft: PlanDraft, index: number): string {
  const category = draft.categories[index];
  if (draft.unit === "individual" && category?.event) {
    const event = category.event;
    const before = draft.categories.slice(0, index).filter((c) => c.event === event).length;
    return before === 0 ? EVENT_LABELS[event] : `${EVENT_LABELS[event]} ${before + 1}`;
  }
  return `Competition ${index + 1}`;
}

/** Removes a category and every reference to it: prizes and eligibility rules. */
export function removeCategory(draft: PlanDraft, id: string): void {
  draft.categories = draft.categories.filter((c) => c.id !== id);
  draft.finance.prizes = draft.finance.prizes.filter((p) => p.categoryId !== id);
  const eligibility = draft.rules.eligibility;
  eligibility.exclusivePairs = eligibility.exclusivePairs.filter((p) => p.first !== id && p.second !== id);
  eligibility.membersOnly = eligibility.membersOnly.filter((c) => c !== id);
}

export function emptyBand(): RateBandDraft {
  return { id: newId(), name: "", from: "", to: "", rate: null };
}

export function emptyCourt(): CourtDraft {
  return { id: newId(), from: null, to: null, umpires: null };
}

/** A new hall starts with one band (filled in once its hours are set) and one court. */
export function emptyHall(): HallDraft {
  return {
    id: newId(),
    name: "",
    from: "",
    to: "",
    unitMinutes: null,
    bands: [emptyBand()],
    courts: [emptyCourt()],
  };
}

/** A court's hours: its own if narrowed, otherwise its hall's. */
export function courtHours(hall: HallDraft, court: CourtDraft): { from: string; to: string } {
  return { from: court.from ?? hall.from, to: court.to ?? hall.to };
}

/**
 * Sets a hall's hours ("HH:mm", or "" to clear them) and keeps what depends
 * on them in step:
 * - Moving the whole window shifts every band and every narrowed court with it.
 * - Moving one edge carries the bands that started (or ended) on that edge.
 * - A single band follows the hall, including when the hours are first set
 *   or cleared.
 * Anything else is left for validation to flag rather than changed silently.
 */
export function setHallWindow(hall: HallDraft, from: string, to: string): void {
  const oldFrom = minutesOfDay(hall.from);
  const oldTo = minutesOfDay(hall.to);
  const newFrom = minutesOfDay(from);
  const newTo = minutesOfDay(to);
  const shift = (hhmm: string, by: number) => {
    const m = minutesOfDay(hhmm);
    return m === null ? hhmm : clock(m + by);
  };

  if (hall.bands.length === 1) {
    const band = hall.bands[0]!;
    if (band.from === "" || band.from === hall.from) band.from = from;
    if (band.to === "" || band.to === hall.to) band.to = to;
  } else if (oldFrom !== null && oldTo !== null && newFrom !== null && newTo !== null) {
    const moved = newFrom - oldFrom;
    if (moved !== 0 && newTo - oldTo === moved) {
      for (const band of hall.bands) {
        band.from = shift(band.from, moved);
        band.to = shift(band.to, moved);
      }
      for (const court of hall.courts) {
        if (court.from !== null) court.from = shift(court.from, moved);
        if (court.to !== null) court.to = shift(court.to, moved);
      }
    } else {
      for (const band of hall.bands) {
        if (band.from === hall.from) band.from = from;
        if (band.to === hall.to) band.to = to;
      }
    }
  }
  hall.from = from;
  hall.to = to;
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

export function emptyRules(): RulesDraft {
  return {
    tiebreaks: [],
    handicap: { enabled: false, mixedVsMens: null, womensVsMens: null, womensVsMixed: null },
    eligibility: {
      maxCategoriesPerPerson: null,
      exclusivePairs: [],
      membersOnly: [],
      allowMixedMemberExternalPairs: false,
    },
    withdrawal: null,
    walkover: null,
  };
}

export function emptyExclusivePair(): ExclusivePairDraft {
  return { id: newId(), first: null, second: null };
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

export function emptyOtherIncome(): OtherIncomeDraft {
  return { id: newId(), label: "", type: null, amount: null, basis: null, count: null };
}

/** Cost of one shuttle from the price entered; null until it can be worked out. */
export function costPerShuttle(finance: FinanceDraft): number | null {
  const { shuttlePriceBasis, shuttlePrice, shuttlesPerTube } = finance;
  if (shuttlePrice === null || shuttlePriceBasis === null) return null;
  if (shuttlePriceBasis === "shuttle") return shuttlePrice;
  return shuttlesPerTube && shuttlesPerTube > 0 ? shuttlePrice / shuttlesPerTube : null;
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
      bufferStart: null,
    },
    categories: [],
    stageRules: {
      group: emptyStageRules(),
      knockout: emptyStageRules(),
      bronze: emptyStageRules(),
      final: emptyStageRules(),
    },
    bestOfThreeAllowance: null,
    finance: {
      shuttlesPerGame: null,
      shuttlePriceBasis: null,
      shuttlePrice: null,
      shuttlesPerTube: null,
      prizes: [],
      otherCosts: [],
      otherIncome: [],
    },
    rules: emptyRules(),
    stageWindows: {},
  };
}
