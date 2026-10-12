import { newId, type CourtDraft, type HallDraft, type PlanDraft } from "./draft";

/** The frame as saved before halls (storage v3). */
interface V3Frame {
  date?: string;
  timeZone?: string;
  courtWindows?: { from?: string; to?: string; courts?: number | null; rate?: number | null }[];
  umpires?: number | null;
  bufferMinutes?: number | null;
}

/**
 * Brings a v3 draft (court windows) up to halls. Each old window becomes a
 * hall with the window's hours, one band at its rate and that many courts
 * following the hall's hours. The old umpire total is shared across the
 * courts as evenly as possible, earlier courts first. Old start and end
 * times are dropped: the day now comes from the halls.
 */
export function migrateV3(old: Omit<PlanDraft, "frame"> & { frame: V3Frame }): PlanDraft {
  const windows = old.frame.courtWindows ?? [];
  const counts = windows.map((w) => Math.max(1, w.courts ?? 1));
  const totalCourts = counts.reduce((sum, n) => sum + n, 0);
  const umpires = old.frame.umpires ?? null;
  let courtIndex = 0;
  const share = (): number | null => {
    if (umpires === null || totalCourts === 0) return null;
    const value = Math.floor(umpires / totalCourts) + (courtIndex < umpires % totalCourts ? 1 : 0);
    courtIndex += 1;
    return value;
  };

  const halls: HallDraft[] = windows.map((w, i) => {
    const courts: CourtDraft[] = Array.from({ length: counts[i]! }, () => ({
      id: newId(),
      from: null,
      to: null,
      umpires: share(),
    }));
    return {
      id: newId(),
      name: "",
      from: w.from ?? "",
      to: w.to ?? "",
      bands: [{ id: newId(), name: "", from: w.from ?? "", to: w.to ?? "", rate: w.rate ?? null }],
      courts,
    };
  });

  return {
    ...old,
    frame: {
      date: old.frame.date ?? "",
      timeZone: old.frame.timeZone ?? "",
      halls,
      bufferMinutes: old.frame.bufferMinutes ?? null,
    },
  } as PlanDraft;
}
