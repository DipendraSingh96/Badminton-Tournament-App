"use client";

import { createContext, useContext } from "react";

/**
 * True during a simulated day: the simulation starts, scores and finishes
 * the games, so those controls are off. Everything the desk does (check-in,
 * walkovers, moving a game, withdrawals) still works, on the simulated day.
 */
export const WatchOnlyContext = createContext(false);

export function useWatchOnly(): boolean {
  return useContext(WatchOnlyContext);
}
