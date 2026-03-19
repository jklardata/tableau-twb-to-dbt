// IndexedDB-based file handoff between landing pages and the React app.
// Handles large files reliably (no ~5MB sessionStorage quota limit).

const DB_NAME = 'tableau2dbt_pending';
const STORE = 'files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storePendingFile(key, file, extra = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ name: file.name, blob: file, ...extra }, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function readPendingFile(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const data = getReq.result;
      if (data) store.delete(key);
      if (!data) { resolve(null); return; }
      const { name, blob, ...extra } = data;
      resolve({ file: new File([blob], name), ...extra });
    };
    getReq.onerror = () => resolve(null);
  });
}
