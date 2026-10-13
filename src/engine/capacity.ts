import type { Frame } from "./types";
import { dayBounds } from "./venue";

const MS_PER_MINUTE = 60_000;

/** A court's availability as counted: clipped to the playing window. */
export interface CountedCourt {
  hallId: string;
  courtId: string;
  /** UTC ISO timestamps after clipping. */
  from: string;
  to: string;
  minutes: number;
  /** True when part of its availability falls outside the playing window. */
  clipped: boolean;
}

export interface Available {
  /** UTC ISO: earliest hall opening, latest hall closing, and that less the buffer. */
  start: string;
  dayEnd: string;
  playingEnd: string;
  /** Playing window from the first opening to the last closing, less the buffer. */
  minutes: number;
  /** Court availability summed across every court inside the playing window. */
  courtMinutes: number;
  courts: CountedCourt[];
}

export function available(frame: Frame): Available {
  const bounds = dayBounds(frame.halls);
  const start = Date.parse(bounds.start);
  const dayEnd = Date.parse(bounds.end);
  const end = frame.bufferStart ? Date.parse(frame.bufferStart) : dayEnd - frame.bufferMinutes * MS_PER_MINUTE;
  const minutes = Math.max(0, (end - start) / MS_PER_MINUTE);

  const courts: CountedCourt[] = [];
  for (const hall of frame.halls) {
    for (const court of hall.courts) {
      const rawFrom = Date.parse(court.from);
      const rawTo = Date.parse(court.to);
      const from = Math.max(rawFrom, start);
      const to = Math.min(rawTo, end);
      courts.push({
        hallId: hall.id,
        courtId: court.id,
        from: new Date(from).toISOString(),
        to: new Date(Math.max(from, to)).toISOString(),
        minutes: Math.max(0, to - from) / MS_PER_MINUTE,
        clipped: from !== rawFrom || to !== rawTo,
      });
    }
  }
  const courtMinutes = courts.reduce((sum, c) => sum + c.minutes, 0);

  return {
    start: bounds.start,
    dayEnd: bounds.end,
    playingEnd: new Date(Math.max(start, end)).toISOString(),
    minutes,
    courtMinutes,
    courts,
  };
}

export interface Demand {
  matches: number;
  /** Court-minutes needed at typical and worst-case match length. */
  typical: number;
  worst: number;
}

/** Ways to close a shortfall, each on its own. Null when not computable. */
export interface Levers {
  courtMinutes: number;
  extraMinutes: number | null;
  extraCourts: number | null;
  fewerMatches: number | null;
}

export type CapacityStatus = "fits" | "fitsTypicalOnly" | "doesNotFit";

export interface Capacity {
  available: Available;
  needed: { typical: number; worst: number };
  /** Available minus needed; negative is a shortfall. */
  spare: { typical: number; worst: number };
  status: CapacityStatus;
  levers: { typical: Levers | null; worst: Levers | null };
}

function levers(shortfall: number, avail: Available, demand: Demand, needed: number): Levers {
  const averageCourts = avail.minutes > 0 ? avail.courtMinutes / avail.minutes : 0;
  const averageSlot = demand.matches > 0 ? needed / demand.matches : 0;
  return {
    courtMinutes: shortfall,
    extraMinutes: averageCourts > 0 ? Math.ceil(shortfall / averageCourts) : null,
    extraCourts: avail.minutes > 0 ? Math.ceil(shortfall / avail.minutes) : null,
    fewerMatches: averageSlot > 0 ? Math.ceil(shortfall / averageSlot) : null,
  };
}

/**
 * Court-minutes check. Necessary but not sufficient: rest times and waves
 * are handled by the scheduler.
 */
export function capacity(frame: Frame, demand: Demand): Capacity {
  const avail = available(frame);
  const spare = {
    typical: avail.courtMinutes - demand.typical,
    worst: avail.courtMinutes - demand.worst,
  };
  const status: CapacityStatus =
    spare.worst >= 0 ? "fits" : spare.typical >= 0 ? "fitsTypicalOnly" : "doesNotFit";

  return {
    available: avail,
    needed: { typical: demand.typical, worst: demand.worst },
    spare,
    status,
    levers: {
      typical: spare.typical < 0 ? levers(-spare.typical, avail, demand, demand.typical) : null,
      worst: spare.worst < 0 ? levers(-spare.worst, avail, demand, demand.worst) : null,
    },
  };
}
