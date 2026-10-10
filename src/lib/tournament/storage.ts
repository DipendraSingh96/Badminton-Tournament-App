import type { PlanDraft } from "./draft";

// Browser-only saving for Plan mode until tournaments move to Supabase.
// Storage can be unavailable (private windows, blocked site data), so every
// access is guarded and failure just means nothing is remembered.

// v2: unit of play, format type and event types (v1 drafts are not read).
const KEY = "badminton:plan-draft:v2";

export function loadDraft(): PlanDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlanDraft) : null;
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
  } catch {
    // Nothing to clear.
  }
}
