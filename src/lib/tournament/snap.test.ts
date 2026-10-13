import { describe, expect, it } from "vitest";
import { drawWindow, moveBoundary, moveEnd, moveStart, moveWindow, pinBuffer, stepOf } from "./snap";

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

describe("drawWindow", () => {
  it("starts on the 10-minute grid and lasts whole units", () => {
    // From about 09:03 to 15:50 with 40-minute units: 09:00 + 10 × 40 = 15:40.
    expect(drawWindow(t("09:03"), t("15:50"), 40)).toEqual({ from: t("09:00"), to: t("15:40") });
    expect(drawWindow(t("09:06"), t("12:00"), 60)).toEqual({ from: t("09:10"), to: t("12:10") });
    expect(drawWindow(t("09:00"), t("10:50"), 30)).toEqual({ from: t("09:00"), to: t("11:00") });
  });

  it("draws leftwards too, and is never empty", () => {
    expect(drawWindow(t("12:00"), t("10:10"), 40)).toEqual({ from: t("10:00"), to: t("12:00") });
    expect(drawWindow(t("12:00"), t("12:05"), 40)).toEqual({ from: t("12:00"), to: t("12:40") });
  });

  it("stays within the day", () => {
    expect(drawWindow(t("23:00"), t("23:59"), 40)).toEqual({ from: t("23:00"), to: t("23:40") });
  });

  it("uses the drawing grid until the unit is set", () => {
    expect(stepOf(null)).toBe(10);
    expect(drawWindow(t("09:00"), t("09:34"), null)).toEqual({ from: t("09:00"), to: t("09:30") });
  });
});

describe("moving a window", () => {
  const hall = { from: t("09:00"), to: t("15:40") };

  it("moves the end in whole units from the start", () => {
    expect(moveEnd(hall, t("17:10"), 40)).toEqual({ from: t("09:00"), to: t("17:00") });
    expect(moveEnd(hall, t("08:00"), 40)).toEqual({ from: t("09:00"), to: t("09:40") });
  });

  it("moves the start in whole units from the end", () => {
    expect(moveStart(hall, t("08:10"), 40)).toEqual({ from: t("08:20"), to: t("15:40") });
    expect(moveStart(hall, t("16:00"), 40)).toEqual({ from: t("15:00"), to: t("15:40") });
  });

  it("moves the whole window in whole units", () => {
    expect(moveWindow(hall, 55, 40)).toEqual({ from: t("09:40"), to: t("16:20") });
    expect(moveWindow(hall, -20, 30)).toEqual({ from: t("08:30"), to: t("15:10") });
    expect(moveWindow(hall, -10, 30)).toEqual(hall);
    expect(moveWindow({ from: 20, to: 140 }, -200, 40)).toEqual({ from: 20, to: 140 });
  });

  it("keeps within bounds, e.g. a court within its hall", () => {
    const bounds = { min: t("09:00"), max: t("15:40") };
    expect(moveWindow({ from: t("10:20"), to: t("14:20") }, 300, 40, bounds)).toEqual({
      from: t("11:40"),
      to: t("15:40"),
    });
    expect(moveStart({ from: t("10:20"), to: t("14:20") }, t("06:00"), 40, bounds)).toEqual({
      from: t("09:00"),
      to: t("14:20"),
    });
  });
});

describe("moveBoundary", () => {
  it("snaps to whole units from the hall's opening, between its neighbours", () => {
    const open = t("09:00");
    expect(moveBoundary(t("15:25"), open, 40, { min: t("09:40"), max: t("17:00") })).toBe(t("15:40"));
    expect(moveBoundary(t("15:15"), open, 40, { min: t("09:40"), max: t("17:00") })).toBe(t("15:00"));
    expect(moveBoundary(t("15:25"), open, 30, { min: t("09:30"), max: t("17:00") })).toBe(t("15:30"));
    expect(moveBoundary(t("07:00"), open, 40, { min: t("09:40"), max: t("17:00") })).toBe(t("09:40"));
    expect(moveBoundary(t("20:00"), open, 40, { min: t("09:40"), max: t("17:10") })).toBe(t("16:20"));
  });
});

describe("pinBuffer", () => {
  it("starts on the drawing grid and lasts whole units", () => {
    expect(pinBuffer(t("16:13"), 30, 40)).toEqual({ from: t("16:10"), to: t("16:50") });
    expect(pinBuffer(t("16:00"), 90, 30)).toEqual({ from: t("16:00"), to: t("17:30") });
  });

  it("stays before the last closing", () => {
    expect(pinBuffer(t("17:50"), 40, 40, { min: t("09:00"), max: t("18:00") })).toEqual({
      from: t("17:20"),
      to: t("18:00"),
    });
  });
});
