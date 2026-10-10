import type { Analysis, CategoryAnalysis, FormatType, MatchMinutes, TournamentInputs } from "@/engine";
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

// Capacity

export function playingTimeWorking(analysis: Analysis, inputs: TournamentInputs): string[] {
  const { frame } = inputs;
  const { available } = analysis.capacity;
  const clock = (iso: string) => formatClock(iso, frame.timeZone);
  const lines = [`Start ${clock(frame.start)}, end ${clock(frame.end)}`];
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
  const lines = available.windows.map(
    (w) =>
      `${clock(w.from)} to ${clock(w.to)}: ${formatMinutes(w.minutes)} × ${plural(w.courts, "court")} = ${formatMinutes(w.courtMinutes)}` +
      (w.clipped ? " (trimmed to the playing time)" : ""),
  );
  if (lines.length === 0) lines.push("No court windows fall inside the playing time");
  if (available.windows.length > 1) lines.push(`Total = ${formatMinutes(available.courtMinutes)}`);
  return lines;
}

export function neededWorking(analysis: Analysis, length: "typical" | "worst"): string[] {
  const lines = analysis.demand.map((d) => {
    const slot = analysis.matchMinutes[d.stage]![length];
    return `${STAGE_LABELS[d.stage]}: ${plural(d.matches, "match", "matches")} × ${formatNumber(slot)} min = ${exact(d[length])}`;
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

export function slotWorking(slot: MatchMinutes, length: "typical" | "worst"): string[] {
  const organising = `${formatMinutes(slot.changeoverMinutes)} organising`;
  if (length === "typical") {
    return [
      `${plural(slot.typicalGames, "game")} × ${formatMinutes(slot.minutesPerGame)} + ${organising} = ${formatMinutes(slot.typical)}` +
        (slot.typicalGames < slot.worstGames ? ` (best of ${slot.worstGames} usually takes ${slot.typicalGames} games)` : ""),
    ];
  }
  if (slot.maxPoints === slot.pointsPerGame) {
    return [
      `${plural(slot.worstGames, "game")} × ${formatMinutes(slot.minutesPerGame)} + ${organising} = ${formatMinutes(slot.worst)}`,
      "No deuce, so a game can't run past its target.",
    ];
  }
  const longestGame = (slot.minutesPerGame * slot.maxPoints) / slot.pointsPerGame;
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
  const { revenueByCategory, revenue } = analysis.finance;
  return [
    ...revenueByCategory.map((r) => `${categoryName(draft, r.categoryId)}: ${formatMoney(r.amount)}`),
    `Total = ${formatMoney(revenue)}`,
  ];
}

export function shuttleWorking(analysis: Analysis): string[] {
  const { finance } = analysis;
  const lines = analysis.demand.map((d) => {
    const perMatch = analysis.matchMinutes[d.stage]!.typicalGames;
    return `${STAGE_LABELS[d.stage]}: ${plural(d.matches, "match", "matches")} × ${plural(perMatch, "game")} = ${plural(d.games, "game")}`;
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
    lines.unshift("Players = entries × players in each (1 for singles, 2 for doubles, the squad for a team), across all categories");
  }
  return lines;
}

export function totalCostWorking(analysis: Analysis): string[] {
  const { finance } = analysis;
  return [
    `Shuttles ${formatMoney(finance.shuttleCost)}`,
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
