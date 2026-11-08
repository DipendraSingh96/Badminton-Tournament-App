import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { analyseTournament } from "@/engine";
import { emptyDraft, emptyEntry, type PlanDraft } from "../draft";
import { completeDraft } from "../draft.test-helpers";
import { drawSizes, lineUpComplete } from "../entries";
import { parsePlan } from "../schema";
import { fillDraw, fillEntries, fillPlan, fillStage, fillTeams } from "./fill";
import { markDummy, ownDataLeft, removeDummy } from "./marks";

const options = { today: new Date(2026, 10, 4), randomSeed: 7 };

/** A stage's fill, or one of the Draw stage's parts on its own (marked as a fill would). */
function fill(part: "plan" | "draw" | "entries" | "drawOnly" | "teams", draft: PlanDraft): PlanDraft {
  if (part === "plan" || part === "draw") {
    const result = fillStage(part, draft, options);
    if (!result.ok) throw new Error(result.reason);
    return result.draft;
  }
  const filled = part === "entries" ? fillEntries(draft) : part === "drawOnly" ? fillDraw(draft, 7) : fillTeams(draft, 7);
  return markDummy(draft, filled);
}

function validPlan(draft: PlanDraft) {
  const parsed = parsePlan(draft);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues.slice(0, 3)));
  return analyseTournament(parsed.inputs);
}

describe("fill the Plan stage", () => {
  it("makes a complete, valid plan from an empty one, dated the next Saturday", () => {
    const filled = fill("plan", emptyDraft("Europe/London"));
    expect(validPlan(filled).ok).toBe(true);
    expect(filled.frame.date).toBe("2026-11-07");
    expect(filled.frame.halls[0]!.courts.length).toBeGreaterThan(1);
  });

  it("works for teams too", () => {
    const filled = fill("plan", { ...emptyDraft("Europe/London"), unit: "team" });
    expect(validPlan(filled).ok).toBe(true);
    expect(filled.categories[0]!.name).not.toBe("");
  });

  it("removes back to the empty plan", () => {
    const empty = emptyDraft("Europe/London");
    expect(removeDummy(fill("plan", empty))).toEqual(empty);
  });

  it("only fills what's empty", () => {
    const own = produce(completeDraft(), (d) => {
      d.categories[0]!.feeAmount = null;
      d.frame.bufferMinutes = null;
    });
    const filled = fill("plan", own);
    // Everything entered stays; only the two gaps are filled.
    expect(filled.frame.halls).toEqual(own.frame.halls);
    expect(filled.categories[0]).toEqual({ ...own.categories[0], feeAmount: filled.categories[0]!.feeAmount });
    expect(filled.categories[0]!.feeAmount).not.toBeNull();
    expect(filled.frame.bufferMinutes).not.toBeNull();
    expect(validPlan(filled).ok).toBe(true);
    expect(removeDummy(filled)).toEqual(own);
  });

  it("has nothing to fill in a complete plan", () => {
    const complete = fillPlan(emptyDraft("Europe/London"), options.today);
    expect(fillStage("plan", complete, options)).toEqual({ ok: false, reason: "Nothing left to fill in Plan." });
  });
});

describe("fill the Draw stage", () => {
  function teamPlan(): PlanDraft {
    return { ...fill("plan", { ...emptyDraft("Europe/London"), unit: "team" }), stage: "draw" };
  }

  it("fills entries up to the expected number, with players, line-ups and seeds", () => {
    const plan = teamPlan();
    const category = plan.categories[0]!;
    const withOwn = produce(plan, (d) => {
      d.entries.push({ ...emptyEntry(category.id, 1), id: "own", name: "Our club" });
    });
    const filled = fill("entries", withOwn);
    const entries = filled.entries.filter((e) => e.categoryId === category.id);
    expect(entries).toHaveLength(category.expectedEntries!);
    expect(entries.every((e) => lineUpComplete(filled, e, category))).toBe(true);
    expect(entries.every((e) => e.name !== "" && e.players.every((p) => p.name !== ""))).toBe(true);
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
    // The organiser's entry keeps its name and gets the players it lacked.
    expect(entries[0]).toMatchObject({ id: "own", name: "Our club", seed: null });
    const sizes = drawSizes(filled, category);
    expect(entries.filter((e) => e.seed !== null)).toHaveLength(sizes.ok ? sizes.sizes.length : -1);

    // Removing leaves the organiser's entry as it was.
    expect(removeDummy(filled).entries).toEqual(withOwn.entries);
  });

  it("makes the draw, then check-in, and removes both with the entries", () => {
    const plan = teamPlan();
    const entries = fill("entries", plan);
    const drawn = fill("drawOnly", entries);
    const category = plan.categories[0]!;
    expect(drawn.draw[category.id]).toMatchObject({ locked: false });
    expect(drawn.draw[category.id]!.groups.flat()).toHaveLength(category.expectedEntries!);
    const checkedIn = fill("teams", drawn);
    const players = checkedIn.entries.flatMap((e) => e.players);
    expect(players.some((p) => p.attendance === "arrived")).toBe(true);

    const removed = removeDummy(checkedIn);
    expect(removed.entries).toEqual([]);
    expect(removed.draw).toEqual({});
    expect(removed.stage).toBe("plan");
    // The plan was dummy too: everything goes, back to a new tournament.
    expect(removed.categories).toEqual([]);
    expect(removed.name).toBe("");
  });

  it("says why when there's nothing to fill", () => {
    expect(fillStage("draw", emptyDraft("Europe/London"), options)).toMatchObject({ ok: false });
    const locked = produce(fill("draw", teamPlan()), (d) => {
      for (const draw of Object.values(d.draw)) draw.locked = true;
    });
    expect(fillStage("plan", locked, options)).toMatchObject({ ok: false });
    expect(fillStage("draw", locked, options)).toEqual({ ok: false, reason: "Nothing left to fill in Draw." });
  });

  it("fills the whole Draw stage at once: entries, then the draw", () => {
    const filled = fill("draw", teamPlan());
    const category = filled.categories[0]!;
    expect(filled.entries).toHaveLength(category.expectedEntries!);
    expect(filled.draw[category.id]).toMatchObject({ locked: false });
    expect(filled.entries.flatMap((e) => e.players).every((p) => p.attendance === "notYet")).toBe(true);
  });

  it("removes one stage's sample data and keeps the other's", () => {
    const both = fill("draw", fill("plan", { ...emptyDraft("Europe/London"), unit: "team", stage: "draw" }));
    const drawGone = removeDummy(both, "draw");
    expect(drawGone.entries).toEqual([]);
    expect(drawGone.draw).toEqual({});
    expect(drawGone.categories).toEqual(both.categories);
    // The plan's sample data is still sample data, and goes when the plan's is removed.
    expect(removeDummy(drawGone, "plan").categories).toEqual([]);

    // Removing the plan's first: the categories hold sample entries, so they stay; the entries stay sample.
    const planGone = removeDummy(both, "plan");
    expect(planGone.entries).toEqual(both.entries);
    expect(planGone.name).toBe("");
    expect(removeDummy(planGone, "draw").entries).toEqual([]);
  });

  it("knows when a stage holds the organiser's own data", () => {
    const sample = fill("draw", fill("plan", { ...emptyDraft("Europe/London"), stage: "draw" }));
    expect(ownDataLeft(sample, "draw")).toBe(false);
    expect(ownDataLeft(sample, "plan")).toBe(false);
    const withOwn = produce(sample, (d) => {
      d.entries.push({ ...emptyEntry(d.categories[0]!.id, 2), id: "own", name: "Our club" });
    });
    expect(ownDataLeft(withOwn, "draw")).toBe(true);
    expect(ownDataLeft(produce(sample, (d) => void (d.unit = "team")), "plan")).toBe(true);
  });
});
