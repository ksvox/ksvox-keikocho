// ネットがない時の録音をiPad内(IndexedDB)に一時保存する
const DB_NAME = 'keikocho-audio';
const STORE = 'pending';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const result = fn(store);
        t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
        t.onerror = () => reject(t.error);
      })
  );
}

export function notifyPendingChanged() {
  try {
    window.dispatchEvent(new Event('keikocho-pending-changed'));
  } catch (e) {
    /* noop */
  }
}

export async function addPending(rec) {
  await tx('readwrite', (s) => s.put(rec));
  notifyPendingChanged();
}

export async function listPending() {
  try {
    return (await tx('readonly', (s) => s.getAll())) || [];
  } catch (e) {
    return [];
  }
}

export async function removePending(id) {
  await tx('readwrite', (s) => s.delete(id));
  notifyPendingChanged();
}
