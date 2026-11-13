import type { PlanDraft } from "./draft";

// The audience board runs in its own window on the desk's laptop, dragged to
// the hall's screen. The desk's window sends it the day as the desk sees it
// each time something changes. Nothing sent is saved, so a simulated day can
// be shown without touching the tournament.

/** The day as the desk sees it. */
export interface BoardDay {
  draft: PlanDraft;
  /** The desk's "now", in minutes since midnight in the tournament's time zone. */
  now: number | null;
  /** The time to show instead of the real clock (a simulated day, or the cursor in developer mode); null for the real time. */
  clock: string | null;
}

export type BoardMessage =
  | ({ type: "day" } & BoardDay)
  /** The desk is still there, and what time it makes it. */
  | { type: "ping"; now: number | null; clock: string | null }
  /** A board has opened and asks for the day. */
  | { type: "hello" };

/** How often the desk says it is still there, and how long the board waits before saying it has lost it. */
export const BOARD_PING_MS = 5000;
export const BOARD_LOST_MS = 15000;

/** The board's own theme, kept apart from the desk's. */
export const BOARD_THEME_KEY = "badminton:board-theme";

/** The address of a tournament's audience board: only its id, never a name. */
export function boardUrl(id: string): string {
  return `/board?t=${encodeURIComponent(id)}`;
}

/** The line between a tournament's desk window and its board windows; null where the browser has none. */
export function boardChannel(id: string): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`badminton:board:${id}`);
}
