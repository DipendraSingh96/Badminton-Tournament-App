import { EVENT_TYPES, STAGES, playersPerEntry, type EventType, type Stage } from "@/engine";
import {
  emptyRules,
  eventsInUse,
  newId,
  type CategoryDraft,
  type CourtDraft,
  type HallDraft,
  type PlanDraft,
  type RulesDraft,
  type StageRulesDraft,
} from "./draft";

type N = number | null;

/** A draft as saved in storage v4: timing per event, external entrants in the fee unit. */
export type V4Draft = Omit<PlanDraft, "stageRules" | "rules"> & {
  stageRules: Record<Stage, Omit<StageRulesDraft, "minutesPerGame" | "changeoverMinutes">>;
  eventTiming?: Partial<Record<EventType, { minutesPerGame: N; changeoverMinutes: N }>>;
  /** Added part-way through v4. */
  rules?: RulesDraft;
};

/** The frame as saved before halls (storage v3). */
interface V3Frame {
  date?: string;
  timeZone?: string;
  courtWindows?: { from?: string; to?: string; courts?: number | null; rate?: number | null }[];
  umpires?: number | null;
  bufferMinutes?: number | null;
}

/**
 * Brings a v3 draft (court windows) up to halls. Each old window becomes a
 * hall with the window's hours, one band at its rate and that many courts
 * following the hall's hours. The old umpire total is shared across the
 * courts as evenly as possible, earlier courts first. Old start and end
 * times are dropped: the day now comes from the halls.
 */
export function migrateV3(old: Omit<V4Draft, "frame"> & { frame: V3Frame }): V4Draft {
  const windows = old.frame.courtWindows ?? [];
  const counts = windows.map((w) => Math.max(1, w.courts ?? 1));
  const totalCourts = counts.reduce((sum, n) => sum + n, 0);
  const umpires = old.frame.umpires ?? null;
  let courtIndex = 0;
  const share = (): number | null => {
    if (umpires === null || totalCourts === 0) return null;
    const value = Math.floor(umpires / totalCourts) + (courtIndex < umpires % totalCourts ? 1 : 0);
    courtIndex += 1;
    return value;
  };

  const halls: HallDraft[] = windows.map((w, i) => {
    const courts: CourtDraft[] = Array.from({ length: counts[i]! }, () => ({
      id: newId(),
      from: null,
      to: null,
      umpires: share(),
    }));
    return {
      id: newId(),
      name: "",
      from: w.from ?? "",
      to: w.to ?? "",
      // Court windows were charged per hour.
      unitMinutes: 60,
      multipleRates: false,
      bands: [{ id: newId(), name: "", from: w.from ?? "", to: w.to ?? "", rate: w.rate ?? null }],
      courts,
    };
  });

  return {
    ...old,
    frame: {
      date: old.frame.date ?? "",
      timeZone: old.frame.timeZone ?? "",
      halls,
      bufferMinutes: old.frame.bufferMinutes ?? null,
      bufferStart: null,
    },
  };
}

/** Players in one entry of a category draft; 0 while it isn't set up. */
function playersPerDraftEntry(unit: PlanDraft["unit"], category: CategoryDraft): number {
  if (unit === "individual") return category.event ? playersPerEntry(category.event) : 0;
  if (unit === "team") return EVENT_TYPES.reduce((sum, e) => sum + (category.lineUp[e] ?? 0) * playersPerEntry(e), 0);
  return 0;
}

/**
 * Brings a v4 draft up to v5:
 * - Timing moves from events to stages. When every event in use has the
 *   same minutes per game and organising time, they are copied to every
 *   stage; otherwise stage timing starts empty for the organiser to enter.
 * - Expected external entrants become external entries: with a per-player
 *   fee they were counted in players, so they are divided by the players in
 *   an entry and rounded.
 * - Drafts saved before rules existed get empty rules.
 */
export function migrateV4(old: V4Draft): PlanDraft {
  const { eventTiming = {}, rules, ...rest } = old;
  const timings = eventsInUse(old as unknown as PlanDraft).map((e) => eventTiming[e]);
  const first = timings[0];
  const agreed =
    first &&
    first.minutesPerGame !== null &&
    first.changeoverMinutes !== null &&
    timings.every(
      (t) => t && t.minutesPerGame === first.minutesPerGame && t.changeoverMinutes === first.changeoverMinutes,
    );
  const stageRules = Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      {
        ...old.stageRules[stage],
        minutesPerGame: agreed ? first.minutesPerGame : null,
        changeoverMinutes: agreed ? first.changeoverMinutes : null,
      },
    ]),
  ) as Record<Stage, StageRulesDraft>;

  const categories = old.categories.map((c) => {
    const players = playersPerDraftEntry(old.unit, c);
    if (c.feeBasis !== "player" || c.expectedExternal === null || players === 0) return c;
    return { ...c, expectedExternal: Math.round(c.expectedExternal / players) };
  });

  return { ...rest, categories, stageRules, rules: rules ?? emptyRules(), stageWindows: {} };
}
