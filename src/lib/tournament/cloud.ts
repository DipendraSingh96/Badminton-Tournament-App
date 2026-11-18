import type { PlanDraft } from "./draft";
import {
  deleteTournament,
  loadIndex,
  loadTournament,
  normaliseDraft,
  saveTournament,
  sortTournaments,
  type Store,
  type TournamentIndex,
} from "./storage";

// Tournaments kept in the organiser's account.
//
// Every change is saved on the device at once (see storage.ts) and sent to the
// account behind it. With no connection the device's copy is the working one;
// what couldn't be sent is remembered and sent when it can be. The later save
// wins: nothing is merged.
//
// The rules here are written against a small "remote" so they can be tested
// without a network; src/lib/supabase/tournaments.ts is the real one.

/** A tournament as the account lists it. */
export interface RemoteMeta {
  id: string;
  /** When it was last changed, in milliseconds since the epoch. */
  updatedAt: number;
}

/** The account's tournaments. Every call may fail (no connection, signed out): it then throws. */
export interface Remote {
  list(): Promise<RemoteMeta[]>;
  /** The tournament as saved, or null when it isn't in the account. */
  get(id: string): Promise<{ data: unknown; updatedAt: number } | null>;
  put(id: string, draft: PlanDraft, updatedAt: number): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * An account's own space in the device's storage: its keys never meet another
 * account's, or the tournaments kept in the browser before sign-in.
 */
export function accountStore(store: Store, userId: string): Store {
  const key = (name: string) => `badminton:account:${userId}:${name}`;
  return {
    getItem: (name) => store.getItem(key(name)),
    setItem: (name, value) => store.setItem(key(name), value),
    removeItem: (name) => store.removeItem(key(name)),
  };
}

/** What the device has that the account doesn't yet: tournaments changed here, and ones deleted here. */
export interface Pending {
  unsent: string[];
  removed: string[];
}

const PENDING_KEY = "badminton:unsent:v1";

export function loadPending(store: Store): Pending {
  try {
    const saved = JSON.parse(store.getItem(PENDING_KEY) ?? "null") as Partial<Pending> | null;
    return {
      unsent: Array.isArray(saved?.unsent) ? saved.unsent : [],
      removed: Array.isArray(saved?.removed) ? saved.removed : [],
    };
  } catch {
    return { unsent: [], removed: [] };
  }
}

function savePending(store: Store, pending: Pending): void {
  try {
    store.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Not remembered: the next change marks it again.
  }
}

/** A tournament was changed (or made) on this device: it is to be sent. */
export function markUnsent(store: Store, id: string): Pending {
  const pending = loadPending(store);
  const next = { unsent: pending.unsent.includes(id) ? pending.unsent : [...pending.unsent, id], removed: pending.removed };
  savePending(store, next);
  return next;
}

/** A tournament was deleted on this device: it is to be deleted from the account too. */
export function markRemoved(store: Store, id: string): Pending {
  const pending = loadPending(store);
  const next = {
    unsent: pending.unsent.filter((x) => x !== id),
    removed: pending.removed.includes(id) ? pending.removed : [...pending.removed, id],
  };
  savePending(store, next);
  return next;
}

/** True while the device holds anything the account doesn't. */
export function hasPending(pending: Pending): boolean {
  return pending.unsent.length > 0 || pending.removed.length > 0;
}

/**
 * Sends what the device has that the account doesn't. Whatever can't be sent
 * stays marked, to be tried again. A tournament changed again while it was
 * being sent stays marked too, so its latest state follows.
 */
export async function sendPending(store: Store, remote: Remote): Promise<Pending> {
  const start = loadPending(store);
  const sent: { id: string; updatedAt: number }[] = [];
  const gone: string[] = [];
  for (const id of start.removed) {
    try {
      await remote.remove(id);
      gone.push(id);
    } catch {
      // Stays marked.
    }
  }
  for (const id of start.unsent) {
    const draft = loadTournament(id, store);
    const updatedAt = loadIndex(store).items.find((t) => t.id === id)?.updatedAt;
    if (!draft || updatedAt === undefined) {
      // No longer on the device: nothing to send.
      sent.push({ id, updatedAt: Infinity });
      continue;
    }
    try {
      await remote.put(id, draft, updatedAt);
      sent.push({ id, updatedAt });
    } catch {
      // Stays marked.
    }
  }
  // Marks made while sending are kept.
  const now = loadPending(store);
  const items = loadIndex(store).items;
  const next = {
    unsent: now.unsent.filter((id) => {
      const was = sent.find((s) => s.id === id);
      if (!was) return true;
      const at = items.find((t) => t.id === id)?.updatedAt;
      return at !== undefined && at > was.updatedAt;
    }),
    removed: now.removed.filter((id) => !gone.includes(id)),
  };
  savePending(store, next);
  return next;
}

/**
 * Brings the device level with the account: a tournament newer in the account
 * (or not on the device) is fetched, and one no longer in the account is
 * removed here. Anything still unsent on the device is left as it is: it is
 * the newer state, waiting to be sent. Throws when the account can't be read.
 */
export async function fetchAccount(store: Store, remote: Remote): Promise<TournamentIndex> {
  const listed = await remote.list();
  const pending = loadPending(store);
  let index = loadIndex(store);
  for (const row of listed) {
    if (pending.unsent.includes(row.id) || pending.removed.includes(row.id)) continue;
    const here = index.items.find((t) => t.id === row.id);
    if (here && here.updatedAt >= row.updatedAt) continue;
    const saved = await remote.get(row.id);
    if (!saved) continue;
    let draft: PlanDraft;
    try {
      // The same checks as a tournament loaded from the device, so one saved by an older build still opens.
      draft = normaliseDraft(saved.data as Parameters<typeof normaliseDraft>[0]);
    } catch {
      continue;
    }
    index = saveTournament(index, row.id, draft, store, saved.updatedAt);
  }
  // Deleted elsewhere: gone here too.
  for (const item of [...index.items]) {
    if (listed.some((row) => row.id === item.id) || pending.unsent.includes(item.id)) continue;
    index = deleteTournament(index, item.id, store);
  }
  if (index.currentId && !index.items.some((t) => t.id === index.currentId)) {
    index = { ...index, currentId: sortTournaments(index.items)[0]?.id ?? null };
  }
  return index;
}

/** What a sync came to. */
export interface Synced {
  index: TournamentIndex;
  pending: Pending;
  /** False when the account couldn't be reached: the device's copy is what there is for now. */
  reached: boolean;
}

/** Sends what is unsent, then brings the device level with the account. Never throws. */
export async function syncAccount(store: Store, remote: Remote): Promise<Synced> {
  await sendPending(store, remote);
  try {
    const index = await fetchAccount(store, remote);
    return { index, pending: loadPending(store), reached: true };
  } catch {
    return { index: loadIndex(store), pending: loadPending(store), reached: false };
  }
}

/**
 * Takes the account's tournaments off this device (on signing out). Anything
 * not yet sent is kept, so it can be sent the next time this account signs in
 * here. Returns true when nothing was left behind.
 */
export function clearDevice(store: Store): boolean {
  const pending = loadPending(store);
  let index = loadIndex(store);
  for (const item of [...index.items]) {
    if (pending.unsent.includes(item.id)) continue;
    index = deleteTournament(index, item.id, store);
  }
  return !hasPending(pending);
}
