"use client";

import { createContext, useContext } from "react";
import type { Timing } from "@/lib/tournament/live";
import { cn } from "@/lib/utils";

/**
 * What the Live pages draw the desk's eye to, shared by the Court board, the
 * side panel and the timeline:
 * - courts waiting for the desk: their game can't start because a player
 *   hasn't checked in. They are greyed, and fade in and out until the desk
 *   has looked at them;
 * - courts a new game has come onto: the accent outline pulses until the
 *   desk touches that court (so a game called onto a court is never missed);
 * - courts with other news, for a few seconds: the desk has dealt with a
 *   waiting court, or the court has become free. The same outline, briefly;
 * - games held back by a player who hasn't checked in (greyed out);
 * - how far through its slot each game on court is: a small dot, soft amber
 *   near its end and soft red past it.
 */
export interface LiveAttention {
  /** Courts whose game can't start. */
  stuck: ReadonlySet<string>;
  /** Of those, the ones the desk hasn't looked at yet: they fade in and out. */
  fading: ReadonlySet<string>;
  /** Courts with new information, for about three seconds. */
  news: ReadonlySet<string>;
  /** Courts a new game has come onto, until the desk touches the court. */
  calls: ReadonlySet<string>;
  held: ReadonlySet<string>;
  timing: (matchId: string) => Timing | null;
  /** The desk has touched a court: it stops fading, and stops calling, for the game it has now. */
  attend: (courtId: string) => void;
}

export const LiveAttentionContext = createContext<LiveAttention | null>(null);

export function useLiveAttention(): LiveAttention | null {
  return useContext(LiveAttentionContext);
}

/** The classes a court takes from what is happening on it: fading while it waits, the accent outline for a new game (until touched) or other news (briefly). */
export function courtAttention(attention: LiveAttention | null, courtId: string): string {
  if (!attention) return "";
  return cn(
    attention.fading.has(courtId) && "court-wait",
    attention.calls.has(courtId) ? "court-call" : attention.news.has(courtId) && "court-news",
  );
}

const TIMING_TEXT: Record<Timing, string | null> = { ok: null, near: "Near the end of its slot", over: "Over its slot" };

/**
 * A game's time as a dot: nothing while it is on time, soft amber from 80%
 * of its slot, soft red past it. `ringed` on a pale surface, where the soft
 * colours need an edge to be seen.
 */
export function TimingDot({ timing, ringed = false, className }: { timing: Timing | null | undefined; ringed?: boolean; className?: string }) {
  const text = timing ? TIMING_TEXT[timing] : null;
  if (!text) return null;
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      data-timing={timing}
      className={cn("size-2.5 shrink-0 rounded-full", timing === "over" ? "bg-time-over" : "bg-time-near", ringed && "ring-1 ring-foreground/40", className)}
    />
  );
}
