"use client";

import { createContext, useContext } from "react";

/**
 * A simulated day (developer tools). While one is on, the simulation starts
 * the games; it scores and finishes them too, unless the desk has taken the
 * scores ("I enter the scores"). Everything else the desk does (check-in,
 * walkovers, moving a game, withdrawals) works, on the simulated day.
 */
export interface SimulationState {
  on: boolean;
  /** The desk enters each game's score and finishes it; the simulation waits for that. */
  deskScores: boolean;
}

export const WatchOnlyContext = createContext<SimulationState>({ on: false, deskScores: false });

export function useSimulation(): SimulationState {
  return useContext(WatchOnlyContext);
}
