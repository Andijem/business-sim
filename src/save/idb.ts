import type { GameState } from '../sim/types';
import { isGameState } from './code';

const DB = 'temka';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

/** Сохранение на устройстве. Хранится вместе со временем, чтобы позже считать офлайн-прогресс. */
export async function saveGame(st: GameState, slot = 'main'): Promise<void> {
  await tx('readwrite', (s) => s.put({ savedAt: Date.now(), state: st }, slot));
}

export async function loadGame(slot = 'main'): Promise<{ state: GameState; savedAt: number } | null> {
  try {
    const rec = (await tx('readonly', (s) => s.get(slot))) as { state: unknown; savedAt: number } | undefined;
    return rec && isGameState(rec.state) ? { state: rec.state, savedAt: rec.savedAt } : null;
  } catch {
    return null;
  }
}

export async function deleteGame(slot = 'main'): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}
