import { describe, expect, it } from "vitest";
import {
  accountStore,
  clearDevice,
  fetchAccount,
  loadPending,
  markRemoved,
  markUnsent,
  sendPending,
  syncAccount,
  type Remote,
} from "./cloud";
import type { PlanDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import { createTournament, deleteTournament, loadIndex, loadTournament, saveTournament, type Store } from "./storage";

function fakeStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** An account, in memory. `down` makes every call fail, as with no connection. */
function fakeRemote() {
  const rows = new Map<string, { data: unknown; updatedAt: number }>();
  const calls: string[] = [];
  const state = { down: false };
  const reach = () => {
    if (state.down) throw new Error("no connection");
  };
  const remote: Remote = {
    async list() {
      reach();
      return [...rows].map(([id, row]) => ({ id, updatedAt: row.updatedAt }));
    },
    async get(id) {
      reach();
      calls.push(`get ${id}`);
      return rows.get(id) ?? null;
    },
    async put(id, draft, updatedAt) {
      reach();
      calls.push(`put ${id}`);
      rows.set(id, { data: JSON.parse(JSON.stringify(draft)), updatedAt });
    },
    async remove(id) {
      reach();
      calls.push(`remove ${id}`);
      rows.delete(id);
    },
  };
  return { remote, rows, calls, state };
}

const named = (name: string): PlanDraft => ({ ...completeDraft(), name });

describe("sending what the device has", () => {
  it("sends a changed tournament and forgets the mark", async () => {
    const store = fakeStore();
    const { remote, rows } = fakeRemote();
    const made = createTournament(loadIndex(store), named("Winter Open"), store, 1000);
    markUnsent(store, made.id);
    expect(await sendPending(store, remote)).toEqual({ unsent: [], removed: [] });
    expect(rows.get(made.id)).toMatchObject({ updatedAt: 1000, data: { name: "Winter Open" } });
  });

  it("keeps the mark when it can't be sent, and sends it the next time", async () => {
    const store = fakeStore();
    const { remote, rows, state } = fakeRemote();
    const made = createTournament(loadIndex(store), named("Winter Open"), store, 1000);
    markUnsent(store, made.id);
    state.down = true;
    expect(await sendPending(store, remote)).toEqual({ unsent: [made.id], removed: [] });
    expect(rows.size).toBe(0);
    state.down = false;
    expect(await sendPending(store, remote)).toEqual({ unsent: [], removed: [] });
    expect(rows.has(made.id)).toBe(true);
  });

  it("keeps the mark on a tournament changed again while it was being sent", async () => {
    const store = fakeStore();
    const { remote, rows } = fakeRemote();
    const made = createTournament(loadIndex(store), named("Winter Open"), store, 1000);
    markUnsent(store, made.id);
    const put = remote.put;
    remote.put = async (id, draft, updatedAt) => {
      await put(id, draft, updatedAt);
      // The organiser types on while the first send is on its way.
      saveTournament(loadIndex(store), made.id, named("Winter Open 2026"), store, 2000);
      markUnsent(store, made.id);
      remote.put = put;
    };
    expect(await sendPending(store, remote)).toEqual({ unsent: [made.id], removed: [] });
    expect(await sendPending(store, remote)).toEqual({ unsent: [], removed: [] });
    expect(rows.get(made.id)).toMatchObject({ updatedAt: 2000, data: { name: "Winter Open 2026" } });
  });

  it("deletes from the account what was deleted here", async () => {
    const store = fakeStore();
    const { remote, rows } = fakeRemote();
    const made = createTournament(loadIndex(store), named("Winter Open"), store, 1000);
    markUnsent(store, made.id);
    await sendPending(store, remote);
    deleteTournament(loadIndex(store), made.id, store);
    expect(markRemoved(store, made.id)).toEqual({ unsent: [], removed: [made.id] });
    expect(await sendPending(store, remote)).toEqual({ unsent: [], removed: [] });
    expect(rows.size).toBe(0);
  });
});

describe("bringing the device level with the account", () => {
  it("fetches a tournament the device doesn't have, through the checks for older builds", async () => {
    const store = fakeStore();
    const { remote, rows } = fakeRemote();
    const old = JSON.parse(JSON.stringify(named("From another device")));
    delete old.actuals;
    rows.set("t1", { data: old, updatedAt: 5000 });
    const index = await fetchAccount(store, remote);
    expect(index.items).toEqual([{ id: "t1", name: "From another device", date: old.frame.date, updatedAt: 5000 }]);
    expect(loadTournament("t1", store)!.actuals).toEqual({});
  });

  it("takes the account's copy when it is newer, and leaves the device's when it isn't", async () => {
    const store = fakeStore();
    const { remote, rows, calls } = fakeRemote();
    saveTournament(loadIndex(store), "older", named("Here, older"), store, 1000);
    saveTournament(loadIndex(store), "newer", named("Here, newer"), store, 9000);
    rows.set("older", { data: named("Account, newer"), updatedAt: 2000 });
    rows.set("newer", { data: named("Account, older"), updatedAt: 3000 });
    await fetchAccount(store, remote);
    expect(loadTournament("older", store)!.name).toBe("Account, newer");
    expect(loadTournament("newer", store)!.name).toBe("Here, newer");
    expect(calls).toEqual(["get older"]);
  });

  it("removes a tournament deleted elsewhere, but not one made here and not yet sent", async () => {
    const store = fakeStore();
    const { remote } = fakeRemote();
    saveTournament(loadIndex(store), "gone", named("Deleted elsewhere"), store, 1000);
    saveTournament(loadIndex(store), "new", named("Made here"), store, 2000);
    markUnsent(store, "new");
    const index = await fetchAccount(store, remote);
    expect(index.items.map((t) => t.id)).toEqual(["new"]);
    expect(loadTournament("gone", store)).toBeNull();
  });

  it("moves to another tournament when the open one was deleted elsewhere", async () => {
    const store = fakeStore();
    const { remote, rows } = fakeRemote();
    const made = createTournament(loadIndex(store), named("Open here"), store, 1000);
    rows.set("other", { data: named("Still there"), updatedAt: 2000 });
    const index = await fetchAccount(store, remote);
    expect(made.index.currentId).toBe(made.id);
    expect(index.currentId).toBe("other");
  });
});

describe("a sync", () => {
  it("sends unsent changes before anything is fetched, so the device's newer state isn't overwritten", async () => {
    const store = fakeStore();
    const { remote, rows, calls } = fakeRemote();
    rows.set("t1", { data: named("In the account"), updatedAt: 5000 });
    // Changed here while offline, at a time the account's copy is already past.
    saveTournament(loadIndex(store), "t1", named("Changed here"), store, 4000);
    markUnsent(store, "t1");
    const synced = await syncAccount(store, remote);
    expect(synced).toMatchObject({ reached: true, pending: { unsent: [], removed: [] } });
    expect(calls).toEqual(["put t1"]);
    expect(rows.get("t1")).toMatchObject({ data: { name: "Changed here" } });
    expect(loadTournament("t1", store)!.name).toBe("Changed here");
  });

  it("works from the device's copy when the account can't be reached, losing nothing", async () => {
    const store = fakeStore();
    const { remote, state } = fakeRemote();
    saveTournament(loadIndex(store), "t1", named("On the device"), store, 1000);
    markUnsent(store, "t1");
    state.down = true;
    const synced = await syncAccount(store, remote);
    expect(synced.reached).toBe(false);
    expect(synced.pending.unsent).toEqual(["t1"]);
    expect(synced.index.items.map((t) => t.id)).toEqual(["t1"]);
    expect(loadTournament("t1", store)!.name).toBe("On the device");
  });
});

describe("accounts on one device", () => {
  it("never see each other's tournaments, or the ones kept in the browser before sign-in", () => {
    const device = fakeStore();
    saveTournament(loadIndex(device), "before", named("Before sign-in"), device, 1);
    const alice = accountStore(device, "alice");
    const bob = accountStore(device, "bob");
    saveTournament(loadIndex(alice), "a1", named("Alice's"), alice, 2);
    markUnsent(alice, "a1");
    expect(loadIndex(bob).items).toEqual([]);
    expect(loadTournament("a1", bob)).toBeNull();
    expect(loadPending(bob)).toEqual({ unsent: [], removed: [] });
    expect(loadIndex(alice).items.map((t) => t.id)).toEqual(["a1"]);
    // The browser's own tournaments are untouched and not in either account.
    expect(loadIndex(device).items.map((t) => t.id)).toEqual(["before"]);
  });

  it("signing out takes the account's tournaments off the device, except what was never sent", () => {
    const store = accountStore(fakeStore(), "alice");
    saveTournament(loadIndex(store), "sent", named("Sent"), store, 1);
    saveTournament(loadIndex(store), "unsent", named("Not sent"), store, 2);
    markUnsent(store, "unsent");
    expect(clearDevice(store)).toBe(false);
    expect(loadIndex(store).items.map((t) => t.id)).toEqual(["unsent"]);
    expect(loadTournament("sent", store)).toBeNull();

    const clean = accountStore(fakeStore(), "bob");
    saveTournament(loadIndex(clean), "sent", named("Sent"), clean, 1);
    expect(clearDevice(clean)).toBe(true);
    expect(loadIndex(clean).items).toEqual([]);
  });
});
