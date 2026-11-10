import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { emptyDraft, emptyEntry, type PlanDraft } from "../draft";
import { completeDraft } from "../draft.test-helpers";
import { dummySummary, hasDummy, liveMarks, markDummy, removeDummy, sampleFields } from "./marks";

/** A stand-in fill: a fee, a court, two entries and a draw. */
function fakeFill(draft: PlanDraft): PlanDraft {
  return produce(draft, (d) => {
    const category = d.categories[0]!;
    category.externalFeeAmount ??= 9;
    d.frame.halls[0]!.courts.push({ id: "dummy-court", from: null, to: null, umpires: 1 });
    const a = { ...emptyEntry(category.id, 2), id: "dummy-a", name: "Smashers" };
    const b = { ...emptyEntry(category.id, 2), id: "dummy-b", name: "Net Ninjas" };
    d.entries.push(a, b);
    d.draw[category.id] = { groups: [d.entries.map((e) => e.id)], randomSeed: 1, locked: false };
    d.stage = "draw";
  });
}

function withOwnEntry(): PlanDraft {
  return produce(completeDraft(), (d) => {
    d.categories[0]!.externalFeeAmount = null;
    d.entries.push({ ...emptyEntry(d.categories[0]!.id, 2), id: "own", name: "Our club" });
  });
}

describe("dummy data marks", () => {
  it("records each field filled and each thing added", () => {
    const before = withOwnEntry();
    const after = markDummy(before, fakeFill(before));
    const live = liveMarks(after);
    expect(Object.keys(live.items)).toHaveLength(4); // the court, two entries and the draw
    expect(Object.keys(live.values)).toHaveLength(2); // the fee and the stage
    expect(hasDummy(after)).toBe(true);
    expect(dummySummary(after)).toBe("2 entries, 1 draw, 3 other values");
  });

  it("counts a stage's sample data and finds the first field of it", () => {
    const before = withOwnEntry();
    const after = markDummy(before, fakeFill(before));
    // The plan's: the fee and the court; the stage itself isn't counted.
    expect(sampleFields(after, "plan")).toEqual({ count: 2, first: ["categories", 0, "externalFeeAmount"] });
    expect(sampleFields(after, "draw").count).toBe(3);
    expect(sampleFields(before, "plan")).toEqual({ count: 0, first: null });
  });

  it("removes it all, leaving the organiser's own data as it was", () => {
    const before = withOwnEntry();
    const removed = removeDummy(markDummy(before, fakeFill(before)));
    expect(removed).toEqual(before);
    expect(hasDummy(removed)).toBe(false);
  });

  it("keeps what the organiser changed since, and clears a draw that held a removed entry", () => {
    const before = withOwnEntry();
    const filled = markDummy(before, fakeFill(before));
    const categoryId = before.categories[0]!.id;
    const edited = produce(filled, (d) => {
      d.entries.find((e) => e.id === "dummy-a")!.name = "Renamed";
      d.categories[0]!.externalFeeAmount = 12;
      d.draw[categoryId]!.locked = true;
    });
    const removed = removeDummy(edited);
    expect(removed.entries.map((e) => e.id)).toEqual(["own", "dummy-a"]);
    expect(removed.categories[0]!.externalFeeAmount).toBe(12);
    // The draw held "dummy-b", now gone: cleared, so no longer locked.
    expect(removed.draw[categoryId]).toBeUndefined();
    expect(removed.frame.halls[0]!.courts.some((c) => c.id === "dummy-court")).toBe(false);
  });

  it("doesn't count check-in as a change", () => {
    const before = withOwnEntry();
    const filled = markDummy(before, fakeFill(before));
    const checkedIn = produce(filled, (d) => {
      const entry = d.entries.find((e) => e.id === "dummy-a")!;
      entry.players.push({ id: "p", name: "", attendance: "notYet" });
    });
    // Adding a player is a change; checking one in is not.
    expect(removeDummy(checkedIn).entries.some((e) => e.id === "dummy-a")).toBe(true);
    const arrived = produce(filled, (d) => {
      for (const p of d.entries.find((e) => e.id === "dummy-a")!.players) p.attendance = "arrived";
    });
    expect(removeDummy(arrived).entries.some((e) => e.id === "dummy-a")).toBe(false);
  });

  it("keeps a dummy category that has the organiser's own entries", () => {
    const before = emptyDraft("Europe/London");
    const filled = markDummy(
      before,
      produce(before, (d) => {
        d.categories.push({ ...completeDraft().categories[0]!, id: "dummy-cat" });
      }),
    );
    const withEntry = produce(filled, (d) => {
      d.entries.push({ ...emptyEntry("dummy-cat", 2), id: "own" });
    });
    expect(removeDummy(withEntry).categories.map((c) => c.id)).toEqual(["dummy-cat"]);
    expect(removeDummy(filled).categories).toEqual([]);
  });

  it("fills on top of earlier dummy data and removes both", () => {
    const before = withOwnEntry();
    const first = markDummy(before, fakeFill(before));
    const second = markDummy(
      first,
      produce(first, (d) => {
        d.finance.shuttlesPerGame ??= 2;
        d.frame.bufferMinutes = 15;
      }),
    );
    const removed = removeDummy(second);
    expect(removed.finance.shuttlesPerGame).toBe(before.finance.shuttlesPerGame);
    expect(removed.frame.bufferMinutes).toBe(before.frame.bufferMinutes);
    expect(removed.entries.map((e) => e.id)).toEqual(["own"]);
  });
});
