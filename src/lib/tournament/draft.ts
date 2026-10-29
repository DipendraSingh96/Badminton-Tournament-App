import {
  EVENT_TYPES,
  type EventType,
  type FormatType,
  type GroupCourts,
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

/** Where an umpire stands, shown as a dot on the court: the four corners and each end of the net. */
export const UMPIRE_SPOTS = ["topLeft", "topRight", "netLeft", "netRight", "bottomLeft", "bottomRight"] as const;
export type UmpireSpot = (typeof UMPIRE_SPOTS)[number];

export interface CourtDraft {
  id: string;
  /** Null follows the hall's hours, so the court moves with them. */
  from: string | null;
  to: string | null;
  umpires: N;
  /** Where the umpires stand; kept in step with `umpires`. Absent on courts saved before positions. */
  umpireSpots?: UmpireSpot[];
}

export interface HallDraft {
  id: string;
  /** Optional; shown as "Hall N" when empty. */
  name: string;
  from: string;
  to: string;
  /** Minutes the hall charges by, e.g. 60, 40 or 30. */
  unitMinutes: N;
  /**
   * Off: one rate all day, kept as a single band on the hall's hours.
   * On: rate bands across the day (e.g. off-peak and peak).
   */
  multipleRates: boolean;
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

export interface ZoneMoveDraft {
  start: string | null;
  hallId: string | null;
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
   * Hall stage zones moved on the timeline, keyed "hallId:group" or
   * "hallId:knockout": a later start ("HH:mm") and/or another hall.
   */
  zoneMoves: Record<string, ZoneMoveDraft>;
  /** Matches moved on the timeline, by match id: onto a court, before another match there (or last). */
  matchMoves: Record<string, { courtId: string; before: string | null }>;
  /** Group stage: each group on its own courts, or any free court in the hall. */
  groupCourts: GroupCourts;
  /** Courts set by hand, by court id: a group's key ("categoryId:groupIndex") of any hall, or "" for no group. */
  courtGroups: Record<string, string>;
  /** Where the tournament is: planning, the draw, the day, or after it. */
  stage: TournamentStage;
  /** Who entered: teams, pairs or players, each in a category. Names only (no contact details). */
  entries: EntryDraft[];
  /** Each category's draw, by category id. */
  draw: Record<string, DrawDraft>;
}

/** Plan, then the draw, then the day itself, then the results. */
export type TournamentStage = "plan" | "draw" | "live" | "results";

/** Checked in at the desk on the day. */
export type Attendance = "notYet" | "arrived" | "absent";

export interface PlayerDraft {
  id: string;
  name: string;
  attendance: Attendance;
}

/** A team, pair or single player entered in a category. */
export interface EntryDraft {
  id: string;
  categoryId: string;
  /** A team's name; optional for pairs and singles, which show their players' names. */
  name: string;
  external: boolean;
  /** 1 is the top seed; null is unseeded. */
  seed: N;
  /** A team's squad, a pair's two players, or one player. */
  players: PlayerDraft[];
  /**
   * Teams only: who plays each rubber, by rubber number ("1", "2"…), fixed for
   * the day: the same players play that rubber in every tie.
   */
  lineUp: Record<string, string[]>;
}

/** A category's draw: entry ids by group, in place order (index 0 is slot 1, "A1"). */
export interface DrawDraft {
  groups: string[][];
  /** The number the random part of the draw came from; a redraw is a new one. */
  randomSeed: number;
  /** Locked: the draw is final and the post-draw views use it. */
  locked: boolean;
}

export function emptyPlayer(): PlayerDraft {
  return { id: newId(), name: "", attendance: "notYet" };
}

export function emptyEntry(categoryId: string, players: number): EntryDraft {
  return {
    id: newId(),
    categoryId,
    name: "",
    external: false,
    seed: null,
    players: Array.from({ length: players }, emptyPlayer),
    lineUp: {},
  };
}

/** An entry's name: its own, or its players' ("Ann Lee / Raj Shah"), or null when neither is set. */
export function entryName(entry: EntryDraft): string | null {
  if (entry.name.trim()) return entry.name.trim();
  const names = entry.players.map((p) => p.name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(" / ") : null;
}

/**
 * A category as the plan uses it: past the Plan stage,
 * its entries and their external flags replace the expected numbers.
 */
export function effectiveCategory(draft: PlanDraft, category: CategoryDraft): CategoryDraft {
  if (draft.stage === "plan") return category;
  const entries = draft.entries.filter((e) => e.categoryId === category.id);
  return { ...category, expectedEntries: entries.length, expectedExternal: entries.filter((e) => e.external).length };
}

/** Gives a court to a group for the group stage, to no group (""), or (null) back to the automatic split. */
export function setCourtGroup(draft: PlanDraft, courtId: string, key: string | null): void {
  if (key === null) delete draft.courtGroups[courtId];
  else draft.courtGroups[courtId] = key;
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
    multipleRates: false,
    bands: [emptyBand()],
    courts: [emptyCourt()],
  };
}

/** Empties a hall but keeps its name: hours, unit, rates and courts start again. */
export function clearHall(hall: HallDraft): void {
  const { id, name } = hall;
  Object.assign(hall, emptyHall(), { id, name });
}

/** The spots a court's umpires stand at; courts saved before positions fill them in order. */
export function umpireSpots(court: CourtDraft): UmpireSpot[] {
  return court.umpireSpots ?? UMPIRE_SPOTS.slice(0, court.umpires ?? 0);
}

/** Puts an umpire at a spot, or takes them away; the court's count follows. */
export function toggleUmpire(court: CourtDraft, spot: UmpireSpot): void {
  const spots = umpireSpots(court);
  const next = spots.includes(spot) ? spots.filter((s) => s !== spot) : [...spots, spot];
  court.umpireSpots = UMPIRE_SPOTS.filter((s) => next.includes(s));
  court.umpires = next.length;
}

/**
 * A court's start or end moved one of its hall's charging units earlier or
 * later, kept within the hall's hours and at least one unit long. Null when it
 * can't move that way (or the hall's hours or unit aren't set).
 */
export function steppedCourtTime(
  hall: HallDraft,
  court: CourtDraft,
  key: "from" | "to",
  direction: 1 | -1,
): string | null {
  const unit = hall.unitMinutes;
  const open = minutesOfDay(hall.from);
  const close = minutesOfDay(hall.to);
  const hours = courtHours(hall, court);
  const from = minutesOfDay(hours.from);
  const to = minutesOfDay(hours.to);
  if (!unit || open === null || close === null || from === null || to === null) return null;
  const next = (key === "from" ? from : to) + direction * unit;
  const ok = key === "from" ? next >= open && next <= to - unit : next <= close && next >= from + unit;
  return ok ? clock(next) : null;
}

/** Sets a court's start or end; a time equal to the hall's follows the hall again. */
export function setCourtTime(hall: HallDraft, court: CourtDraft, key: "from" | "to", value: string): void {
  court[key] = value === hall[key] ? null : value;
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

/**
 * A zone's dragged start when it still fits inside its hall's hours. Zones
 * come from the structure, so a start that no longer fits (say the hall's
 * hours changed) is simply ignored; it never stops the plan.
 */
export function zoneStart(draft: PlanDraft, key: string): string | null {
  const start = draft.zoneMoves[key]?.start ?? null;
  const match = /^(.+):(group|knockout)$/.exec(key);
  const hall = match ? draft.frame.halls.find((h) => h.id === match[1]) : undefined;
  const at = minutesOfDay(start);
  const open = minutesOfDay(hall?.from);
  const close = minutesOfDay(hall?.to);
  if (at === null || open === null || close === null) return null;
  return at >= open && at < close ? start : null;
}

type ZoneName = "group" | "knockout";

/** The hall a hall's zone is played in: its own, or where it was moved. */
export function zoneHall(draft: PlanDraft, hallId: string, zone: ZoneName): string {
  const to = draft.zoneMoves[`${hallId}:${zone}`]?.hallId;
  return to && draft.frame.halls.some((h) => h.id === to) ? to : hallId;
}

function tidy(draft: PlanDraft, key: string) {
  const move = draft.zoneMoves[key];
  if (move && !move.start && !move.hallId) delete draft.zoneMoves[key];
}

/** Starts a hall's zone no earlier than `start` ("HH:mm"), or as the estimate when null. */
export function shiftZone(draft: PlanDraft, hallId: string, zone: ZoneName, start: string | null): void {
  const key = `${hallId}:${zone}`;
  draft.zoneMoves[key] = { start, hallId: draft.zoneMoves[key]?.hallId ?? null };
  tidy(draft, key);
}

/** Moves the zone shown in one hall, with everything played there, to another hall. */
export function moveZone(draft: PlanDraft, fromHallId: string, toHallId: string, zone: ZoneName): void {
  if (fromHallId === toHallId) return;
  for (const hall of draft.frame.halls) {
    if (zoneHall(draft, hall.id, zone) !== fromHallId) continue;
    const key = `${hall.id}:${zone}`;
    draft.zoneMoves[key] = { start: draft.zoneMoves[key]?.start ?? null, hallId: hall.id === toHallId ? null : toHallId };
    tidy(draft, key);
  }
}

/** Puts the zone shown in a hall back to the estimate: its own start, and any zone moved into it goes home. */
export function resetZone(draft: PlanDraft, hallId: string, zone: ZoneName): void {
  for (const hall of draft.frame.halls) {
    const key = `${hall.id}:${zone}`;
    const move = draft.zoneMoves[key];
    if (!move) continue;
    if (hall.id === hallId) move.start = null;
    if (move.hallId === hallId) move.hallId = null;
    tidy(draft, key);
  }
}

/** True when anything has been moved by hand on the timeline. */
export function hasMoves(draft: PlanDraft): boolean {
  return Object.keys(draft.matchMoves).length > 0 || Object.values(draft.zoneMoves).some((m) => m.start || m.hallId);
}

/** One rate all day: the first band stays, covering the hall's hours; the others go. */
export function keepOneRate(hall: HallDraft): void {
  const first = hall.bands[0] ?? emptyBand();
  hall.bands = [{ ...first, from: hall.from, to: hall.to }];
  hall.multipleRates = false;
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
    zoneMoves: {},
    matchMoves: {},
    groupCourts: "own",
    courtGroups: {},
    stage: "plan",
    entries: [],
    draw: {},
  };
}
