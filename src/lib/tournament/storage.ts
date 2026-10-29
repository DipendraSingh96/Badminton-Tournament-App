import type { FinanceDraft, HallDraft, PlanDraft } from "./draft";
import { migrateV3, migrateV4 } from "./migrate";

// Browser-only saving for Plan mode until tournaments move to Supabase.
// Storage can be unavailable (private windows, blocked site data), so every
// access is guarded and failure just means nothing is remembered.

// v5: timing per stage, external entries counted in entries, rules. v4 and
// v3 drafts are migrated on load; earlier drafts are not read.
const KEY = "badminton:plan-draft:v5";
const V4_KEY = "badminton:plan-draft:v4";
const V3_KEY = "badminton:plan-draft:v3";

/** Finance as saved before per-tube pricing and other money in. */
type EarlyFinance = Omit<FinanceDraft, "shuttlePriceBasis" | "shuttlePrice" | "shuttlesPerTube" | "otherIncome"> &
  Partial<FinanceDraft> & { costPerShuttle?: number | null };

type EarlyHall = Omit<HallDraft, "unitMinutes" | "multipleRates"> & {
  unitMinutes?: number | null;
  multipleRates?: boolean;
};

/**
 * Fills in fields added during v5:
 * - A price saved as cost per shuttle keeps its meaning: per shuttle.
 * - Other money in starts empty.
 * - Halls saved before unit time were charged per hour, so their unit is 60.
 * - Halls saved before the rate-bands switch have it on when they have several bands.
 */
export function normaliseDraft(
  saved: Omit<
    PlanDraft,
    "finance" | "frame" | "zoneMoves" | "matchMoves" | "groupCourts" | "courtGroups" | "stage" | "entries" | "draw"
  > & {
    /** Zones dragged in time before zone moves; their start carries over. */
    stageWindows?: Record<string, { from: string; to: string }>;
    zoneMoves?: PlanDraft["zoneMoves"];
    matchMoves?: PlanDraft["matchMoves"];
    groupCourts?: PlanDraft["groupCourts"];
    courtGroups?: PlanDraft["courtGroups"];
    stage?: PlanDraft["stage"];
    entries?: PlanDraft["entries"];
    draw?: PlanDraft["draw"];
    finance: EarlyFinance;
    frame: Omit<PlanDraft["frame"], "halls" | "bufferStart"> & { halls: EarlyHall[]; bufferStart?: string | null };
  },
): PlanDraft {
  const halls: HallDraft[] = saved.frame.halls.map((h) => ({
    ...h,
    unitMinutes: h.unitMinutes === undefined ? 60 : h.unitMinutes,
    // Halls saved before the switch had it on whenever they had several bands.
    multipleRates: h.multipleRates ?? h.bands.length > 1,
  }));
  const { stageWindows, ...rest } = saved;
  // Per-hall zones dragged in time keep their start; earlier stage, wave and round windows are dropped.
  const carried = Object.fromEntries(
    Object.entries(stageWindows ?? {})
      .filter(([key]) => saved.frame.halls.some((h) => key === `${h.id}:group` || key === `${h.id}:knockout`))
      .map(([key, w]) => [key, { start: w.from, hallId: null }]),
  );
  const draft = {
    ...rest,
    zoneMoves: saved.zoneMoves ?? carried,
    matchMoves: saved.matchMoves ?? {},
    // Groups keep their own courts unless the organiser chose to share them.
    groupCourts: saved.groupCourts ?? "own",
    courtGroups: saved.courtGroups ?? {},
    // Saved before entries: still planning, with none.
    stage: saved.stage ?? "plan",
    entries: saved.entries ?? [],
    draw: saved.draw ?? {},
    frame: { ...saved.frame, halls, bufferStart: saved.frame.bufferStart ?? null },
  };
  const { costPerShuttle, ...finance } = draft.finance;
  if (finance.shuttlePrice !== undefined) {
    return { ...draft, finance: { ...finance, otherIncome: finance.otherIncome ?? [] } as FinanceDraft };
  }
  const price = costPerShuttle ?? null;
  return {
    ...draft,
    finance: {
      ...finance,
      shuttlePriceBasis: price === null ? null : "shuttle",
      shuttlePrice: price,
      shuttlesPerTube: null,
      otherIncome: finance.otherIncome ?? [],
    },
  };
}

export function loadDraft(): PlanDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return normaliseDraft(JSON.parse(raw));
    const v4 = window.localStorage.getItem(V4_KEY);
    if (v4) return normaliseDraft(migrateV4(JSON.parse(v4)));
    const v3 = window.localStorage.getItem(V3_KEY);
    return v3 ? normaliseDraft(migrateV4(migrateV3(JSON.parse(v3)))) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: PlanDraft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Not saved; the editor keeps working.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(V4_KEY);
    window.localStorage.removeItem(V3_KEY);
  } catch {
    // Nothing to clear.
  }
}
