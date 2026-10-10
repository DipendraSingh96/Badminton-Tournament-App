import { playersPerCategoryEntry } from "./entry";
import type { Category, Finance, OtherCost } from "./types";

export interface FinanceContext {
  categories: Category[];
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

export interface FinanceResult {
  revenue: number;
  revenueByCategory: CategoryRevenue[];
  games: number;
  shuttlesPerGame: number;
  costPerShuttle: number;
  shuttles: number;
  shuttleCost: number;
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
  const external = Math.min(fee.expectedExternal, entrants);
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

export function finance(inputs: Finance, context: FinanceContext): FinanceResult {
  const revenueByCategory = context.categories.map(categoryRevenueWorking);
  const revenue = revenueByCategory.reduce((sum, r) => sum + r.amount, 0);

  const shuttles = context.games * inputs.shuttlesPerGame;
  const shuttleCost = shuttles * inputs.costPerShuttle;
  const prizeCost = inputs.prizes.reduce((sum, p) => sum + p.amount, 0);

  const players = playerCount(context.categories);
  const otherCosts = inputs.otherCosts.map((cost) =>
    otherCostLine(cost, players, context.umpires),
  );

  const totalCost =
    shuttleCost + prizeCost + otherCosts.reduce((sum, c) => sum + c.amount, 0);

  return {
    revenue,
    revenueByCategory,
    games: context.games,
    shuttlesPerGame: inputs.shuttlesPerGame,
    costPerShuttle: inputs.costPerShuttle,
    shuttles,
    shuttleCost,
    prizeCost,
    otherCosts,
    totalCost,
    profit: revenue - totalCost,
  };
}
