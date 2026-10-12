import { describe, expect, it } from "vitest";
import { distributeGroups, type GroupLoad } from "./distribution";

const group = (categoryId: string, groupIndex: number, courtMinutes: number): GroupLoad => ({
  categoryId,
  groupIndex,
  courtMinutes,
});

describe("distributeGroups", () => {
  it("shares whole groups in proportion to each hall's court time", () => {
    const groups = [0, 1, 2, 3, 4, 5].map((i) => group("md", i, 90));
    const halls = distributeGroups(groups, [
      { hallId: "h1", courtMinutes: 1200 },
      { hallId: "h2", courtMinutes: 600 },
    ]);
    expect(halls.map((h) => h.groups.length)).toEqual([4, 2]);
    expect(halls.map((h) => h.load)).toEqual([360, 180]);
    expect(halls[0]!.share).toBeCloseTo(2 / 3);
    expect(halls[0]!.target).toBeCloseTo(360);
  });

  it("places larger groups first and lists each hall's groups in order", () => {
    const groups = [group("md", 0, 90), group("md", 1, 90), group("ws", 0, 60), group("ws", 1, 60)];
    const halls = distributeGroups(groups, [
      { hallId: "h1", courtMinutes: 600 },
      { hallId: "h2", courtMinutes: 600 },
    ]);
    expect(halls.map((h) => h.groups.map((g) => `${g.categoryId}${g.groupIndex}`))).toEqual([
      ["md0", "ws0"],
      ["md1", "ws1"],
    ]);
  });

  it("gives no groups to a hall with no court time", () => {
    const halls = distributeGroups([group("md", 0, 90)], [
      { hallId: "h1", courtMinutes: 0 },
      { hallId: "h2", courtMinutes: 600 },
    ]);
    expect(halls.map((h) => h.groups.length)).toEqual([0, 1]);
  });
});
