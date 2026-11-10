import { courtHours, type HallDraft } from "./draft";
import { minutesOfDay } from "./time";

/** Court time booked across the venue, in minutes: each court's hours, where they're set. */
export function bookedCourtMinutes(halls: HallDraft[]): number {
  let total = 0;
  for (const hall of halls) {
    for (const court of hall.courts) {
      const hours = courtHours(hall, court);
      const from = minutesOfDay(hours.from);
      const to = minutesOfDay(hours.to);
      if (from !== null && to !== null && to > from) total += to - from;
    }
  }
  return total;
}

export interface HealthBars {
  /** How many hours of court time one bar stands for. */
  hoursPerBar: number;
  /** One entry per bar: how much of it is filled, from 0 to 1. */
  fills: number[];
}

/**
 * The plan's health bar: one small bar per hour of court time booked, filled
 * for the court time the matches need. With more hours than `maxBars`, each
 * bar stands for 2 hours, then 3, and so on, so there are never more than
 * that many. A part hour gets a bar of its own, part filled. No needed time
 * (the plan isn't complete) leaves every bar empty; time needed beyond the
 * booking fills them all.
 */
export function healthBars(bookedMinutes: number, neededMinutes: number | null, maxBars: number): HealthBars {
  const hours = Math.max(0, bookedMinutes) / 60;
  const hoursPerBar = Math.max(1, Math.ceil(hours / maxBars));
  const count = Math.ceil(hours / hoursPerBar);
  const filled = Math.max(0, neededMinutes ?? 0) / 60 / hoursPerBar;
  return {
    hoursPerBar,
    fills: Array.from({ length: count }, (_, i) => Math.min(1, Math.max(0, filled - i))),
  };
}
