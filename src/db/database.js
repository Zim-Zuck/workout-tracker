// Thin promise wrapper around IndexedDB. No third-party dep.
// Stores:
//   exercises      key: id          (exercise definitions)
//   workouts       key: id, idx: date  (completed + active workouts; active is workouts[isActive=true])
//   settings       key: key         (single-row config)
//   meta           key: key         (schema version, etc.)
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';

const DB_NAME = 'lift-db';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB not supported in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;

      // Each block runs only for DBs upgrading across that version, so a device
      // already on version N skips blocks <= N and only applies newer ones.
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('exercises')) {
          db.createObjectStore('exercises', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('workouts')) {
          const s = db.createObjectStore('workouts', { keyPath: 'id' });
          s.createIndex('date', 'date');
          s.createIndex('isActive', 'isActive');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      }

      // Next schema change: bump DB_VERSION below and add `if (oldVersion < 2) { ... }`
      // here (new stores/indexes, or data rewrites via e.target.transaction).
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked by another tab.'));
  });
  return _dbPromise;
}

function tx(db, stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Exercises ----
export async function getAllExercises() {
  const db = await openDB();
  const r = await reqPromise(tx(db, 'exercises').objectStore('exercises').getAll());
  return r || [];
}
export async function saveExercise(ex) {
  const db = await openDB();
  const t = tx(db, 'exercises', 'readwrite');
  await reqPromise(t.objectStore('exercises').put(ex));
  return ex;
}
export async function deleteExercise(id) {
  const db = await openDB();
  const t = tx(db, 'exercises', 'readwrite');
  await reqPromise(t.objectStore('exercises').delete(id));
}
export async function getExercise(id) {
  const db = await openDB();
  return reqPromise(tx(db, 'exercises').objectStore('exercises').get(id));
}

// ---- Workouts ----
export async function getAllWorkouts() {
  const db = await openDB();
  const list = await reqPromise(tx(db, 'workouts').objectStore('workouts').getAll());
  return (list || []).sort((a, b) => b.date - a.date);
}
export async function saveWorkout(w) {
  const db = await openDB();
  const t = tx(db, 'workouts', 'readwrite');
  await reqPromise(t.objectStore('workouts').put(w));
  return w;
}
export async function deleteWorkout(id) {
  const db = await openDB();
  const t = tx(db, 'workouts', 'readwrite');
  await reqPromise(t.objectStore('workouts').delete(id));
}
export async function getActiveWorkout() {
  const db = await openDB();
  // isActive stored as 1/0 (booleans aren't valid IDB index keys on iOS).
  const idx = tx(db, 'workouts').objectStore('workouts').index('isActive');
  const list = await reqPromise(idx.getAll(1));
  return (list && list[0]) || null;
}
export async function getWorkout(id) {
  const db = await openDB();
  return reqPromise(tx(db, 'workouts').objectStore('workouts').get(id));
}

// ---- Settings & meta ----
export async function getSettings() {
  const db = await openDB();
  const rows = await reqPromise(tx(db, 'settings').objectStore('settings').getAll());
  const out = {};
  for (const r of rows || []) out[r.key] = r.value;
  return out;
}
export async function setSetting(key, value) {
  const db = await openDB();
  const t = tx(db, 'settings', 'readwrite');
  await reqPromise(t.objectStore('settings').put({ key, value }));
}
export async function getMeta(key) {
  const db = await openDB();
  const r = await reqPromise(tx(db, 'meta').objectStore('meta').get(key));
  return r ? r.value : undefined;
}
export async function setMeta(key, value) {
  const db = await openDB();
  const t = tx(db, 'meta', 'readwrite');
  await reqPromise(t.objectStore('meta').put({ key, value }));
}

// ---- Bulk ops (for import / wipe) ----
export async function clearAll() {
  const db = await openDB();
  const t = tx(db, ['exercises', 'workouts', 'settings', 'meta'], 'readwrite');
  await Promise.all([
    reqPromise(t.objectStore('exercises').clear()),
    reqPromise(t.objectStore('workouts').clear()),
    reqPromise(t.objectStore('settings').clear()),
    reqPromise(t.objectStore('meta').clear())
  ]);
}

export async function bulkPut(storeName, items) {
  if (!items || !items.length) return;
  const db = await openDB();
  const t = tx(db, storeName, 'readwrite');
  const s = t.objectStore(storeName);
  await Promise.all(items.map((it) => reqPromise(s.put(it))));
}

// ---- Initial seed of default exercise library on first launch ----
export async function ensureInitialized() {
  const initialized = await getMeta('initialized');
  if (initialized) return;
  await bulkPut('exercises', DEFAULT_EXERCISES);
  await setMeta('initialized', true);
  await setMeta('schemaVersion', SCHEMA_VERSION);
}
