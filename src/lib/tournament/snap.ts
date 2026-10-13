// How dragged times snap on the timeline and the hall strip. Times are
// minutes since midnight; `unit` is a hall's unit time, or null before it's
// set (then everything moves on the drawing grid).

/** Drawing a new window starts on this grid: an interaction step, not a tournament value. */
export const GRID_MINUTES = 10;

export const DAY_MINUTES = 24 * 60;

export interface Window {
  from: number;
  to: number;
}

export interface Bounds {
  min: number;
  max: number;
}

const DAY: Bounds = { min: 0, max: DAY_MINUTES };

/** The step a drag moves in: the unit, or the drawing grid until a unit is set. */
export function stepOf(unit: number | null): number {
  return unit && unit > 0 ? unit : GRID_MINUTES;
}

function roundTo(minutes: number, grid: number): number {
  return Math.round(minutes / grid) * grid;
}

/** Whole steps that fit in a span, at least one. */
function steps(span: number, step: number): number {
  return Math.max(1, Math.round(span / step));
}

/**
 * A new window: the start snaps to the drawing grid where the drag began, and
 * the length is whole units towards the pointer, either way. Never empty.
 */
export function drawWindow(anchor: number, pointer: number, unit: number | null, bounds: Bounds = DAY): Window {
  const step = stepOf(unit);
  const start = Math.min(Math.max(roundTo(anchor, GRID_MINUTES), bounds.min), bounds.max);
  if (pointer >= start) {
    const n = Math.min(steps(pointer - start, step), Math.max(1, Math.floor((bounds.max - start) / step)));
    return { from: start, to: start + n * step };
  }
  const n = Math.min(steps(start - pointer, step), Math.max(1, Math.floor((start - bounds.min) / step)));
  return { from: start - n * step, to: start };
}

/** The start edge moves in whole units; the end stays put. */
export function moveStart(window: Window, pointer: number, unit: number | null, bounds: Bounds = DAY): Window {
  const step = stepOf(unit);
  const most = Math.max(1, Math.floor((window.to - bounds.min) / step));
  return { from: window.to - Math.min(steps(window.to - pointer, step), most) * step, to: window.to };
}

/** The end edge moves in whole units; the start stays put. */
export function moveEnd(window: Window, pointer: number, unit: number | null, bounds: Bounds = DAY): Window {
  const step = stepOf(unit);
  const most = Math.max(1, Math.floor((bounds.max - window.from) / step));
  return { from: window.from, to: window.from + Math.min(steps(pointer - window.from, step), most) * step };
}

/** The whole window moves in whole units, staying within bounds. */
export function moveWindow(window: Window, delta: number, unit: number | null, bounds: Bounds = DAY): Window {
  const step = stepOf(unit);
  const lowest = -Math.floor((window.from - bounds.min) / step);
  const highest = Math.floor((bounds.max - window.to) / step);
  const k = Math.min(Math.max(Math.round(delta / step), lowest), highest);
  return { from: window.from + k * step, to: window.to + k * step };
}

/**
 * A boundary (between rate bands, or a court's edge) snaps to whole units
 * from the origin (the hall's opening), within bounds.
 */
export function moveBoundary(pointer: number, origin: number, unit: number | null, bounds: Bounds): number {
  const step = stepOf(unit);
  const lowest = origin + Math.ceil((bounds.min - origin) / step) * step;
  const highest = origin + Math.floor((bounds.max - origin) / step) * step;
  const snapped = origin + Math.round((pointer - origin) / step) * step;
  return Math.min(Math.max(snapped, lowest), highest);
}

/** A pinned buffer: its start on the drawing grid, its length whole units. */
export function pinBuffer(start: number, length: number, unit: number | null, bounds: Bounds = DAY): Window {
  const step = stepOf(unit);
  const span = steps(length, step) * step;
  const from = Math.min(Math.max(roundTo(start, GRID_MINUTES), bounds.min), Math.max(bounds.min, bounds.max - span));
  return { from, to: from + span };
}
