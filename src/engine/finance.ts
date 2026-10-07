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
}

export interface FinanceResult {
  revenue: number;
  revenueByCategory: { categoryId: string; amount: number }[];
  shuttles: number;
  shuttleCost: number;
  prizeCost: number;
  otherCosts: CostLine[];
  totalCost: number;
  /** Negative is a loss: the cost to the organisers. */
  profit: number;
}

export function playerCount(categories: Category[]): number {
  return categories.reduce((sum, c) => sum + c.expectedPairs * 2, 0);
}

export function categoryRevenue(category: Category): number {
  const { fee } = category;
  const entrants =
    fee.basis === "player" ? category.expectedPairs * 2 : category.expectedPairs;
  const external = Math.min(fee.expectedExternal, entrants);
  return (
    (entrants - external) * fee.amount +
    external * (fee.externalAmount ?? fee.amount)
  );
}

function otherCostAmount(
  cost: OtherCost,
  players: number,
  umpires: number,
): number {
  if (cost.type === "fixed") return cost.amount;
  const headcount =
    cost.basis === "players"
      ? players
      : cost.basis === "umpires"
        ? umpires
        : (cost.count ?? 0);
  return cost.amount * headcount;
}

export function finance(inputs: Finance, context: FinanceContext): FinanceResult {
  const revenueByCategory = context.categories.map((category) => ({
    categoryId: category.id,
    amount: categoryRevenue(category),
  }));
  const revenue = revenueByCategory.reduce((sum, r) => sum + r.amount, 0);

  const shuttles = context.games * inputs.shuttlesPerGame;
  const shuttleCost = shuttles * inputs.costPerShuttle;
  const prizeCost = inputs.prizes.reduce((sum, p) => sum + p.amount, 0);

  const players = playerCount(context.categories);
  const otherCosts = inputs.otherCosts.map((cost) => ({
    id: cost.id,
    label: cost.label,
    amount: otherCostAmount(cost, players, context.umpires),
  }));

  const totalCost =
    shuttleCost + prizeCost + otherCosts.reduce((sum, c) => sum + c.amount, 0);

  return {
    revenue,
    revenueByCategory,
    shuttles,
    shuttleCost,
    prizeCost,
    otherCosts,
    totalCost,
    profit: revenue - totalCost,
  };
}
