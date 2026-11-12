"use client";

// The organiser's own score sheet (a PDF or an image), used in place of
// ours. The file is kept on this device, in the browser's own store, one per
// tournament; the tournament only remembers its name. It moves to the
// database when tournaments do.

const STORE = "own-sheets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("badminton", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Keeps a tournament's own score sheet on this device. */
export function saveOwnSheet(tournamentId: string, file: Blob): Promise<unknown> {
  return run("readwrite", (store) => store.put(file, tournamentId));
}

/** A tournament's own score sheet, or null when this device doesn't hold it. */
export function loadOwnSheet(tournamentId: string): Promise<Blob | null> {
  return run<Blob | undefined>("readonly", (store) => store.get(tournamentId)).then(
    (file) => file ?? null,
    () => null,
  );
}

export function removeOwnSheet(tournamentId: string): Promise<unknown> {
  return run("readwrite", (store) => store.delete(tournamentId)).catch(() => undefined);
}
