import { describe, expect, it } from "vitest";
import { assignGroupCourts } from "./court-groups";

const group = (groupIndex: number, courtMinutes: number, categoryId = "c1") => ({ categoryId, groupIndex, courtMinutes });
const courts = (n: number) => Array.from({ length: n }, (_, i) => `k${i + 1}`);

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

  it("hands a pinned court to its group and leaves the other courts as they were", () => {
    const pins = new Map([["k3", "c1:0"]]);
    const result = assignGroupCourts([group(0, 120), group(1, 120)], courts(4), pins);
    expect(result.get("c1:0")).toEqual(["k1", "k2", "k3"]);
    expect(result.get("c1:1")).toEqual(["k4"]);
  });

  it("ignores pins to groups or courts not in the hall", () => {
    const pins = new Map([
      ["k1", "c1:9"],
      ["elsewhere", "c1:0"],
    ]);
    const result = assignGroupCourts([group(0, 120), group(1, 120)], courts(2), pins);
    expect(result.get("c1:0")).toEqual(["k1"]);
    expect(result.get("c1:1")).toEqual(["k2"]);
  });

  it("puts a group with no court left on the least-carrying court", () => {
    const pins = new Map([
      ["k1", "c1:0"],
      ["k2", "c1:0"],
    ]);
    const result = assignGroupCourts([group(0, 120), group(1, 60)], courts(2), pins);
    expect(result.get("c1:0")).toEqual(["k1", "k2"]);
    expect(result.get("c1:1")).toHaveLength(1);
  });
});
