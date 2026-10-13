import { playersPerCategoryEntry } from "./entry";
import type { Category, Finance, Hall, OtherCost, OtherIncome } from "./types";

const MS_PER_MINUTE = 60_000;

export interface FinanceContext {
  categories: Category[];
  /** The venue; every booked court hour is charged. */
  halls: Hall[];
  /** Games played across the tournament, at typical length. */
  games: number;
  umpires: number;
}

export interface CostLine {
  id: string;
  label: string;
  amount: number;
  /** Per-person costs: the rate and the headcount it was multiplied by. */
  perPerson?: { rate: number; basis: "players" | "umpires" | "custom"; headcount: number };
}

export interface IncomeLine {
  id: string;
  label: string;
  amount: number;
  /** Per-person income: the rate and the headcount it was multiplied by. */
  perPerson?: { rate: number; basis: "players" | "custom"; headcount: number };
}

export interface CategoryRevenue {
  categoryId: string;
  amount: number;
  /** The working: entrants in the fee basis unit, split by fee. */
  basis: "player" | "entry";
  /** Expected entries (players, pairs or teams) and players in each. */
  entries: number;
  playersPerEntry: number;
  /** Who pays: players, or entries, as the basis says. */
  entrants: number;
  external: number;
  fee: number;
  externalFee: number;
}

/** One court's hire within one rate band. */
export interface CourtHireBand {
  name: string;
  /** Booked minutes within the band. */
  minutes: number;
  /** Those minutes in the hall's units. */
  units: number;
  unitMinutes: number;
  /** Per court per unit. */
  rate: number;
  amount: number;
}

export interface CourtHireLine {
  hallId: string;
  courtId: string;
  bands: CourtHireBand[];
  amount: number;
}

export interface CourtHire {
  courts: CourtHireLine[];
  total: number;
}

/**
 * Court hire for the whole booking, court by court: the units of the court's
 * booked availability within each of its hall's rate bands, × that band's
 * rate per unit. The schema keeps booked time to whole units.
 * Booked time is charged whether or not matches use it, buffer included.
 */
export function courtHire(halls: Hall[]): CourtHire {
  const courts: CourtHireLine[] = [];
  for (const hall of halls) {
    for (const court of hall.courts) {
      const bookedFrom = Date.parse(court.from);
      const bookedTo = Date.parse(court.to);
      const bands = hall.bands
        .map((band) => {
          const overlap =
            Math.min(bookedTo, Date.parse(band.to)) - Math.max(bookedFrom, Date.parse(band.from));
          const minutes = Math.max(0, overlap) / MS_PER_MINUTE;
          const units = minutes / hall.unitMinutes;
          return {
            name: band.name,
            minutes,
            units,
            unitMinutes: hall.unitMinutes,
            rate: band.ratePerUnit,
            amount: units * band.ratePerUnit,
          };
        })
        .filter((b) => b.minutes > 0);
      courts.push({
        hallId: hall.id,
        courtId: court.id,
        bands,
        amount: bands.reduce((sum, b) => sum + b.amount, 0),
      });
    }
  }
  return { courts, total: courts.reduce((sum, c) => sum + c.amount, 0) };
}

export interface FinanceResult {
  /** Entry fees plus other money in. */
  revenue: number;
  /** Entry fees only. */
  entryRevenue: number;
  revenueByCategory: CategoryRevenue[];
  otherIncome: IncomeLine[];
  incomeTotal: number;
  games: number;
  shuttlesPerGame: number;
  costPerShuttle: number;
  shuttles: number;
  shuttleCost: number;
  courtHire: CourtHire;
  prizeCost: number;
  otherCosts: CostLine[];
  totalCost: number;
  /** Negative is a loss: the cost to the organisers. */
  profit: number;
}

export function playerCount(categories: Category[]): number {
  return categories.reduce((sum, c) => sum + c.expectedEntries * playersPerCategoryEntry(c), 0);
}

export function categoryRevenueWorking(category: Category): CategoryRevenue {
  const { fee } = category;
  const playersPerEntry = playersPerCategoryEntry(category);
  const entrants =
    fee.basis === "player" ? category.expectedEntries * playersPerEntry : category.expectedEntries;
  // External entries are counted in entries; a per-player fee counts their players.
  const external =
    Math.min(fee.expectedExternal, category.expectedEntries) * (fee.basis === "player" ? playersPerEntry : 1);
  const externalFee = fee.externalAmount ?? fee.amount;
  return {
    categoryId: category.id,
    amount: (entrants - external) * fee.amount + external * externalFee,
    basis: fee.basis,
    entries: category.expectedEntries,
    playersPerEntry,
    entrants,
    external,
    fee: fee.amount,
    externalFee,
  };
}

export function categoryRevenue(category: Category): number {
  return categoryRevenueWorking(category).amount;
}

function otherCostLine(cost: OtherCost, players: number, umpires: number): CostLine {
  if (cost.type === "fixed") {
    return { id: cost.id, label: cost.label, amount: cost.amount };
  }
  const headcount =
    cost.basis === "players"
      ? players
      : cost.basis === "umpires"
        ? umpires
        : (cost.count ?? 0);
  return {
    id: cost.id,
    label: cost.label,
    amount: cost.amount * headcount,
    perPerson: { rate: cost.amount, basis: cost.basis, headcount },
  };
}

function incomeLine(income: OtherIncome, players: number): IncomeLine {
  if (income.type === "fixed") {
    return { id: income.id, label: income.label, amount: income.amount };
  }
  const headcount = income.basis === "players" ? players : (income.count ?? 0);
  return {
    id: income.id,
    label: income.label,
    amount: income.amount * headcount,
    perPerson: { rate: income.amount, basis: income.basis, headcount },
  };
}

export function finance(inputs: Finance, context: FinanceContext): FinanceResult {
  const revenueByCategory = context.categories.map(categoryRevenueWorking);
  const entryRevenue = revenueByCategory.reduce((sum, r) => sum + r.amount, 0);

  const shuttles = context.games * inputs.shuttlesPerGame;
  const shuttleCost = shuttles * inputs.costPerShuttle;
  const prizeCost = inputs.prizes.reduce((sum, p) => sum + p.amount, 0);

  const players = playerCount(context.categories);
  const otherIncome = inputs.otherIncome.map((income) => incomeLine(income, players));
  const incomeTotal = otherIncome.reduce((sum, i) => sum + i.amount, 0);
  const revenue = entryRevenue + incomeTotal;
  const otherCosts = inputs.otherCosts.map((cost) =>
    otherCostLine(cost, players, context.umpires),
  );

  const hire = courtHire(context.halls);
  const totalCost =
    hire.total + shuttleCost + prizeCost + otherCosts.reduce((sum, c) => sum + c.amount, 0);

  return {
    revenue,
    entryRevenue,
    revenueByCategory,
    otherIncome,
    incomeTotal,
    games: context.games,
    shuttlesPerGame: inputs.shuttlesPerGame,
    costPerShuttle: inputs.costPerShuttle,
    shuttles,
    shuttleCost,
    courtHire: hire,
    prizeCost,
    otherCosts,
    totalCost,
    profit: revenue - totalCost,
  };
}
