import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { analyseTournament } from "@/engine";
import { emptyDraft, emptyEntry, type PlanDraft } from "../draft";
import { completeDraft } from "../draft.test-helpers";
import { drawSizes, lineUpComplete } from "../entries";
import { parsePlan } from "../schema";
import { fillPage, fillPlan } from "./fill";
import { removeDummy } from "./marks";

const options = { today: new Date(2026, 10, 4), randomSeed: 7 };

function fill(page: Parameters<typeof fillPage>[0], draft: PlanDraft): PlanDraft {
  const result = fillPage(page, draft, options);
  if (!result.ok) throw new Error(result.reason);
  return result.draft;
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
    expect(fillPage("plan", complete, options)).toEqual({ ok: false, reason: "Nothing left to fill on this page." });
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
    const drawn = fill("draw", entries);
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
    expect(fillPage("entries", emptyDraft("Europe/London"), options)).toMatchObject({ ok: false });
    expect(fillPage("teams", teamPlan(), options)).toEqual({
      ok: false,
      reason: "Add entries first, or fill the Entries page.",
    });
    const locked = produce(fill("draw", fill("entries", teamPlan())), (d) => {
      for (const draw of Object.values(d.draw)) draw.locked = true;
    });
    expect(fillPage("plan", locked, options)).toMatchObject({ ok: false });
    expect(fillPage("entries", locked, options)).toEqual({ ok: false, reason: "Nothing left to fill on this page." });
  });
});
