// Thin promise wrapper around IndexedDB. No third-party dep.
// Stores:
//   exercises      key: id          (exercise definitions)
//   workouts       key: id, idx: date  (completed + active workouts; active is workouts[isActive=true])
//   settings       key: key         (single-row config)
//   meta           key: key         (schema version, etc.)
//   outbox         key: id, idx: kind  (pending cloud writes; survives app kill)
//   socialCache    key: key         (last-known profiles/friends/challenges, for offline render)
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';
import { normalizeWorkout } from './normalize.js';

const DB_NAME = 'lift-db';
const DB_VERSION = 3;
// Backup/export format version. Deliberately still 1: v2 added only local-only
// stores (outbox, socialCache) which are never exported, so v1 backups remain
// valid and older app builds can still read files written by this one.
export const SCHEMA_VERSION = 1;

let _dbPromise = null;

// The schema upgrade, as a plain function so it can be exercised against a
// purpose-built old database in a test rather than only against whatever
// happens to be on this device. openDB() below is its only production caller.
//
// `db` is the IDBDatabase mid-upgrade, `oldVersion` the version being upgraded
// from, `transaction` the versionchange transaction.
export function applyUpgrades(db, oldVersion, transaction) {
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

    // v2: social layer. Both stores are local-only scratch space — the outbox
    // holds cloud writes waiting for a connection, socialCache holds the last
    // successful read of each social screen so they render offline. Neither
    // contains anything that isn't reconstructible, so no data migration is
    // needed and a user upgrading loses nothing.
    if (oldVersion < 2) {
    if (!db.objectStoreNames.contains('outbox')) {
        const s = db.createObjectStore('outbox', { keyPath: 'id' });
        s.createIndex('kind', 'kind');
        s.createIndex('createdAt', 'createdAt');
    }
    if (!db.objectStoreNames.contains('socialCache')) {
        db.createObjectStore('socialCache', { keyPath: 'key' });
    }
    }

    // v3: stable set ordering, skip tracking, and split names.
    //
    // The first DATA migration this app has had — v2 only added empty stores.
    // Every existing workout is rewritten through normalizeWorkout(), which
    // assigns each set a permanent `order` from its historical timestamp
    // sequence, splits completion time out of `timestamp` into `completedAt`,
    // and gives the workout an empty `skipped` list and a null `split`.
    //
    // It runs inside the upgrade transaction, so it either completes fully or
    // the whole upgrade rolls back and the database stays on v2 — there is no
    // state where half the history has been rewritten. normalizeWorkout() is
    // additive and idempotent: no field is dropped, and a record that already
    // has the new shape passes through unchanged.
    if (oldVersion < 3) {
      const cursorReq = transaction.objectStore('workouts').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        // update() rather than put(): keeps us on the cursor's own key and
        // cannot accidentally insert under a changed id.
        cursor.update(normalizeWorkout(cursor.value));
        cursor.continue();
      };
    }

    // Next schema change: bump DB_VERSION above and add `if (oldVersion < 4) { ... }`
    // here (new stores/indexes, or data rewrites via transaction).

}

export function openDB() {
  if (_dbPromise) return _dbPromise;
  let settled = false;
  let blocked = false;
  _dbPromise = new Promise((resolve, reject) => {
    const settle = (fn) => (v) => { if (settled) return; settled = true; fn(v); };
    const _resolve = resolve; const _reject = reject;
    resolve = settle(_resolve); reject = settle(_reject);
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB not supported in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => applyUpgrades(req.result, e.oldVersion, e.target.transaction);

    req.onsuccess = () => {
      const db = req.result;
      // WHEN ANOTHER TAB NEEDS TO UPGRADE, GET OUT OF ITS WAY.
      //
      // Without this, an older tab holding a connection blocks a newer tab's
      // version upgrade indefinitely: the new tab's open request never fires
      // success, never fires error, and the app sits on its loading spinner
      // forever with nothing on screen to explain why. Closing here lets the
      // upgrade proceed; this tab's own next database call reopens at the new
      // version through the same memoised promise being reset below.
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Fires when an upgrade cannot start because another connection is still
    // open and has not yielded. With onversionchange above this should be
    // momentary, so we wait rather than failing instantly — but we do not wait
    // forever (see the timeout below).
    req.onblocked = () => {
      blocked = true;
    };

    // A last-resort guard so a wedged connection surfaces as a message the user
    // can act on instead of an infinite spinner. Ten seconds is far longer than
    // any real upgrade of a database this size.
    setTimeout(() => {
      if (settled) return;
      reject(new Error(
        blocked
          ? 'Another tab is using an older version of Kun Workouts. Close it and reload.'
          : 'The database did not open. Close any other tabs running this app and reload.'
      ));
    }, 10000);
  }).catch((err) => {
    // Never cache a failure: the next attempt (after the user closes the other
    // tab and reloads, or simply retries) gets a fresh request.
    _dbPromise = null;
    throw err;
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
// Every read normalises. The v3 upgrade already rewrote what was on disk, but a
// record can still arrive from a backup restore, a second tab on an older build,
// or a future field this build does not write — and a half-shaped workout
// reaching the UI is how you get a crash in a list render. Normalising is pure
// and idempotent, so this costs a map over already-correct data.
export async function getAllWorkouts() {
  const db = await openDB();
  const list = await reqPromise(tx(db, 'workouts').objectStore('workouts').getAll());
  return (list || []).map(normalizeWorkout).sort((a, b) => b.date - a.date);
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
  return list && list[0] ? normalizeWorkout(list[0]) : null;
}
export async function getWorkout(id) {
  const db = await openDB();
  const w = await reqPromise(tx(db, 'workouts').objectStore('workouts').get(id));
  return w ? normalizeWorkout(w) : w;
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

// ---- Outbox (pending cloud writes) ----
export async function getOutbox() {
  const db = await openDB();
  const list = await reqPromise(tx(db, 'outbox').objectStore('outbox').getAll());
  return (list || []).sort((a, b) => a.createdAt - b.createdAt);
}
export async function putOutboxItem(item) {
  const db = await openDB();
  const t = tx(db, 'outbox', 'readwrite');
  await reqPromise(t.objectStore('outbox').put(item));
  return item;
}
export async function deleteOutboxItem(id) {
  const db = await openDB();
  const t = tx(db, 'outbox', 'readwrite');
  await reqPromise(t.objectStore('outbox').delete(id));
}
// Drop every queued item of a kind. Used for idempotent snapshot kinds, where an
// older queued copy is pure noise once a newer one exists.
export async function deleteOutboxByKind(kind) {
  const db = await openDB();
  const t = tx(db, 'outbox', 'readwrite');
  const idx = t.objectStore('outbox').index('kind');
  const matches = await reqPromise(idx.getAll(kind));
  await Promise.all((matches || []).map((m) => reqPromise(t.objectStore('outbox').delete(m.id))));
}
export async function clearOutbox() {
  const db = await openDB();
  const t = tx(db, 'outbox', 'readwrite');
  await reqPromise(t.objectStore('outbox').clear());
}

// ---- Social cache (last known cloud reads, for offline render) ----
export async function getCached(key) {
  const db = await openDB();
  const r = await reqPromise(tx(db, 'socialCache').objectStore('socialCache').get(key));
  return r || null; // { key, value, cachedAt }
}
export async function setCached(key, value) {
  const db = await openDB();
  const t = tx(db, 'socialCache', 'readwrite');
  const row = { key, value, cachedAt: Date.now() };
  await reqPromise(t.objectStore('socialCache').put(row));
  return row;
}
// Wipe cached social data — on sign-out, so the next account never sees the
// previous user's friends or stats, even for a frame.
export async function clearSocialCache() {
  const db = await openDB();
  const t = tx(db, 'socialCache', 'readwrite');
  await reqPromise(t.objectStore('socialCache').clear());
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
  if (!initialized) {
    await bulkPut('exercises', DEFAULT_EXERCISES);
    await setMeta('initialized', true);
    await setMeta('schemaVersion', SCHEMA_VERSION);
    return;
  }
  // Builtins added in a later app update aren't covered by the one-time seed
  // above, so top up anything missing by id. Leaves existing rows (including
  // user edits to builtins) untouched.
  const existingIds = new Set((await getAllExercises()).map((e) => e.id));
  const missing = DEFAULT_EXERCISES.filter((e) => !existingIds.has(e.id));
  if (missing.length) await bulkPut('exercises', missing);
}
