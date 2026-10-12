import type { PlanDraft } from "./draft";
import { migrateV3, migrateV4 } from "./migrate";

// Browser-only saving for Plan mode until tournaments move to Supabase.
// Storage can be unavailable (private windows, blocked site data), so every
// access is guarded and failure just means nothing is remembered.

// v5: timing per stage, external entries counted in entries, rules. v4 and
// v3 drafts are migrated on load; earlier drafts are not read.
const KEY = "badminton:plan-draft:v5";
const V4_KEY = "badminton:plan-draft:v4";
const V3_KEY = "badminton:plan-draft:v3";

export function loadDraft(): PlanDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as PlanDraft;
    const v4 = window.localStorage.getItem(V4_KEY);
    if (v4) return migrateV4(JSON.parse(v4));
    const v3 = window.localStorage.getItem(V3_KEY);
    return v3 ? migrateV4(migrateV3(JSON.parse(v3))) : null;
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
