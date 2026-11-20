"use client";

import { createContext, useContext } from "react";
import type { LocalSegment } from "./timeline";

/**
 * Putting a waiting game on a court while Live, shared by the side panel and
 * the Court board: a game dragged from the panel can be dropped on a court in
 * either. A court takes a game only when it isn't playing and the game may be
 * played there.
 */
export interface LiveMoves {
  /** The waiting game being dragged; null when none is. */
  dragging: LocalSegment | null;
  setDragging: (segment: LocalSegment | null) => void;
  /** May this waiting game be put on that court now? */
  takes: (segment: LocalSegment, courtId: string) => boolean;
  /** Why it can't be put there, in words for the desk; null when it can. */
  whyNot: (segment: LocalSegment, courtId: string) => string | null;
  /** Something the desk tried couldn't be done: the reason, shown at the top of the side panel for a few seconds. */
  notice: string | null;
  say: (message: string) => void;
  /** Puts it first on the court; a game that was waiting there goes back behind it. Logged. */
  move: (segment: LocalSegment, courtId: string) => void;
}

export const LiveMovesContext = createContext<LiveMoves | null>(null);

export function useLiveMoves(): LiveMoves | null {
  return useContext(LiveMovesContext);
}
