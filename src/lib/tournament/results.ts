import { finance, groupLetter, totalUmpires, type FinanceResult, type TournamentInputs } from "@/engine";
import { courtHours, courtNumber, type CategoryDraft, type PlanDraft } from "./draft";
import {
  categoryFormatOf,
  categoryLabel,
  categoryMatchIds,
  entryIdOn,
  groupStatus,
  groupTables,
  knockoutMatchOf,
  knockoutOutcome,
  knockoutRoundName,
  levelKnockoutTies,
  matchRef,
} from "./entries";
import { minutesOfDay } from "./time";

// The Results stage: when a tournament can be finished, who placed where, how
// the day ran against the plan, and what it really cost and made. All of it is
// worked out from what is stored; the only thing the organiser adds is a
// correction to a money line (`draft.actuals`).

/** A game on the schedule, as the day report needs it: its court and its planned slot (minutes since midnight). */
export interface ResultsGame {
  id: string;
  courtId: string;
  from: number;
  to: number;
}

/** A match the tournament no longer plays: a group match of an entry that withdrew with its results voided. */
function voided(draft: PlanDraft, matchId: string): boolean {
  const ref = matchRef(draft, matchId);
  if (!ref || ref.stage !== "group") return false;
  return [ref.home, ref.away].some((slot) => {
    const id = entryIdOn(draft, ref.categoryId, slot);
    const gone = id ? draft.withdrawn[id] : undefined;
    return gone?.stage === "group" && gone.results === "void";
  });
}

/**
 * What still stands between a Live tournament and its results, in words;
 * empty when it can be finished. Every match must be finished (voided ones
 * aren't played), and nothing may be waiting for the desk to decide.
 */
export function stillOpen(draft: PlanDraft): string[] {
  const open: string[] = [];
  const several = draft.categories.length > 1;
  const of = (categoryId: string) => (several ? `${categoryLabel(draft, categoryId)}: ` : "");
  let unplayed = 0;
  let onCourt = 0;
  for (const category of draft.categories) {
    for (const id of categoryMatchIds(draft, category)) {
      const state = draft.results[id]?.state;
      if (state === "finished" || voided(draft, id)) continue;
      if (state === "onCourt") onCourt += 1;
      else unplayed += 1;
    }
  }
  if (onCourt > 0) open.push(`${onCourt} ${onCourt === 1 ? "match is" : "matches are"} on court`);
  if (unplayed > 0) open.push(`${unplayed} ${unplayed === 1 ? "match" : "matches"} still to play`);
  for (const tie of levelKnockoutTies(draft)) open.push(`${of(tie.categoryId)}${knockoutRoundName(tie.code)} is level: decide it`);
  for (const category of draft.categories) {
    for (const table of groupTables(draft, category)) {
      if (table.rows.some((row) => groupStatus(table, row) === "level")) open.push(`${of(category.id)}Group ${table.letter} is level: decide it`);
    }
  }
  if (draft.categories.length === 0) open.push("There are no categories");
  return open;
}

/** Every match is played and nothing is left to decide. */
export function canFinish(draft: PlanDraft): boolean {
  return draft.stage === "live" && stillOpen(draft).length === 0;
}

/** Who finished in a place. Several entries share one when it wasn't played off (two losing semi-finalists with no bronze match). */
export interface Placing {
  place: 1 | 2 | 3;
  entryIds: string[];
  /** Groups only: the group whose table this is from. */
  group?: string;
}

/**
 * A category's first three places. With a knockout: the final's winner and
 * loser, then the bronze match's winner, or with no bronze match both losing
 * semi-finalists. Groups only: the first three of each group's table. A
 * place not decided yet is left out.
 */
export function placings(draft: PlanDraft, category: CategoryDraft): Placing[] {
  if (draft.format === "groups") {
    return groupTables(draft, category).flatMap((table) =>
      table.complete
        ? ([1, 2, 3] as const).flatMap((place) => {
            const ids = table.rows.filter((row) => row.place === place && !table.withdrawn.includes(row.id)).map((row) => row.id);
            return ids.length > 0 ? [{ place, entryIds: ids, group: table.letter }] : [];
          })
        : [],
    );
  }
  const out: Placing[] = [];
  const final = knockoutOutcome(draft, category, "Final");
  if (final) out.push({ place: 1, entryIds: [final.winner] }, { place: 2, entryIds: [final.loser] });
  const bronze = knockoutMatchOf(draft, category, "Bronze") ? knockoutOutcome(draft, category, "Bronze") : null;
  if (bronze) out.push({ place: 3, entryIds: [bronze.winner] });
  else if (!knockoutMatchOf(draft, category, "Bronze")) {
    const thirds = ["SF1", "SF2"].flatMap((code) => knockoutOutcome(draft, category, code)?.loser ?? []);
    if (final && thirds.length > 0) out.push({ place: 3, entryIds: thirds });
  }
  return out;
}

/** Games actually played: every game with a score, in every match that wasn't a walkover (a walkover's games are given, not played). */
export function gamesPlayed(draft: PlanDraft): number {
  let games = 0;
  for (const result of Object.values(draft.results)) {
    if (result.award?.reason === "walkover") continue;
    games += result.games.filter(([home, away]) => home !== null || away !== null).length;
  }
  return games;
}

export interface CourtDay {
  courtId: string;
  number: number;
  /** Matches played on it (walkovers with nothing played aren't). */
  played: number;
  /** Minutes its matches took, and the minutes it was booked for. */
  used: number;
  booked: number;
}

export interface DayReport {
  /** Minutes since midnight in the tournament's time zone; null where it isn't known. */
  plannedStart: number | null;
  start: number | null;
  plannedFinish: number | null;
  finish: number | null;
  /** Matches played on court, given as walkovers, ended by a retirement, and never played (voided). */
  played: number;
  walkovers: number;
  retirements: number;
  notPlayed: number;
  /** The matches that ran furthest past their slot, worst first. */
  overruns: { id: string; label: string; courtNumber: number; slot: number; took: number; over: number }[];
  courts: CourtDay[];
}

/** How the day ran against the plan, from each match's real start and finish and its planned slot. */
export function dayReport(draft: PlanDraft, games: ResultsGame[], minuteOf: (iso: string) => number | null): DayReport {
  const numberOf = new Map<string, number>();
  const booked = new Map<string, number>();
  draft.frame.halls.forEach((hall, h) =>
    hall.courts.forEach((court, c) => {
      numberOf.set(court.id, courtNumber(draft.frame.halls, h, c));
      const hours = courtHours(hall, court);
      const from = minutesOfDay(hours.from);
      const to = minutesOfDay(hours.to);
      booked.set(court.id, from !== null && to !== null ? Math.max(0, to - from) : 0);
    }),
  );
  const courts = new Map<string, CourtDay>(
    [...numberOf].map(([courtId, number]) => [courtId, { courtId, number, played: 0, used: 0, booked: booked.get(courtId) ?? 0 }]),
  );
  const report: DayReport = {
    plannedStart: games.length > 0 ? Math.min(...games.map((g) => g.from)) : null,
    start: draft.startedAt ? minuteOf(draft.startedAt) : null,
    plannedFinish: games.length > 0 ? Math.max(...games.map((g) => g.to)) : null,
    finish: null,
    played: 0,
    walkovers: 0,
    retirements: 0,
    notPlayed: 0,
    overruns: [],
    courts: [],
  };
  for (const game of games) {
    const result = draft.results[game.id];
    if (result?.state !== "finished") {
      report.notPlayed += 1;
      continue;
    }
    const ended = result.finishedAt ? minuteOf(result.finishedAt) : null;
    if (ended !== null) report.finish = Math.max(report.finish ?? -Infinity, ended);
    if (result.award?.reason === "walkover") {
      report.walkovers += 1;
      continue;
    }
    if (result.award?.reason === "retired") report.retirements += 1;
    report.played += 1;
    const began = result.startedAt ? minuteOf(result.startedAt) : null;
    const took = began !== null && ended !== null ? Math.max(0, ended - began) : null;
    const court = courts.get(game.courtId);
    if (court) {
      court.played += 1;
      court.used += took ?? 0;
    }
    const slot = game.to - game.from;
    if (took !== null && took > slot) {
      report.overruns.push({
        id: game.id,
        label: matchRef(draft, game.id)?.label ?? "A match",
        courtNumber: numberOf.get(game.courtId) ?? 0,
        slot,
        took,
        over: took - slot,
      });
    }
  }
  // The first match's start, where Start tournament wasn't pressed (a first game started by hand starts it anyway).
  if (report.start === null) {
    const starts = games.flatMap((g) => {
      const at = draft.results[g.id]?.startedAt;
      const minute = at ? minuteOf(at) : null;
      return minute === null ? [] : [minute];
    });
    report.start = starts.length > 0 ? Math.min(...starts) : null;
  }
  report.overruns = report.overruns.sort((a, b) => b.over - a.over).slice(0, 5);
  report.courts = [...courts.values()].sort((a, b) => a.number - b.number);
  return report;
}

/** One line of the money, planned and as it turned out. */
export interface MoneyLine {
  /** What it is, for the organiser's correction: "fee:<category>", "income:<id>", "hire", "shuttles", "prize:<id>", "cost:<id>". */
  key: string;
  label: string;
  side: "in" | "out";
  /** As planned on the expected numbers; null for a line the plan didn't have. */
  planned: number | null;
  /** Worked out from the day: real entries, games played, time booked. */
  worked: number;
  /** What counts: the organiser's correction where there is one, else the worked-out figure. */
  actual: number;
  corrected: boolean;
  /** Shuttles are corrected as a number used, not as money: the number worked out, the number that counts, and each one's cost. */
  shuttles?: { worked: number; actual: number; each: number };
}

export interface MoneyReport {
  lines: MoneyLine[];
  planned: { moneyIn: number; costs: number; profit: number } | null;
  actual: { moneyIn: number; costs: number; profit: number };
}

/** The finance of the day as it was: the real entries (as the inputs past the Plan stage already hold them) and the games actually played. */
export function workedFinance(draft: PlanDraft, inputs: TournamentInputs): FinanceResult {
  return finance(inputs.finance, {
    categories: inputs.categories,
    halls: inputs.frame.halls,
    games: gamesPlayed(draft),
    umpires: totalUmpires(inputs.frame.halls),
  });
}

const PLACE_NAMES = ["1st", "2nd", "3rd"];

/**
 * The money, plan beside actual. `planned` is the plan on its expected
 * numbers (null if that plan can't be read); `worked` is the day as it was.
 * A correction in `draft.actuals` replaces a line's worked-out figure: an
 * amount for every line but shuttles, which are corrected as a number used.
 */
export function moneyReport(draft: PlanDraft, planned: FinanceResult | null, worked: FinanceResult): MoneyReport {
  const several = draft.categories.length > 1;
  const lines: MoneyLine[] = [];
  const corrected = (key: string): number | null => {
    const value = draft.actuals[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  };
  const add = (key: string, label: string, side: "in" | "out", plannedAmount: number | null, workedAmount: number) => {
    const own = corrected(key);
    lines.push({ key, label, side, planned: plannedAmount, worked: workedAmount, actual: own ?? workedAmount, corrected: own !== null });
  };
  for (const revenue of worked.revenueByCategory) {
    const before = planned?.revenueByCategory.find((r) => r.categoryId === revenue.categoryId);
    add(`fee:${revenue.categoryId}`, several ? `Entry fees: ${categoryLabel(draft, revenue.categoryId)}` : "Entry fees", "in", before?.amount ?? null, revenue.amount);
  }
  for (const income of worked.otherIncome) {
    add(`income:${income.id}`, income.label || "Other money in", "in", planned?.otherIncome.find((i) => i.id === income.id)?.amount ?? null, income.amount);
  }
  add("hire", "Court hire", "out", planned?.courtHire.total ?? null, worked.courtHire.total);
  {
    const used = corrected("shuttles");
    const count = used ?? worked.shuttles;
    lines.push({
      key: "shuttles",
      label: "Shuttles",
      side: "out",
      planned: planned?.shuttleCost ?? null,
      worked: worked.shuttleCost,
      actual: count * worked.costPerShuttle,
      corrected: used !== null,
      shuttles: { worked: worked.shuttles, actual: count, each: worked.costPerShuttle },
    });
  }
  for (const prize of draft.finance.prizes) {
    if (prize.off || prize.amount === null) continue;
    const place = PLACE_NAMES.find((name) => name.toLowerCase() === prize.position.trim().toLowerCase()) ?? prize.position;
    add(`prize:${prize.id}`, `Prize: ${several ? `${categoryLabel(draft, prize.categoryId)}, ` : ""}${place}`, "out", prize.amount, prize.amount);
  }
  for (const cost of worked.otherCosts) {
    add(`cost:${cost.id}`, cost.label || "Other cost", "out", planned?.otherCosts.find((c) => c.id === cost.id)?.amount ?? null, cost.amount);
  }
  const sum = (side: "in" | "out", pick: (line: MoneyLine) => number) => lines.filter((l) => l.side === side).reduce((total, l) => total + pick(l), 0);
  const moneyIn = sum("in", (l) => l.actual);
  const costs = sum("out", (l) => l.actual);
  return {
    lines,
    planned: planned ? { moneyIn: planned.revenue, costs: planned.totalCost, profit: planned.profit } : null,
    actual: { moneyIn, costs, profit: moneyIn - costs },
  };
}

/** Whether a category's knockout exists at all (not groups only, and its format reads). */
export function hasKnockout(draft: PlanDraft, category: CategoryDraft): boolean {
  return draft.format !== "groups" && categoryFormatOf(draft, category).ok;
}

/** "Group A" for a groups-only placing's heading. */
export function placingGroupName(index: number): string {
  return `Group ${groupLetter(index)}`;
}
