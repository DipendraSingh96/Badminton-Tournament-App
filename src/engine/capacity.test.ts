import { describe, expect, it } from "vitest";
import { available, capacity } from "./capacity";
import { at, hall } from "./fixtures.test-helpers";
import type { Frame } from "./types";

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    timeZone: "Europe/London",
    halls: [hall("h1", "08:00", "16:00", { courtCount: 4 })],
    bufferMinutes: 0,
    ...overrides,
  };
}

describe("available", () => {
  it("ends play at a pinned buffer's start, whatever the buffer length", () => {
    const pinned = available(frame({ bufferMinutes: 30, bufferStart: at("14:20") }));
    expect(pinned).toMatchObject({ minutes: 380, playingEnd: at("14:20"), courtMinutes: 4 * 380 });
  });

  it("adds up every court's time in the playing window", () => {
    expect(available(frame())).toMatchObject({ minutes: 480, courtMinutes: 1920 });
  });

  it("counts a narrower court only for its own availability", () => {
    const narrow = hall("h1", "08:00", "16:00", { courtCount: 2 });
    narrow.courts[1] = { ...narrow.courts[1]!, from: at("10:00"), to: at("14:00") };
    expect(available(frame({ halls: [narrow] })).courtMinutes).toBe(480 + 240);
  });

  it("runs the day across halls and holds the buffer back at the end of the whole day", () => {
    const result = available(
      frame({
        bufferMinutes: 60,
        halls: [hall("h1", "08:00", "16:00", { courtCount: 2 }), hall("h2", "09:00", "14:00", { courtCount: 1 })],
      }),
    );
    // Day 08:00 to 16:00, play ends 15:00. Hall 2 closes at 14:00, unaffected.
    expect(result).toMatchObject({ start: at("08:00"), dayEnd: at("16:00"), playingEnd: at("15:00"), minutes: 420 });
    expect(result.courtMinutes).toBe(2 * 420 + 300);
    expect(result.courts[0]).toMatchObject({ to: at("15:00"), clipped: true });
    expect(result.courts[2]).toMatchObject({ to: at("14:00"), clipped: false });
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
    const shorter = frame({ halls: [hall("h1", "08:00", "12:00", { courtCount: 4 })] });
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
