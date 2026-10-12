import { describe, expect, it } from "vitest";
import { emptyCategory, emptyDraft } from "./draft";
import { migrateV3, migrateV4, type V4Draft } from "./migrate";
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
    const draft = migrateV4(migrateV3(v3Draft()));
    draft.frame.date = "2026-07-04";
    const result = parsePlan(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Only the unfinished, unrelated parts of the empty sample remain.
    expect(result.issues.some((i) => i.path[0] === "frame")).toBe(false);
  });
});

function v4Draft(): V4Draft {
  const { stageRules, rules: _rules, ...rest } = emptyDraft("Europe/London");
  const scoring = (stage: keyof typeof stageRules) => {
    const { minutesPerGame: _m, changeoverMinutes: _c, ...kept } = stageRules[stage];
    return { ...kept, pointsPerGame: 21 };
  };
  return {
    ...rest,
    unit: "individual",
    categories: [
      { ...emptyCategory(), id: "ms", event: "MS", feeBasis: "player", expectedExternal: 3 },
      { ...emptyCategory(), id: "md", event: "MD", feeBasis: "player", expectedExternal: 6 },
      { ...emptyCategory(), id: "xd", event: "XD", feeBasis: "entry", expectedExternal: 4 },
    ],
    stageRules: {
      group: scoring("group"),
      knockout: scoring("knockout"),
      bronze: scoring("bronze"),
      final: scoring("final"),
    },
    eventTiming: {
      MS: { minutesPerGame: 12, changeoverMinutes: 3 },
      MD: { minutesPerGame: 12, changeoverMinutes: 3 },
      XD: { minutesPerGame: 12, changeoverMinutes: 3 },
      // Not in use, so it doesn't count.
      WS: { minutesPerGame: 20, changeoverMinutes: 3 },
    },
  };
}

describe("migrateV4", () => {
  it("copies timing to every stage when every event in use agrees", () => {
    const draft = migrateV4(v4Draft());
    for (const stage of Object.values(draft.stageRules)) {
      expect(stage).toMatchObject({ pointsPerGame: 21, minutesPerGame: 12, changeoverMinutes: 3 });
    }
    expect(draft).not.toHaveProperty("eventTiming");
  });

  it("leaves stage timing empty when events in use differ", () => {
    const old = v4Draft();
    old.eventTiming!.MS = { minutesPerGame: 15, changeoverMinutes: 3 };
    const draft = migrateV4(old);
    expect(draft.stageRules.group).toMatchObject({ pointsPerGame: 21, minutesPerGame: null, changeoverMinutes: null });
  });

  it("counts external entrants in entries, not players", () => {
    const draft = migrateV4(v4Draft());
    // Singles per player: 3 players = 3 entries. Doubles per player: 6 players = 3 pairs. Per entry: unchanged.
    expect(draft.categories.map((c) => c.expectedExternal)).toEqual([3, 3, 4]);
  });

  it("gives a draft saved before rules existed empty rules", () => {
    const draft = migrateV4(v4Draft());
    expect(draft.rules.tiebreaks).toEqual([]);
    expect(draft.rules.withdrawal).toBeNull();
  });
});
