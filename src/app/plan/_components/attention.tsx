"use client";

import { createContext, useContext } from "react";
import type { Timing } from "@/lib/tournament/live";

/**
 * What the Live pages draw the desk's eye to, shared by the Court board, the
 * side panel and the timeline:
 * - courts to flash (softly): one whose game can't start, until the desk
 *   deals with it; and for a few seconds, one a new game has just come onto;
 * - games held back by a player who hasn't checked in (greyed out);
 * - how far through its slot each game on court is (yellow near its end,
 *   red past it).
 */
export interface LiveAttention {
  flashing: ReadonlySet<string>;
  held: ReadonlySet<string>;
  timing: (matchId: string) => Timing | null;
  /** The desk has looked at a court: it stops flashing for the game it has now. */
  attend: (courtId: string) => void;
}

export const LiveAttentionContext = createContext<LiveAttention | null>(null);

export function useLiveAttention(): LiveAttention | null {
  return useContext(LiveAttentionContext);
}

/** The fill of an On court badge by how its game's time is going: neutral, then yellow, then red. */
export const TIMING_BADGE: Record<Timing, string> = {
  ok: "bg-black/30 text-white",
  near: "bg-tight text-tight-foreground",
  over: "bg-over-strong text-over-foreground",
};
