import { describe, expect, it } from "vitest";
import { analyseTournament, suggestLevers, type LeverChange } from "@/engine";
import type { PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { applyLever } from "./levers";
import { parsePlan } from "./schema";

function analyse(draft: PlanDraft) {
  const parsed = parsePlan(draft);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const result = analyseTournament(parsed.inputs);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { inputs: parsed.inputs, analysis: result.analysis };
}

/** A plan that loses money, with costs and shuttles to cut. */
function losing(): PlanDraft {
  const draft = completeDraft();
  draft.categories[0]!.feeAmount = 1;
  draft.finance.shuttlesPerGame = 2;
  return draft;
}

/** A plan that needs more court time than the hall has. */
function short(): PlanDraft {
  const draft = completeDraft();
  draft.frame.halls[0]!.to = "12:00";
  draft.frame.halls[0]!.bands = [{ id: "b1", name: "", from: "09:00", to: "12:00", rate: 12 }];
  draft.frame.halls[0]!.multipleRates = false;
  draft.frame.halls[0]!.courts = draft.frame.halls[0]!.courts.map((c) => ({ ...c, from: null, to: null }));
  return draft;
}

describe("applyLever", () => {
  it("makes the same change to the draft as the lever made to the plan", () => {
    const kinds = new Set<LeverChange["kind"]>();
    for (const draft of [losing(), short()]) {
      const { inputs, analysis } = analyse(draft);
      for (const lever of suggestLevers(inputs, analysis)) {
        kinds.add(lever.change.kind);
        const after = analyse(applyLever(draft, lever.change)).analysis;
        expect(after.capacity.status, lever.change.kind).toBe(lever.outcome.status);
        expect(after.capacity.needed, lever.change.kind).toEqual(lever.outcome.needed);
        expect(after.finance.profit, lever.change.kind).toBeCloseTo(lever.outcome.profit, 2);
      }
    }
    // The sample plans exercise most kinds of lever.
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it("adds a court like the hall's last, following the hall's hours", () => {
    const draft = completeDraft();
    const after = applyLever(draft, { kind: "addCourt", hallId: "h1" });
    const courts = after.frame.halls[0]!.courts;
    expect(courts).toHaveLength(3);
    expect(courts[2]).toMatchObject({ from: null, to: null, umpires: 2 });
    expect(courts[2]!.id).not.toBe(courts[1]!.id);
  });

  it("raises the fee and the external fee to the penny", () => {
    const draft = completeDraft();
    const after = applyLever(draft, { kind: "breakEvenFee", categoryId: "c1", by: 0.1, basis: "player" });
    expect(after.categories[0]).toMatchObject({ feeAmount: 10.1, externalFeeAmount: 15.1 });
  });

  it("leaves the draft it was given unchanged", () => {
    const draft = completeDraft();
    const before = JSON.stringify(draft);
    applyLever(draft, { kind: "noBronze", categoryId: "c1" });
    applyLever(draft, { kind: "dropCost", costId: "o1", label: "Umpire food" });
    expect(JSON.stringify(draft)).toBe(before);
  });
});
