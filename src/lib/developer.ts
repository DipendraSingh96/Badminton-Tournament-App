"use client";

import { useSyncExternalStore } from "react";

// Developer tools: a switch in Settings, remembered on this device only. It
// is not part of any tournament, and nothing an organiser needs depends on it.

const KEY = "badminton:developer-tools";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Turns developer tools on or off, here and in this device's other tabs. */
export function setDeveloperTools(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered: the switch stays where it was.
  }
  for (const listener of listeners) listener();
}

/** Whether developer tools are on; off until the page has loaded. */
export function useDeveloperTools(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
