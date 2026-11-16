// The guided start: the very first tournament made on a device is revealed a
// step at a time (name and date, then the venue, then everything else), so a
// new organiser isn't met with every setting at once. Remembered on the
// device only; it is not part of any tournament. Once it has been through, or
// for anyone who already has tournaments here, it never shows.

const KEY = "badminton:onboarding:v1";

/** Storage as the guide uses it; tests pass a fake. */
export type GuideStore = Pick<Storage, "getItem" | "setItem">;

/** 1: only the name, date and time zone. 2: the stage tabs and the venue. Null: the whole app. */
export type GuideStep = 1 | 2 | null;

function read(store: GuideStore): { id: string; step: 1 | 2 } | "done" | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    if (raw === "done") return "done";
    const saved = JSON.parse(raw) as { id?: unknown; step?: unknown };
    return typeof saved.id === "string" && (saved.step === 1 || saved.step === 2) ? { id: saved.id, step: saved.step } : "done";
  } catch {
    return "done";
  }
}

function write(store: GuideStore, value: { id: string; step: 1 | 2 } | "done"): void {
  try {
    store.setItem(KEY, value === "done" ? "done" : JSON.stringify(value));
  } catch {
    // Without storage the guide simply doesn't carry over a refresh.
  }
}

/** Starts the guide for a device's first tournament. Nothing happens if it has ever been started here. */
export function beginGuide(store: GuideStore, tournamentId: string): void {
  if (read(store) === null) write(store, { id: tournamentId, step: 1 });
}

/** A device that already has tournaments never gets the guide. */
export function skipGuide(store: GuideStore): void {
  if (read(store) === null) write(store, "done");
}

/** The step a tournament is at; null for any tournament but the one being guided, and once the guide is done. */
export function guideStep(store: GuideStore, tournamentId: string): GuideStep {
  const saved = read(store);
  return saved && saved !== "done" && saved.id === tournamentId ? saved.step : null;
}

/** Moves the guide on: from the first step to the second, and from the second to done (for good). */
export function advanceGuide(store: GuideStore, tournamentId: string): GuideStep {
  const saved = read(store);
  if (!saved || saved === "done" || saved.id !== tournamentId) return null;
  if (saved.step === 1) {
    write(store, { id: tournamentId, step: 2 });
    return 2;
  }
  write(store, "done");
  return null;
}
