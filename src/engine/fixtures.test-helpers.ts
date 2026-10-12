// Venue builders for engine tests only. Sample values live in tests, never
// in application code.
import type { Court, Hall, RateBand } from "./types";

/** UTC ISO time on a fixed test day, e.g. at("09:30"). */
export function at(hhmm: string): string {
  return `2026-05-02T${hhmm}:00.000Z`;
}

export function band(from: string, to: string, ratePerCourtHour: number, name = "Standard"): RateBand {
  return { name, from: at(from), to: at(to), ratePerCourtHour };
}

/** `count` courts, each available for the hall's hours unless given. */
export function courts(count: number, from: string, to: string, umpires = 0, prefix = "c"): Court[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, from: at(from), to: at(to), umpires }));
}

export function hall(
  id: string,
  from: string,
  to: string,
  options: { bands?: RateBand[]; courts?: Court[]; courtCount?: number; rate?: number; umpires?: number } = {},
): Hall {
  return {
    id,
    name: id,
    from: at(from),
    to: at(to),
    bands: options.bands ?? [band(from, to, options.rate ?? 0)],
    courts: options.courts ?? courts(options.courtCount ?? 1, from, to, options.umpires ?? 0, `${id}-c`),
  };
}
