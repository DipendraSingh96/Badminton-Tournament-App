"use client";

import { createContext, useContext } from "react";

/**
 * True while a simulated day is being watched: every control that would
 * change the tournament is off. Looking around (opening a game, a court, an
 * entry) still works.
 */
export const WatchOnlyContext = createContext(false);

export function useWatchOnly(): boolean {
  return useContext(WatchOnlyContext);
}
