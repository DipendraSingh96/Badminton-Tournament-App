// Undo and redo for the plan: earlier drafts kept in memory (not saved), so a
// change made by mistake (a deleted court, a match dragged too far) can be
// taken back with Ctrl+Z.

/** How many changes can be undone. */
export const UNDO_LIMIT = 10;
/** Changes closer together than this (typing, a run of stepper clicks) undo as one. */
export const MERGE_WITHIN_MS = 600;

export interface History<T> {
  /** Earlier states, oldest first. */
  past: T[];
  /** States undone, the next to redo last. */
  future: T[];
  /** When the last change was recorded; 0 after an undo or redo, so the next change starts afresh. */
  at: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], at: 0 };
}

/**
 * Records a change from `current`. A change soon after the previous one joins
 * it (the state before the run is what undo returns to), unless `merge` is off.
 * Anything undone can no longer be redone.
 */
export function record<T>(history: History<T>, current: T, now: number, merge = true): History<T> {
  const joins = merge && history.past.length > 0 && history.at > 0 && now - history.at < MERGE_WITHIN_MS;
  const past = joins ? history.past : [...history.past, current].slice(-UNDO_LIMIT);
  return { past, future: [], at: merge ? now : 0 };
}

/** The state before the last change, or null when there is nothing to undo. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.past.at(-1);
  if (value === undefined) return null;
  return {
    value,
    history: { past: history.past.slice(0, -1), future: [...history.future, current], at: 0 },
  };
}

/** The state last undone, or null when there is nothing to redo. */
export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.future.at(-1);
  if (value === undefined) return null;
  return {
    value,
    history: { past: [...history.past, current].slice(-UNDO_LIMIT), future: history.future.slice(0, -1), at: 0 },
  };
}
