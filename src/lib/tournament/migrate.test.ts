import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { migrateV3 } from "./migrate";
import { parsePlan } from "./schema";

function v3Draft() {
  const { frame, ...rest } = emptyDraft("Europe/London");
  return {
    ...rest,
    frame: {
      date: frame.date,
      timeZone: frame.timeZone,
      startTime: "09:00",
      endTime: "17:00",
      courtWindows: [
        { id: "w1", from: "09:00", to: "13:00", courts: 6, rate: 12 },
        { id: "w2", from: "13:00", to: "17:00", courts: 4, rate: 9.5 },
      ],
      umpires: 6,
      bufferMinutes: 30,
    },
  };
}

describe("migrateV3", () => {
  it("turns each court window into a hall with one band and its courts", () => {
    const draft = migrateV3(v3Draft());
    expect(draft.frame.halls).toHaveLength(2);
    const [first, second] = draft.frame.halls;
    expect(first).toMatchObject({ from: "09:00", to: "13:00" });
    expect(first!.bands).toEqual([expect.objectContaining({ from: "09:00", to: "13:00", rate: 12 })]);
    expect(first!.courts).toHaveLength(6);
    expect(first!.courts[0]).toMatchObject({ from: null, to: null });
    expect(second!.bands[0]!.rate).toBe(9.5);
    expect(second!.courts).toHaveLength(4);
    expect(draft.frame.bufferMinutes).toBe(30);
    expect(draft.frame).not.toHaveProperty("startTime");
  });

  it("shares the old umpire total across the courts, earlier courts first", () => {
    const umpires = migrateV3(v3Draft()).frame.halls.flatMap((h) => h.courts.map((c) => c.umpires));
    expect(umpires).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
  });

  it("produces a draft the schema reads", () => {
    const draft = migrateV3(v3Draft());
    draft.frame.date = "2026-07-04";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Only the unfinished, unrelated parts of the empty sample remain.
    expect(result.issues.some((i) => i.path[0] === "frame")).toBe(false);
  });
});
