import { produce } from "immer";
import type { LeverChange } from "@/engine";
import { newId, type PlanDraft } from "./draft";

// Suggested levers (src/engine/levers.ts) describe one change to the plan's
// inputs. This makes the same change to the draft, so a lever can be
// previewed (applied to a copy) and kept (applied for real), and the organiser
// then sees and can edit the input it changed.

/** Pounds and pence, without floating-point dust. */
const toPennies = (amount: number) => Math.round(amount * 100) / 100;

/** The draft with a lever's change made; the draft passed in is left as it is. */
export function applyLever(draft: PlanDraft, change: LeverChange): PlanDraft {
  return produce(draft, (d) => {
    switch (change.kind) {
      case "addCourt": {
        // One more court like the hall's last, following the hall's hours.
        const hall = d.frame.halls.find((h) => h.id === change.hallId);
        const last = hall?.courts.at(-1);
        if (hall && last) hall.courts.push({ ...last, id: newId(), from: null, to: null });
        return;
      }
      case "bestOfOne":
        d.stageRules[change.stage].bestOf = 1;
        return;
      case "noDeuce":
        d.stageRules[change.stage].deuce = "none";
        return;
      case "groupCount": {
        const category = d.categories.find((c) => c.id === change.categoryId);
        if (category) {
          category.groupMode = "fixed";
          category.groupCount = change.to;
        }
        return;
      }
      case "groupSize": {
        const category = d.categories.find((c) => c.id === change.categoryId);
        if (category) {
          category.groupMode = "auto";
          category.preferredGroupSize = change.to;
        }
        return;
      }
      case "noBronze": {
        const category = d.categories.find((c) => c.id === change.categoryId);
        if (category) category.bronze = false;
        return;
      }
      case "breakEvenFee": {
        // The external fee rises by the same amount when there is one.
        const category = d.categories.find((c) => c.id === change.categoryId);
        if (!category) return;
        if (category.feeAmount !== null) category.feeAmount = toPennies(category.feeAmount + change.by);
        if (category.externalFeeAmount !== null) {
          category.externalFeeAmount = toPennies(category.externalFeeAmount + change.by);
        }
        return;
      }
      case "fewerShuttles":
        d.finance.shuttlesPerGame = change.to;
        return;
      case "dropCost":
        d.finance.otherCosts = d.finance.otherCosts.filter((c) => c.id !== change.costId);
        return;
    }
  });
}
