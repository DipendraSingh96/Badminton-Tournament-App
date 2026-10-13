import type {
  Analysis,
  CategoryAnalysis,
  Lever,
  LeverChange,
  FormatType,
  MatchMinutes,
  Stage,
  TournamentInputs,
} from "@/engine";
import { EVENT_LABELS } from "@/lib/tournament/events";
import type { PlanDraft } from "@/lib/tournament/draft";
import { STAGE_LABELS, categoryName, formatMinutes, formatMoney } from "./labels";

// Step-by-step working behind each dashboard figure, built from the numbers
// the engine returns. One string per line.

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

/**
 * Minutes to two decimal places, so each line of working adds up exactly.
 * Long totals also show hours, e.g. "765.43 min (12 h 45 min)".
 */
function exact(minutes: number): string {
  const text = `${formatNumber(minutes)} min`;
  return Math.abs(minutes) >= 60 ? `${text} (${formatMinutes(minutes)})` : text;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** The slot length for a stage the analysis reported demand for. */
export function slotFor(analysis: Analysis, stage: Stage): MatchMinutes {
  return analysis.slots.find((s) => s.stage === stage)!.minutes;
}

/** "Hall 1, Court 3" for every court, numbered across the venue. */
function courtNames(inputs: TournamentInputs): Map<string, string> {
  const names = new Map<string, string>();
  let number = 0;
  for (const hall of inputs.frame.halls) {
    for (const court of hall.courts) {
      number += 1;
      names.set(court.id, `${hall.name}, Court ${number}`);
    }
  }
  return names;
}

// Capacity

export function playingTimeWorking(analysis: Analysis, inputs: TournamentInputs): string[] {
  const { frame } = inputs;
  const { available } = analysis.capacity;
  const clock = (iso: string) => formatClock(iso, frame.timeZone);
  const lines = [
    frame.halls.length > 1
      ? `Halls open from ${clock(available.start)}; the last closes at ${clock(available.dayEnd)}`
      : `Hall open ${clock(available.start)} to ${clock(available.dayEnd)}`,
  ];
  if (frame.bufferMinutes > 0) {
    lines.push(
      `Less ${formatMinutes(frame.bufferMinutes)} buffer held back, so play must end by ${clock(available.playingEnd)}`,
    );
  }
  lines.push(`${clock(available.start)} to ${clock(available.playingEnd)} = ${formatMinutes(available.minutes)}`);
  return lines;
}

export function courtTimeWorking(analysis: Analysis, inputs: TournamentInputs): string[] {
  const { available } = analysis.capacity;
  const clock = (iso: string) => formatClock(iso, inputs.frame.timeZone);
  const names = courtNames(inputs);
  const lines = available.courts.map(
    (c) =>
      `${names.get(c.courtId)}: ${clock(c.from)} to ${clock(c.to)} = ${formatMinutes(c.minutes)}` +
      (c.clipped ? " (trimmed to the playing time)" : ""),
  );
  if (lines.length === 0) lines.push("No courts are available in the playing time");
  if (available.courts.length > 1) lines.push(`Total = ${formatMinutes(available.courtMinutes)}`);
  return lines;
}

export function neededWorking(analysis: Analysis, length: "typical" | "worst"): string[] {
  const lines = analysis.demand.map((d) => {
    const slot = slotFor(analysis, d.stage);
    return `${STAGE_LABELS[d.stage]}, ${EVENT_LABELS[d.event].toLowerCase()}: ${plural(d.matches, "match", "matches")} × ${formatNumber(slot[length])} min (${slotSummary(slot, length)}) = ${exact(d[length])}`;
  });
  lines.push(`Total = ${exact(analysis.capacity.needed[length])}`);
  lines.push("Slot lengths are worked out under Matches.");
  return lines;
}

export function spareWorking(analysis: Analysis): string[] {
  const { capacity } = analysis;
  const spare = capacity.spare.worst;
  return [
    `${formatNumber(capacity.available.courtMinutes)} min available − ${formatNumber(capacity.needed.worst)} min needed at worst case`,
    `= ${exact(Math.abs(spare))} ${spare >= 0 ? "spare" : "short"}`,
  ];
}

// Matches

function percent(fraction: number): string {
  return `${formatNumber(fraction * 100)}%`;
}

function longestGameMinutes(slot: MatchMinutes): number {
  return (slot.minutesPerGame * slot.maxPoints) / slot.pointsPerGame;
}

/** One-line working for a slot length, e.g. "2 games × 12 min + 3 min + 33%". */
export function slotSummary(slot: MatchMinutes, length: "typical" | "worst"): string {
  if (length === "typical") {
    const base = `${plural(slot.baseGames, "game")} × ${formatNumber(slot.minutesPerGame)} min + ${formatNumber(slot.changeoverMinutes)} min`;
    if (slot.allowance === 0) return base;
    return `(${base}) + ${percent(slot.allowance)}${slot.capped ? ", capped at worst case" : ""}`;
  }
  return `${plural(slot.worstGames, "game")} × ${formatNumber(longestGameMinutes(slot))} min + ${formatNumber(slot.changeoverMinutes)} min`;
}

export function slotWorking(slot: MatchMinutes, length: "typical" | "worst"): string[] {
  const organising = `${formatMinutes(slot.changeoverMinutes)} organising`;
  if (length === "typical") {
    const base = `${plural(slot.baseGames, "game")} × ${formatMinutes(slot.minutesPerGame)} + ${organising} = ${formatNumber(slot.typicalBeforeAllowance)} min`;
    if (slot.worstGames === 1) return [base];
    if (slot.allowance === 0) return [`${base} (best of 3 counted as 2 games; no allowance set)`];
    return [
      `${base}, + ${percent(slot.allowance)} best-of-3 allowance for third games = ${formatNumber(slot.typicalBeforeAllowance * (1 + slot.allowance))} min` +
        (slot.capped ? `, capped at the worst case of ${formatNumber(slot.worst)} min` : ""),
    ];
  }
  if (slot.maxPoints === slot.pointsPerGame) {
    return [
      `${plural(slot.worstGames, "game")} × ${formatMinutes(slot.minutesPerGame)} + ${organising} = ${formatMinutes(slot.worst)}`,
      "No deuce, so a game can't run past its target.",
    ];
  }
  const longestGame = longestGameMinutes(slot);
  return [
    `Longest game: ${slot.maxPoints} points instead of ${slot.pointsPerGame}, so ${formatMinutes(slot.minutesPerGame)} × ${slot.maxPoints}/${slot.pointsPerGame} = ${formatNumber(longestGame)} min a game`,
    `${plural(slot.worstGames, "game")} × ${formatNumber(longestGame)} min + ${organising} = ${formatNumber(slot.worst)} min`,
  ];
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export function categoryMatchesWorking(category: CategoryAnalysis, formatType: FormatType): string[] {
  const { format, rubbersPerFixture } = category;
  const team = rubbersPerFixture > 1;
  const one = team ? "tie" : "match";
  const many = team ? "ties" : "matches";
  const lines: string[] = [];
  const counts = new Map<number, number>();
  for (const size of format.groupSizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  for (const [size, count] of counts) {
    const each = (size * (size - 1)) / 2;
    lines.push(
      `${plural(count, "group")} of ${size}: each plays ${size} × ${size - 1} ÷ 2 = ${plural(each, one, many)}, so ${count} × ${each} = ${count * each}`,
    );
  }
  const groups = format.groupSizes.length;
  if (formatType === "groupsKnockout") {
    lines.push(
      `${plural(groups, "group")} × ${format.qualifiers / groups} qualifiers = ${format.qualifiers} qualify`,
    );
  }
  const { knockout, bronze, final } = format.fixtures;
  if (formatType !== "groups") {
    const who = formatType === "knockout" ? "entries" : "qualifiers";
    if (final > 0) {
      const bracket = nextPowerOfTwo(format.qualifiers);
      lines.push(
        `Knockout: ${format.qualifiers} ${who} need ${format.qualifiers} − 1 = ${plural(knockout + final, one, many)} (${knockout} before the final, plus the final)` +
          (bracket > format.qualifiers ? `. Bracket of ${bracket}, so ${bracket - format.qualifiers} byes` : ""),
      );
    } else {
      lines.push(`Fewer than two ${who}, so no knockout`);
    }
    if (bronze > 0) lines.push(`Bronze: 1 ${one}`);
  }
  lines.push(`Total = ${plural(format.totalFixtures, one, many)}`);
  if (team) {
    lines.push(
      `Each tie is ${rubbersPerFixture} rubbers, all played: ${format.totalFixtures} × ${rubbersPerFixture} = ${plural(category.totalMatches, "match", "matches")}`,
    );
  }
  return lines;
}

// Finance

export function categoryRevenueWorking(
  revenue: Analysis["finance"]["revenueByCategory"][number],
  noun: string,
  nouns: string,
): string[] {
  const unit = revenue.basis === "player" ? "player" : noun;
  const internal = revenue.entrants - revenue.external;
  const lines = [
    revenue.basis === "player" && revenue.playersPerEntry > 1
      ? `${plural(revenue.entries, noun, nouns)} × ${revenue.playersPerEntry} players = ${plural(revenue.entrants, "player")}`
      : plural(revenue.entries, noun, nouns),
  ];
  if (revenue.external > 0) {
    lines.push(`${plural(internal, unit)} × ${formatMoney(revenue.fee)} = ${formatMoney(internal * revenue.fee)}`);
    lines.push(
      `${plural(revenue.external, `external ${unit}`)} × ${formatMoney(revenue.externalFee)} = ${formatMoney(revenue.external * revenue.externalFee)}`,
    );
  } else {
    lines.push(`${plural(internal, unit)} × ${formatMoney(revenue.fee)}`);
  }
  lines.push(`= ${formatMoney(revenue.amount)}`);
  return lines;
}

export function revenueWorking(analysis: Analysis, draft: PlanDraft): string[] {
  const { revenueByCategory, otherIncome, revenue } = analysis.finance;
  return [
    ...revenueByCategory.map((r) => `${categoryName(draft, r.categoryId)}: ${formatMoney(r.amount)}`),
    ...otherIncome.map((i) => `${i.label}: ${formatMoney(i.amount)}`),
    `Total = ${formatMoney(revenue)}`,
  ];
}

export function incomeWorking(income: Analysis["finance"]["otherIncome"][number]): string[] {
  if (!income.perPerson) return [];
  const { rate, basis, headcount } = income.perPerson;
  const lines = [
    `${plural(headcount, basis === "players" ? "player" : "person", basis === "custom" ? "people" : undefined)} × ${formatMoney(rate)} = ${formatMoney(income.amount)}`,
  ];
  if (basis === "players") {
    lines.unshift(
      "Players = entries × players in each (1 for singles, 2 for doubles; for a team, the players its line-up needs), across all categories",
    );
  }
  return lines;
}

const DEUCE_NAMES = { cap: "a points cap", standard: "win by two" } as const;

/** What a lever changes, in words. */
export function leverLabel(change: LeverChange, inputs: TournamentInputs, draft: PlanDraft): string {
  switch (change.kind) {
    case "addCourt":
      return `${inputs.frame.halls.find((h) => h.id === change.hallId)?.name ?? "Hall"}: one more court`;
    case "bestOfOne":
      return `${STAGE_LABELS[change.stage]}: best of 1 instead of best of 3`;
    case "noDeuce":
      return `${STAGE_LABELS[change.stage]}: no deuce instead of ${DEUCE_NAMES[change.from]}`;
    case "groupCount":
      return `${categoryName(draft, change.categoryId)}: ${change.to} groups instead of ${change.from}`;
    case "groupSize":
      return `${categoryName(draft, change.categoryId)}: preferred group size ${change.to} instead of ${change.from}`;
    case "noBronze":
      return `${categoryName(draft, change.categoryId)}: no bronze match`;
    case "breakEvenFee":
      return `${categoryName(draft, change.categoryId)}: fee ${formatMoney(change.by)} more per ${change.basis === "player" ? "player" : "entry"}`;
    case "fewerShuttles":
      return `${formatNumber(change.to)} ${change.to === 1 ? "shuttle" : "shuttles"} per game instead of ${formatNumber(change.from)}`;
    case "dropCost":
      return `Without ${change.label.toLowerCase()}`;
  }
}

function signed(text: string, value: number): string {
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

export function leverWorking(lever: Lever, before: Analysis): string[] {
  const { outcome, delta } = lever;
  const lines = [
    `Court time needed: ${formatMinutes(before.capacity.needed.typical)} → ${formatMinutes(outcome.needed.typical)} (${signed(formatMinutes(delta.neededTypical), delta.neededTypical)})`,
    `Worst case: ${formatMinutes(before.capacity.needed.worst)} → ${formatMinutes(outcome.needed.worst)} (${signed(formatMinutes(delta.neededWorst), delta.neededWorst)})`,
  ];
  if (delta.available !== 0) {
    lines.push(
      `Court time available: ${formatMinutes(before.capacity.available.courtMinutes)} → ${formatMinutes(outcome.available)} (${signed(formatMinutes(delta.available), delta.available)})`,
    );
  }
  lines.push(
    `Profit: ${formatMoney(before.finance.profit)} → ${formatMoney(outcome.profit)} (${signed(formatMoney(Math.abs(delta.profit)), delta.profit)})`,
  );
  if (lever.change.kind === "breakEvenFee") {
    lines.push("The fee rise is the loss divided by those paying, rounded up to the penny; external fees rise by the same.");
  }
  return lines;
}

export function shuttleWorking(analysis: Analysis): string[] {
  const { finance } = analysis;
  const lines = analysis.demand.map((d) => {
    const perMatch = slotFor(analysis, d.stage).typicalGames;
    return `${STAGE_LABELS[d.stage]}, ${EVENT_LABELS[d.event].toLowerCase()}: ${plural(d.matches, "match", "matches")} × ${plural(perMatch, "game")} = ${plural(d.games, "game")}`;
  });
  lines.push(
    `${plural(finance.games, "game")} × ${plural(finance.shuttlesPerGame, "shuttle")} = ${plural(finance.shuttles, "shuttle")}`,
    `${plural(finance.shuttles, "shuttle")} × ${formatMoney(finance.costPerShuttle)} = ${formatMoney(finance.shuttleCost)}`,
  );
  return lines;
}

export function prizeWorking(inputs: TournamentInputs, draft: PlanDraft): string[] {
  const { prizes } = inputs.finance;
  if (prizes.length === 0) return ["No prizes entered"];
  return [
    ...prizes.map((p) => `${categoryName(draft, p.categoryId)}, ${p.position}: ${formatMoney(p.amount)}`),
    `Total = ${formatMoney(prizes.reduce((sum, p) => sum + p.amount, 0))}`,
  ];
}

const BASIS_LABEL = { players: "player", umpires: "umpire", custom: "person" } as const;

export function otherCostWorking(cost: Analysis["finance"]["otherCosts"][number]): string[] {
  if (!cost.perPerson) return [];
  const { rate, basis, headcount } = cost.perPerson;
  const lines = [`${plural(headcount, BASIS_LABEL[basis], basis === "custom" ? "people" : undefined)} × ${formatMoney(rate)} = ${formatMoney(cost.amount)}`];
  if (basis === "players") {
    lines.unshift(
      "Players = entries × players in each (1 for singles, 2 for doubles; for a team, the players its line-up needs), across all categories",
    );
  }
  return lines;
}

export function courtHireWorking(analysis: Analysis, inputs: TournamentInputs): string[] {
  const { courtHire } = analysis.finance;
  const names = courtNames(inputs);
  const lines = courtHire.courts.map((c) => {
    const parts = c.bands.map((b) => `${formatNumber(b.units)} × ${formatMinutes(b.unitMinutes)} × ${formatMoney(b.rate)} (${b.name})`);
    return `${names.get(c.courtId)}: ${parts.length > 0 ? parts.join(" + ") : "no booked time"} = ${formatMoney(c.amount)}`;
  });
  if (courtHire.courts.length > 1) lines.push(`Total = ${formatMoney(courtHire.total)}`);
  lines.push("All booked time is charged, including the buffer at the end of the day.");
  return lines;
}

export function totalCostWorking(analysis: Analysis): string[] {
  const { finance } = analysis;
  return [
    `Court hire ${formatMoney(finance.courtHire.total)}`,
    `+ shuttles ${formatMoney(finance.shuttleCost)}`,
    `+ prizes ${formatMoney(finance.prizeCost)}`,
    ...finance.otherCosts.map((c) => `+ ${c.label} ${formatMoney(c.amount)}`),
    `= ${formatMoney(finance.totalCost)}`,
  ];
}

export function profitWorking(analysis: Analysis): string[] {
  const { finance } = analysis;
  return [
    `Revenue ${formatMoney(finance.revenue)} − total cost ${formatMoney(finance.totalCost)}`,
    `= ${finance.profit < 0 ? "−" : ""}${formatMoney(Math.abs(finance.profit))}`,
  ];
}
