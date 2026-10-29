import { describe, expect, it } from "vitest";
import { duplicateDraft, emptyDraft } from "./draft";
import { completeDraft } from "./draft.test-helpers";
import {
  createTournament,
  deleteTournament,
  loadIndex,
  loadTournament,
  saveTournament,
  setCurrent,
  sortTournaments,
  type Store,
} from "./storage";

function fakeStore(initial: Record<string, string> = {}): Store & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("saved tournaments", () => {
  it("starts with none", () => {
    expect(loadIndex(fakeStore())).toEqual({ currentId: null, items: [] });
  });

  it("creates, saves, lists and loads tournaments", () => {
    const store = fakeStore();
    const first = createTournament(loadIndex(store), completeDraft(), store, 1);
    const second = createTournament(first.index, emptyDraft("Europe/London"), store, 2);
    expect(second.index.currentId).toBe(second.id);
    expect(second.index.items.map((t) => t.id)).toEqual([first.id, second.id]);
    expect(loadTournament(first.id, store)?.name).toBe(completeDraft().name);

    const renamed = { ...emptyDraft("Europe/London"), name: "Club open" };
    const saved = saveTournament(second.index, second.id, renamed, store, 3);
    expect(saved.items.find((t) => t.id === second.id)).toMatchObject({ name: "Club open", date: "", updatedAt: 3 });
    // Read back from storage, as on a reload.
    expect(loadIndex(store)).toEqual(saved);
    expect(loadTournament(second.id, store)?.name).toBe("Club open");
    // The other tournament is untouched.
    expect(loadTournament(first.id, store)).toEqual(completeDraft());
  });

  it("switches the current tournament", () => {
    const store = fakeStore();
    const first = createTournament(loadIndex(store), completeDraft(), store, 1);
    const second = createTournament(first.index, emptyDraft("Europe/London"), store, 2);
    expect(loadIndex(store).currentId).toBe(second.id);
    setCurrent(second.index, first.id, store);
    expect(loadIndex(store).currentId).toBe(first.id);
  });

  it("deletes a tournament, and moves to the next one when it was current", () => {
    const store = fakeStore();
    const dated = createTournament(loadIndex(store), completeDraft(), store, 1);
    const blank = createTournament(dated.index, emptyDraft("Europe/London"), store, 2);
    const after = deleteTournament(blank.index, blank.id, store);
    expect(after).toEqual({ currentId: dated.id, items: [dated.index.items[0]] });
    expect(loadTournament(blank.id, store)).toBeNull();
    expect(deleteTournament(after, dated.id, store)).toEqual({ currentId: null, items: [] });
  });

  it("deleting another tournament keeps the current one", () => {
    const store = fakeStore();
    const a = createTournament(loadIndex(store), completeDraft(), store, 1);
    const b = createTournament(a.index, emptyDraft("Europe/London"), store, 2);
    expect(deleteTournament(b.index, a.id, store).currentId).toBe(b.id);
  });

  it("makes the earlier single draft the first saved tournament", () => {
    const store = fakeStore({ "badminton:plan-draft:v5": JSON.stringify(completeDraft()) });
    const index = loadIndex(store, 5);
    expect(index.items).toEqual([{ id: index.currentId, name: completeDraft().name, date: "2026-07-04", updatedAt: 5 }]);
    expect(loadTournament(index.currentId!, store)).toEqual(completeDraft());
    expect(store.data.has("badminton:plan-draft:v5")).toBe(false);
    // Only once.
    expect(loadIndex(store)).toEqual(index);
  });

  it("copes with unreadable storage", () => {
    const store = fakeStore({ "badminton:tournaments:v1": "{not json", "badminton:tournament:v1:x": "{" });
    expect(loadIndex(store)).toEqual({ currentId: null, items: [] });
    expect(loadTournament("x", store)).toBeNull();
    expect(loadIndex(null)).toEqual({ currentId: null, items: [] });
  });

  it("lists undated tournaments first, then the latest date first", () => {
    const sorted = sortTournaments([
      { id: "old", name: "", date: "2024-05-01", updatedAt: 9 },
      { id: "new", name: "", date: "2026-05-01", updatedAt: 1 },
      { id: "draftA", name: "", date: "", updatedAt: 2 },
      { id: "draftB", name: "", date: "", updatedAt: 3 },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["draftB", "draftA", "new", "old"]);
  });
});

describe("duplicateDraft", () => {
  it("copies the structure, not the name, date, entries or draw", () => {
    const draft = completeDraft();
    draft.stage = "draw";
    draft.entries = [{ id: "e1", categoryId: draft.categories[0]!.id, name: "Smashers", external: false, seed: null, players: [], lineUp: {} }];
    draft.draw = { [draft.categories[0]!.id]: { groups: [["e1"]], randomSeed: 1, locked: true } };
    const before = structuredClone(draft);

    const copy = duplicateDraft(draft);
    expect(copy).toMatchObject({ name: "", stage: "plan", entries: [], draw: {} });
    expect(copy.frame.date).toBe("");
    expect(copy.frame.halls).toEqual(draft.frame.halls);
    expect(copy.categories).toEqual(draft.categories);
    expect(copy.finance).toEqual(draft.finance);
    expect(copy.rules).toEqual(draft.rules);
    // A deep copy: the original is unchanged and shares nothing.
    copy.frame.halls[0]!.name = "Changed";
    expect(draft).toEqual(before);
  });
});
