import { describe, expect, it } from "vitest";
import { available, capacity } from "./capacity";
import type { Frame } from "./types";

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    start: "2026-05-02T08:00:00Z",
    end: "2026-05-02T16:00:00Z",
    timeZone: "Europe/London",
    courtWindows: [
      { from: "2026-05-02T08:00:00Z", to: "2026-05-02T16:00:00Z", courts: 4 },
    ],
    umpires: 4,
    bufferMinutes: 0,
    ...overrides,
  };
}

describe("available", () => {
  it("multiplies time by courts", () => {
    expect(available(frame())).toEqual({ minutes: 480, courtMinutes: 1920 });
  });

  it("respects court windows that change during the day", () => {
    const result = available(
      frame({
        courtWindows: [
          { from: "2026-05-02T08:00:00Z", to: "2026-05-02T12:00:00Z", courts: 6 },
          { from: "2026-05-02T12:00:00Z", to: "2026-05-02T16:00:00Z", courts: 3 },
        ],
      }),
    );
    expect(result.courtMinutes).toBe(240 * 6 + 240 * 3);
  });

  it("clips windows to the playing window and holds back the buffer", () => {
    const result = available(
      frame({
        bufferMinutes: 60,
        courtWindows: [
          { from: "2026-05-02T07:00:00Z", to: "2026-05-02T17:00:00Z", courts: 2 },
        ],
      }),
    );
    expect(result).toEqual({ minutes: 420, courtMinutes: 840 });
  });
});

describe("capacity", () => {
  it("fits when even the worst case fits", () => {
    const result = capacity(frame(), { matches: 40, typical: 1200, worst: 1800 });
    expect(result.status).toBe("fits");
    expect(result.spare).toEqual({ typical: 720, worst: 120 });
    expect(result.levers).toEqual({ typical: null, worst: null });
  });

  it("flags a plan that only fits on a typical day", () => {
    const result = capacity(frame(), { matches: 40, typical: 1600, worst: 2400 });
    expect(result.status).toBe("fitsTypicalOnly");
    expect(result.levers.typical).toBeNull();
    expect(result.levers.worst).not.toBeNull();
  });

  it("flips to doesn't fit when time shrinks, and suggests levers", () => {
    const shorter = frame({ end: "2026-05-02T12:00:00Z" });
    const result = capacity(shorter, { matches: 40, typical: 1200, worst: 1600 });
    expect(result.status).toBe("doesNotFit");
    // 4 courts × 240 min = 960 available; 240 short at typical length.
    expect(result.levers.typical).toEqual({
      courtMinutes: 240,
      extraMinutes: 60,
      extraCourts: 1,
      fewerMatches: 8,
    });
  });
});
