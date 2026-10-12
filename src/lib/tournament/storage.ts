import { emptyRules, type PlanDraft } from "./draft";
import { migrateV3 } from "./migrate";

// Browser-only saving for Plan mode until tournaments move to Supabase.
// Storage can be unavailable (private windows, blocked site data), so every
// access is guarded and failure just means nothing is remembered.

// v4: venue of halls, rate bands and courts. v3 drafts (court windows) are
// migrated on load; earlier drafts are not read.
const KEY = "badminton:plan-draft:v4";
const V3_KEY = "badminton:plan-draft:v3";

/** Fills in parts added since a draft was saved: rules came after v4 began. */
export function normaliseDraft(draft: Omit<PlanDraft, "rules"> & { rules?: PlanDraft["rules"] }): PlanDraft {
  return { ...draft, rules: draft.rules ?? emptyRules() };
}

export function loadDraft(): PlanDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return normaliseDraft(JSON.parse(raw));
    const old = window.localStorage.getItem(V3_KEY);
    return old ? normaliseDraft(migrateV3(JSON.parse(old))) : null;
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
    window.localStorage.removeItem(V3_KEY);
  } catch {
    // Nothing to clear.
  }
}
