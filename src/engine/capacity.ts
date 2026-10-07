import type { Frame } from "./types";

const MS_PER_MINUTE = 60_000;

export interface Available {
  /** Playing window from start to end, less the buffer. */
  minutes: number;
  /** Court availability summed across windows inside the playing window. */
  courtMinutes: number;
}

export function available(frame: Frame): Available {
  const start = Date.parse(frame.start);
  const end = Date.parse(frame.end) - frame.bufferMinutes * MS_PER_MINUTE;
  const minutes = Math.max(0, (end - start) / MS_PER_MINUTE);

  const courtMinutes = frame.courtWindows.reduce((sum, window) => {
    const from = Math.max(Date.parse(window.from), start);
    const to = Math.min(Date.parse(window.to), end);
    return sum + (Math.max(0, to - from) / MS_PER_MINUTE) * window.courts;
  }, 0);

  return { minutes, courtMinutes };
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
