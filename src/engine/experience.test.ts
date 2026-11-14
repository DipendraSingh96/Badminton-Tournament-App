import { describe, expect, it } from "vitest";
import { matchesPlayed } from "./experience";
import { categoryFormat } from "./format";
import type { FormatType, GroupMode } from "./types";

function played(entries: number, format: FormatType, options: { groups?: GroupMode; qualifiers?: number; bronze?: boolean } = {}) {
  const result = categoryFormat(
    { expectedEntries: entries, groups: options.groups, qualifiersPerGroup: options.qualifiers, bronze: options.bronze ?? false },
    format,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return matchesPlayed(result.format);
}

/** "group 24>8 @2": the step, who plays it, whose day ends there, and the matches they have played. */
const brief = (sections: ReturnType<typeof matchesPlayed>) =>
  sections.map((s) => {
    const name = s.step.type === "round" ? `r${s.step.size}` : s.step.type;
    const matches = s.matches.min === s.matches.max ? `${s.matches.min}` : `${s.matches.min}-${s.matches.max}`;
    return `${name} ${s.playing}>${s.ending} @${matches}`;
  });

describe("matchesPlayed", () => {
  const eightGroups: GroupMode = { type: "fixed", groupCount: 8 };

  it("24 teams in 8 groups of 3, 2 through, with a bronze match", () => {
    expect(brief(played(24, "groupsKnockout", { groups: eightGroups, qualifiers: 2, bronze: true }))).toEqual([
      "group 24>8 @2",
      "r16 16>8 @3",
      "r8 8>4 @4",
      "semi 4>0 @5",
      "finalBronze 4>4 @6",
    ]);
    // The last four's share of the bar is split evenly between the semi-finals and the end.
    expect(played(24, "groupsKnockout", { groups: eightGroups, qualifiers: 2, bronze: true }).map((s) => s.share)).toEqual([8, 8, 4, 2, 2]);
  });

  it("splits the end into semi-finals and final without a bronze match", () => {
    expect(brief(played(24, "groupsKnockout", { groups: eightGroups, qualifiers: 2 }))).toEqual([
      "group 24>8 @2",
      "r16 16>8 @3",
      "r8 8>4 @4",
      "semi 4>2 @5",
      "final 2>2 @6",
    ]);
  });

  it("starts the knockout later with one through from each group", () => {
    expect(brief(played(24, "groupsKnockout", { groups: eightGroups, qualifiers: 1, bronze: true }))).toEqual([
      "group 24>16 @2",
      "r8 8>4 @3",
      "semi 4>0 @4",
      "finalBronze 4>4 @5",
    ]);
  });

  it("gives a range where groups are of unequal size", () => {
    // 14 entries in 4 groups: 4, 4, 3, 3.
    expect(brief(played(14, "groupsKnockout", { groups: { type: "fixed", groupCount: 4 }, qualifiers: 2 }))).toEqual([
      "group 14>6 @2-3",
      "r8 8>4 @3-4",
      "semi 4>2 @4-5",
      "final 2>2 @5-6",
    ]);
  });

  it("gives a range past the first round where seeds had a bye", () => {
    // 6 in a bracket of 8: two byes; four play the first round.
    expect(brief(played(6, "knockout", { bronze: true }))).toEqual(["r8 4>2 @1", "semi 4>0 @1-2", "finalBronze 4>4 @2-3"]);
    expect(brief(played(6, "knockout"))).toEqual(["r8 4>2 @1", "semi 4>2 @1-2", "final 2>2 @2-3"]);
  });

  it("is one section for groups only, and has no group section for knockout only", () => {
    expect(brief(played(12, "groups", { groups: { type: "fixed", groupCount: 3 } }))).toEqual(["group 12>12 @3"]);
    expect(brief(played(8, "knockout"))).toEqual(["r8 8>4 @1", "semi 4>2 @2", "final 2>2 @3"]);
    expect(brief(played(2, "knockout"))).toEqual(["final 2>2 @1"]);
  });

  it("always accounts for every entry", () => {
    for (let entries = 2; entries <= 40; entries++) {
      for (const bronze of [false, true]) {
        expect(played(entries, "knockout", { bronze }).reduce((sum, s) => sum + s.ending, 0)).toBe(entries);
      }
      for (let groupCount = 1; groupCount <= entries / 2; groupCount++) {
        for (const qualifiers of [1, 2]) {
          const result = categoryFormat({ expectedEntries: entries, groups: { type: "fixed", groupCount }, qualifiersPerGroup: qualifiers, bronze: true }, "groupsKnockout");
          if (!result.ok) continue;
          const sections = matchesPlayed(result.format);
          expect(sections.reduce((sum, s) => sum + s.ending, 0)).toBe(entries);
          expect(sections.reduce((sum, s) => sum + s.share, 0)).toBe(entries);
          expect(sections.every((s) => s.matches.min <= s.matches.max && s.matches.min >= 1)).toBe(true);
        }
      }
    }
  });
});
