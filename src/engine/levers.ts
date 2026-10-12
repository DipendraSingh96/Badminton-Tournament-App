import { analyseTournament, type Analysis } from "./analyse";
import type { CapacityStatus } from "./capacity";
import { categoryRevenueWorking } from "./finance";
import { STAGES, type DeuceRule, type Stage, type TournamentInputs } from "./types";

// What-if suggestions: each re-runs the plan with one input changed. Only
// natural steps are used, so no step size is invented: a change that needs
// no new number, or the exact amount a target needs.

export type LeverChange =
  | { kind: "addCourt"; hallId: string }
  | { kind: "bestOfOne"; stage: Stage }
  | { kind: "noDeuce"; stage: Stage; from: Exclude<DeuceRule["type"], "none"> }
  /** One group more or fewer, when the number of groups is set. */
  | { kind: "groupCount"; categoryId: string; from: number; to: number }
  /** Preferred group size one larger or smaller, when groups are proposed from it. */
  | { kind: "groupSize"; categoryId: string; from: number; to: number }
  | { kind: "noBronze"; categoryId: string }
  /** The rise in fee (and external fee) that brings profit to zero, to the penny. */
  | { kind: "breakEvenFee"; categoryId: string; by: number; basis: "player" | "entry" }
  | { kind: "fewerShuttles"; from: number; to: number }
  | { kind: "dropCost"; costId: string; label: string };

export interface Outcome {
  status: CapacityStatus;
  /** Court time needed and spare, typical and worst case. */
  needed: { typical: number; worst: number };
  spare: { typical: number; worst: number };
  available: number;
  profit: number;
}

export interface Lever {
  change: LeverChange;
  outcome: Outcome;
  /** Change against the plan as it is. */
  delta: { neededTypical: number; neededWorst: number; available: number; profit: number };
  /** Spare court time gained on the measure that decides the plan's fit. */
  fitGain: number;
  improvesFit: boolean;
  improvesProfit: boolean;
}

function outcome(analysis: Analysis): Outcome {
  const { capacity, finance } = analysis;
  return {
    status: capacity.status,
    needed: capacity.needed,
    spare: capacity.spare,
    available: capacity.available.courtMinutes,
    profit: finance.profit,
  };
}

/** Rounds up to the penny, ignoring floating-point dust. */
function penniesUp(amount: number): number {
  return Math.ceil(Math.round(amount * 1e6) / 1e4) / 100;
}

/** Every candidate change with the inputs it produces. */
function candidates(inputs: TournamentInputs, base: Analysis): { change: LeverChange; inputs: TournamentInputs }[] {
  const out: { change: LeverChange; inputs: TournamentInputs }[] = [];

  for (const hall of inputs.frame.halls) {
    const last = hall.courts.at(-1);
    if (!last) continue;
    const extra = { ...last, id: `${hall.id}:lever-court`, from: hall.from, to: hall.to };
    out.push({
      change: { kind: "addCourt", hallId: hall.id },
      inputs: {
        ...inputs,
        frame: {
          ...inputs.frame,
          halls: inputs.frame.halls.map((h) => (h.id === hall.id ? { ...h, courts: [...h.courts, extra] } : h)),
        },
      },
    });
  }

  for (const stage of STAGES) {
    const rules = inputs.stageRules[stage];
    if (!rules || base.matches[stage] === 0) continue;
    if (rules.bestOf === 3) {
      out.push({
        change: { kind: "bestOfOne", stage },
        inputs: { ...inputs, stageRules: { ...inputs.stageRules, [stage]: { ...rules, bestOf: 1 } } },
      });
    }
    if (rules.deuce.type !== "none") {
      out.push({
        change: { kind: "noDeuce", stage, from: rules.deuce.type },
        inputs: { ...inputs, stageRules: { ...inputs.stageRules, [stage]: { ...rules, deuce: { type: "none" } } } },
      });
    }
  }

  const withCategory = (id: string, patch: Partial<TournamentInputs["categories"][number]>) => ({
    ...inputs,
    categories: inputs.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
  for (const category of inputs.categories) {
    const groups = inputs.format === "knockout" ? undefined : category.groups;
    // One step each way; a step the format can't make fails analysis and is left out.
    if (groups?.type === "fixed") {
      for (const to of [groups.groupCount - 1, groups.groupCount + 1]) {
        if (to < 1) continue;
        out.push({
          change: { kind: "groupCount", categoryId: category.id, from: groups.groupCount, to },
          inputs: withCategory(category.id, { groups: { type: "fixed", groupCount: to } }),
        });
      }
    }
    if (groups?.type === "auto") {
      for (const to of [groups.preferredSize - 1, groups.preferredSize + 1]) {
        if (to < 2) continue;
        out.push({
          change: { kind: "groupSize", categoryId: category.id, from: groups.preferredSize, to },
          inputs: withCategory(category.id, { groups: { type: "auto", preferredSize: to } }),
        });
      }
    }
    if (category.bronze && inputs.format !== "groups") {
      out.push({ change: { kind: "noBronze", categoryId: category.id }, inputs: withCategory(category.id, { bronze: false }) });
    }
  }

  if (base.finance.profit < 0) {
    for (const category of inputs.categories) {
      const { entrants } = categoryRevenueWorking(category);
      if (entrants === 0) continue;
      const by = penniesUp(-base.finance.profit / entrants);
      const { fee } = category;
      out.push({
        change: { kind: "breakEvenFee", categoryId: category.id, by, basis: fee.basis },
        inputs: withCategory(category.id, {
          fee: {
            ...fee,
            amount: fee.amount + by,
            externalAmount: fee.externalAmount === undefined ? undefined : fee.externalAmount + by,
          },
        }),
      });
    }
  }

  const shuttles = inputs.finance.shuttlesPerGame;
  const fewer = Number.isInteger(shuttles) ? shuttles - 1 : Math.floor(shuttles);
  if (fewer >= 1) {
    out.push({
      change: { kind: "fewerShuttles", from: shuttles, to: fewer },
      inputs: { ...inputs, finance: { ...inputs.finance, shuttlesPerGame: fewer } },
    });
  }

  for (const cost of inputs.finance.otherCosts) {
    out.push({
      change: { kind: "dropCost", costId: cost.id, label: cost.label },
      inputs: {
        ...inputs,
        finance: { ...inputs.finance, otherCosts: inputs.finance.otherCosts.filter((c) => c.id !== cost.id) },
      },
    });
  }
  return out;
}

/** The spare court time that decides fit: typical when it doesn't fit, worst case otherwise. */
function fitMeasure(status: CapacityStatus, o: Outcome): number {
  return status === "doesNotFit" ? o.spare.typical : o.spare.worst;
}

const PENNY = 0.005;

/**
 * Suggested levers for a complete plan. Each candidate is analysed in full;
 * those that fail, or improve neither fit nor profit, are left out. Levers
 * that improve fit come first, most court time gained first; then those
 * that only improve profit, most profit first.
 */
export function suggestLevers(inputs: TournamentInputs, base: Analysis): Lever[] {
  const before = outcome(base);
  const levers: Lever[] = [];
  for (const candidate of candidates(inputs, base)) {
    const result = analyseTournament(candidate.inputs);
    if (!result.ok) continue;
    const after = outcome(result.analysis);
    const fitGain = fitMeasure(before.status, after) - fitMeasure(before.status, before);
    const improvesFit = before.status !== "fits" && fitGain > 0;
    const improvesProfit = after.profit > before.profit + PENNY;
    if (!improvesFit && !improvesProfit) continue;
    levers.push({
      change: candidate.change,
      outcome: after,
      delta: {
        neededTypical: after.needed.typical - before.needed.typical,
        neededWorst: after.needed.worst - before.needed.worst,
        available: after.available - before.available,
        profit: after.profit - before.profit,
      },
      fitGain,
      improvesFit,
      improvesProfit,
    });
  }
  return levers.sort((a, b) => {
    if (a.improvesFit !== b.improvesFit) return a.improvesFit ? -1 : 1;
    return a.improvesFit ? b.fitGain - a.fitGain : b.delta.profit - a.delta.profit;
  });
}
