import { describe, expect, it } from "vitest";
import { assignGroupCourts, resolveGroupCourts } from "./court-groups";

const group = (groupIndex: number, courtMinutes: number, hallId = "h1", categoryId = "c1") => ({
  categoryId,
  groupIndex,
  courtMinutes,
  hallId,
});
const courts = (n: number, prefix = "k") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe("assignGroupCourts", () => {
  it("splits courts evenly between equal groups, each group's courts together", () => {
    const result = assignGroupCourts([group(0, 120), group(2, 120)], courts(4));
    expect(result.get("c1:0")).toEqual(["k1", "k2"]);
    expect(result.get("c1:2")).toEqual(["k3", "k4"]);
  });

  it("gives spare courts to the groups with the most court time per court", () => {
    const result = assignGroupCourts([group(0, 300), group(1, 100)], courts(4));
    expect(result.get("c1:0")).toEqual(["k1", "k2", "k3"]);
    expect(result.get("c1:1")).toEqual(["k4"]);
  });

  it("shares courts when there are more groups than courts, largest first onto the emptiest", () => {
    const result = assignGroupCourts([group(0, 100), group(1, 100), group(2, 100), group(3, 50), group(4, 50)], courts(3));
    expect(result.get("c1:0")).toEqual(["k1"]);
    expect(result.get("c1:1")).toEqual(["k2"]);
    expect(result.get("c1:2")).toEqual(["k3"]);
    expect(result.get("c1:3")).toEqual(["k1"]);
    expect(result.get("c1:4")).toEqual(["k2"]);
  });
});

describe("resolveGroupCourts", () => {
  const halls = [
    { hallId: "h1", courtIds: courts(4, "a") },
    { hallId: "h2", courtIds: courts(4, "b") },
  ];
  const groups = [group(0, 120), group(2, 120), group(1, 120, "h2"), group(3, 120, "h2")];

  it("splits each hall's courts between its groups", () => {
    const { courtsOf, homeless } = resolveGroupCourts(halls, groups);
    expect(courtsOf.get("c1:0")).toEqual(["a1", "a2"]);
    expect(courtsOf.get("c1:2")).toEqual(["a3", "a4"]);
    expect(courtsOf.get("c1:1")).toEqual(["b1", "b2"]);
    expect(homeless).toEqual([]);
  });

  it("adds a court given to a group, which keeps its other courts; the court's group loses it", () => {
    const { courtsOf } = resolveGroupCourts(halls, groups, new Map([["a4", "c1:0"]]));
    expect(courtsOf.get("c1:0")).toEqual(["a1", "a2", "a4"]);
    expect(courtsOf.get("c1:2")).toEqual(["a3"]);
  });

  it("gives a court to a group from another hall", () => {
    const { courtsOf } = resolveGroupCourts(halls, groups, new Map([["a3", "c1:1"]]));
    expect(courtsOf.get("c1:1")).toEqual(["a3", "b1", "b2"]);
    expect(courtsOf.get("c1:2")).toEqual(["a4"]);
  });

  it("leaves a court set to no group empty, the other courts as they were", () => {
    const { courtsOf } = resolveGroupCourts(halls, groups, new Map([["a2", ""]]));
    expect(courtsOf.get("c1:0")).toEqual(["a1"]);
    expect(courtsOf.get("c1:2")).toEqual(["a3", "a4"]);
    expect([...courtsOf.values()].flat()).not.toContain("a2");
  });

  it("reports a group left with no court and has it share the court carrying least", () => {
    const pins = new Map([
      ["a3", "c1:0"],
      ["a4", "c1:0"],
    ]);
    const { courtsOf, homeless } = resolveGroupCourts(halls, groups, pins);
    expect(courtsOf.get("c1:0")).toEqual(["a1", "a2", "a3", "a4"]);
    expect(homeless).toEqual([{ key: "c1:2", courtId: courtsOf.get("c1:2")![0] }]);
  });

  it("ignores pins to courts or groups that don't exist", () => {
    const pins = new Map([
      ["gone", "c1:0"],
      ["a1", "c1:9"],
    ]);
    expect(resolveGroupCourts(halls, groups, pins).courtsOf).toEqual(resolveGroupCourts(halls, groups).courtsOf);
  });
});
