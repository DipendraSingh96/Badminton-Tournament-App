import { produce } from "immer";
import { analyseTournament, estimateSchedule, rulesFor, type Stage, type TournamentInputs } from "@/engine";
import { finishTournament, goLive } from "./changes";
import { emptyDraft, type PlanDraft } from "./draft";
import { fillDraw, fillEntries, fillPlan } from "./dummy/fill";
import { markDummy } from "./dummy/marks";
import { matchPlayers } from "./entries";
import { canFinish } from "./results";
import { parsePlan, timingInputs } from "./schema";
import { dayAfter, holdEvent, simulateDay, type SimGame } from "./simulate";
import { minutesOfDay } from "./time";

// The product tour's sample tournament.
//
// The tour walks a whole tournament, so it needs one at every point of its
// life: being planned, with its entries drawn, with the draw locked, with the
// day played, and finished. Each is built here from nothing, out of the same
// sample data the "fill with sample data" buttons use and a simulated day, so
// it is the same tournament every time. It exists only while the tour runs:
// nothing here is ever saved.

/** The points of a tournament's life the tour shows. */
export type TourState =
  | "blank"
  | "basics"
  | "hall"
  | "courts"
  | "setup"
  | "schedule"
  | "plan"
  | "draw"
  | "locked"
  | "ready"
  | "midday"
  | "played"
  | "results";

export const TOUR_STATES: TourState[] = ["blank", "basics", "hall", "courts", "setup", "schedule", "plan", "draw", "locked", "ready", "midday", "played", "results"];

/** How far into the day the tour's Live day is shown: some matches played, some on court, most to come. */
const MIDDAY_MINUTES = 50;

/** The seed that makes the tour's draw and its simulated day the same each time. */
const SEED = 2026;

/** A tournament's schedule as the simulation's games, with the plan as the engine reads it; null if the plan can't be read. */
export function scheduledGames(draft: PlanDraft): { inputs: TournamentInputs; games: SimGame[] } | null {
  const inputs = timingInputs(parsePlan(draft));
  const analysis = inputs ? analyseTournament(inputs) : null;
  if (!inputs || !analysis?.ok) return null;
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: draft.frame.timeZone });
  const local = (iso: string) => minutesOfDay(clock.format(new Date(iso)))!;
  const games = estimateSchedule(inputs, analysis.analysis).courts.flatMap((court) =>
    court.segments.map((s) => {
      const detail = s.details[0]!;
      return { id: detail.id, courtId: court.courtId, from: local(s.from), to: local(s.to), match: detail.match };
    }),
  );
  return { inputs, games };
}

/**
 * The plan as far as the tour has got in filling it in: the blank tournament
 * a new one opens as, then its name and date, a hall's settings, the courts,
 * the Setup tab, the Schedule tab; the whole plan has the Budget tab too. Each
 * is the whole plan with the later parts still blank.
 */
function planSoFar(whole: PlanDraft, blank: PlanDraft, state: "basics" | "hall" | "courts" | "setup" | "schedule"): PlanDraft {
  const upTo = ["basics", "hall", "courts", "setup", "schedule"].indexOf(state);
  const partial = produce(whole, (d) => {
    // Not yet the Budget tab.
    d.finance = structuredClone(blank.finance);
    for (const c of d.categories) {
      c.feeBasis = null;
      c.feeAmount = null;
      c.externalFeeAmount = null;
    }
    if (upTo >= 4) return;
    // Not yet the Schedule tab.
    for (const c of d.categories) {
      c.expectedEntries = null;
      c.expectedExternal = null;
      c.groupMode = null;
      c.groupCount = null;
      c.preferredGroupSize = null;
      c.qualifiersPerGroup = null;
      c.stageRules = structuredClone(blank.stageRules);
    }
    d.stageRules = structuredClone(blank.stageRules);
    d.bestOfThreeAllowance = null;
    d.overspill = null;
    d.frame.bufferMinutes = null;
    if (upTo >= 3) return;
    // Not yet the Setup tab.
    d.unit = null;
    d.format = null;
    d.categories = [];
    d.rules = structuredClone(blank.rules);
    d.courtGroups = {};
    if (upTo >= 2) return;
    // Not yet the courts: the one court a new tournament has, with the hall's line filled in.
    const hall = d.frame.halls[0]!;
    hall.courts = structuredClone(blank.frame.halls[0]!.courts);
    d.frame.halls = [hall];
    if (upTo >= 1) return;
    // Not yet the hall: only the name and the date.
    d.frame.halls = structuredClone(blank.frame.halls);
  });
  return markDummy(blank, partial);
}

/**
 * The Live day part-way through: the first matches played, the next on court,
 * and one court standing grey because a player of its match isn't checked in.
 * Null if the day can't be shown that way.
 */
function midday(ready: PlanDraft, seed: number): PlanDraft | null {
  const live = produce(ready, (d) => {
    goLive(d, `${d.frame.date}T08:00:00.000Z`);
  });
  const scheduled = scheduledGames(live);
  if (!scheduled) return null;
  const { inputs, games } = scheduled;
  const events = simulateDay(
    live,
    games,
    (game) => {
      const category = inputs.categories.find((c) => c.id === game.match.categoryId);
      return category ? rulesFor(inputs, category, game.match.stage as Stage) : undefined;
    },
    seed,
  );
  const first = Math.min(...games.map((g) => g.from));
  const cut = events.filter((e) => e.at <= first + MIDDAY_MINUTES).length;
  const day = dayAfter(live, events, cut);
  // One match that is on court is taken back to waiting, with a player of it not checked in: its court stands grey.
  const onCourt = games.find((g) => day.results[g.id]?.state === "onCourt");
  if (!onCourt) return day;
  const waiting = matchPlayers(day, onCourt.match)[0];
  if (!waiting) return day;
  return produce(day, (d) => {
    delete d.results[onCourt.id];
    for (const entry of d.entries) for (const player of entry.players) if (player.id === waiting.id) player.attendance = "notYet";
  });
}

/** The whole day played: everyone checked in, every match scored and finished. Null if the day can't be played through. */
function played(drawn: PlanDraft, seed: number): PlanDraft | null {
  const live = produce(drawn, (d) => {
    for (const entry of d.entries) for (const player of entry.players) player.attendance = "arrived";
    goLive(d, `${d.frame.date}T08:00:00.000Z`);
  });
  const scheduled = scheduledGames(live);
  if (!scheduled) return null;
  const { inputs, games } = scheduled;
  const events = simulateDay(
    live,
    games,
    (game) => {
      const category = inputs.categories.find((c) => c.id === game.match.categoryId);
      return category ? rulesFor(inputs, category, game.match.stage as Stage) : undefined;
    },
    seed,
  );
  // A day that stops for the desk (a level tie to decide) isn't one the tour can show finished.
  if (holdEvent(events)) return null;
  const day = dayAfter(live, events, events.length);
  return canFinish(day) ? day : null;
}

/**
 * The tour's sample tournament at every point of its life, each built on the
 * one before, so they are one tournament: the same entries, the same draw,
 * the same scores. `today` only sets the sample's date (the Saturday after it).
 */
export function tourSamples(today: Date, timeZone: string): Record<TourState, PlanDraft> {
  const blank = emptyDraft(timeZone);
  const plan = markDummy(blank, fillPlan(blank, today));
  const draw = produce(markDummy(plan, fillDraw(fillEntries(plan), SEED)), (d) => {
    d.stage = "draw";
  });
  const locked = produce(draw, (d) => {
    for (const made of Object.values(d.draw)) made.locked = true;
  });
  // The first seed whose day plays through to the final with nothing left for the desk to decide.
  let day: PlanDraft | null = null;
  for (let seed = SEED; day === null && seed < SEED + 50; seed++) day = played(locked, seed);
  // (No such day: the later chapters show the locked draw. The tests make sure there is one.)
  const playedDay = day ?? locked;
  const results = produce(playedDay, (d) => {
    finishTournament(d, d.log.at(-1)?.at ?? `${d.frame.date}T18:00:00.000Z`);
  });
  // For the rehearsal: the day about to begin, everyone checked in, so its first games go straight on court.
  const ready = produce(locked, (d) => {
    for (const entry of d.entries) for (const player of entry.players) player.attendance = "arrived";
  });
  return {
    blank,
    basics: planSoFar(plan, blank, "basics"),
    hall: planSoFar(plan, blank, "hall"),
    courts: planSoFar(plan, blank, "courts"),
    setup: planSoFar(plan, blank, "setup"),
    schedule: planSoFar(plan, blank, "schedule"),
    plan,
    draw,
    locked,
    ready,
    midday: midday(ready, SEED) ?? ready,
    played: playedDay,
    results,
  };
}
