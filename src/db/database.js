// Thin promise wrapper around IndexedDB. No third-party dep.
// Stores:
//   exercises      key: id          (exercise definitions)
//   workouts       key: id, idx: date  (completed + active workouts; active is workouts[isActive=true])
//   settings       key: key         (single-row config)
//   meta           key: key         (schema version, etc.)
//   outbox         key: id, idx: kind  (pending cloud writes; survives app kill)
//   socialCache    key: key         (last-known profiles/friends/challenges, for offline render)
//   workouts_backup_v2  key: id       (pre-upgrade snapshot; safety net, see BACKUP_META_KEY)
//   exercises_backup_v2 key: id       (ditto)
//   settings_backup_v2  key: key      (ditto)
import { DEFAULT_EXERCISES } from '../data/defaultExercises.js';
import { normalizeWorkout } from './normalize.js';

const DB_NAME = 'lift-db';
const DB_VERSION = 4;
// Backup/export format version. Deliberately still 1: v2 added only local-only
// stores (outbox, socialCache) which are never exported, so v1 backups remain
// valid and older app builds can still read files written by this one.
export const SCHEMA_VERSION = 1;

// The automatic pre-upgrade snapshot.
//
// Taken inside the versionchange transaction, BEFORE any record is rewritten, so
// the safety net exists before there is anything to be saved from. Named for the
// schema it was taken at (v2, the last pre-redesign version) rather than for a
// date, because what matters when restoring is "which shape is in here".
export const BACKUP_STORES = {
  workouts: 'workouts_backup_v2',
  exercises: 'exercises_backup_v2',
  settings: 'settings_backup_v2'
};
// meta key holding { createdAt, fromVersion, counts, launches }. Its presence is
// what makes the Settings restore option appear.
export const BACKUP_META_KEY = 'backupV2';
// How long the snapshot is kept. Both conditions must be met before it is
// dropped: enough time for a problem to surface, and enough clean launches that
// we know the new build actually works on this device.
export const BACKUP_KEEP_DAYS = 30;
export const BACKUP_KEEP_LAUNCHES = 5;

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

    // THE SAFETY NET, TAKEN BEFORE ANYTHING IS REWRITTEN.
    //
    // This block is deliberately placed ABOVE the v3 data migration below, not
    // in version order, because ordering here is execution order: the snapshot
    // has to be on disk before the first record is touched, or it is not a
    // safety net, it is a copy of the result.
    //
    // The stores are created for every database, including a brand-new one, so
    // the schema is the same shape everywhere and no read path has to ask
    // whether a store exists. They are only FILLED when there was existing data
    // to protect (oldVersion >= 1).
    if (oldVersion < 4) {
      for (const [source, backup] of Object.entries(BACKUP_STORES)) {
        if (!db.objectStoreNames.contains(backup)) {
          db.createObjectStore(backup, { keyPath: source === 'settings' ? 'key' : 'id' });
        }
      }
      if (oldVersion >= 1) {
        const counts = { workouts: 0, exercises: 0, settings: 0 };
        let outstanding = 0;
        // The manifest records how much was copied, so a later restore can say
        // "1,284 workouts" and a test can assert nothing was lost. It is written
        // from inside the last cursor's completion — not alongside the loop —
        // because the counts do not exist until the copying has finished.
        const writeManifest = () => {
          transaction.objectStore('meta').put({
            key: BACKUP_META_KEY,
            value: { createdAt: Date.now(), fromVersion: oldVersion, counts, launches: 0 }
          });
        };
        for (const [source, backup] of Object.entries(BACKUP_STORES)) {
          // Copied with a cursor rather than getAll()+put(): the transaction
          // stays alive while requests are outstanding, memory stays flat for a
          // 5,000-workout history, and a failure anywhere aborts the whole
          // versionchange transaction — which is exactly what we want, because
          // an upgrade that could not take a backup must not proceed.
          const dest = transaction.objectStore(backup);
          const cur = transaction.objectStore(source).openCursor();
          outstanding += 1;
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) {
              outstanding -= 1;
              if (outstanding === 0) writeManifest();
              return;
            }
            // No structuredClone needed: the value we hold is already a fresh
            // deserialisation of the record, and put() serialises it again.
            dest.put(c.value);
            counts[source] += 1;
            c.continue();
          };
        }
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

    // Next schema change: bump DB_VERSION above and add `if (oldVersion < 5) { ... }`
    // here (new stores/indexes, or data rewrites via transaction). If it rewrites
    // records, take a fresh snapshot first, the way the v4 block above does.

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
    // Whether a schema upgrade is actually running. The watchdog below must not
    // give up on one: a 5,000-workout history is copied and rewritten inside this
    // transaction, and on a cold iPhone that is not instant. Timing out on a
    // running migration would put the recovery screen in front of somebody whose
    // upgrade was about to succeed.
    let upgrading = false;
    req.onupgradeneeded = (e) => {
      upgrading = true;
      const t = e.target.transaction;
      t.addEventListener('complete', () => { upgrading = false; });
      t.addEventListener('abort', () => { upgrading = false; });
      applyUpgrades(req.result, e.oldVersion, t);
    };

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
      // A tab that yields does so within a frame or two, so if we are still
      // blocked after a short grace period it is a tab that will not yield — an
      // old service worker holding a client, or a window the user has forgotten.
      // Say so now rather than making them watch a spinner for ten seconds.
      setTimeout(() => {
        if (settled) return;
        reject(new Error(
          'Another tab or window still has an older version of Kun Workouts open. '
          + 'Close it and reload this page. Your workouts are safe and untouched.'
        ));
      }, 2000);
    };

    // A last-resort guard so a wedged connection surfaces as a message the user
    // can act on instead of an infinite spinner.
    //
    // It WAITS OUT A RUNNING UPGRADE rather than cutting it off. The thing this
    // guard is for is a connection that never got started; an upgrade that is
    // mid-flight is the one case where a long wait is correct, and interrupting
    // it is the worst thing the app could do at that moment.
    const watchdog = () => {
      if (settled) return;
      if (upgrading) { setTimeout(watchdog, 10000); return; }
      reject(new Error(
        blocked
          ? 'Another tab is using an older version of Kun Workouts. Close it and reload.'
          : 'The database did not open. Close any other tabs running this app and reload.'
      ));
    };
    setTimeout(watchdog, 10000);
  }).catch((err) => {
    // Never cache a failure: the next attempt (after the user closes the other
    // tab and reloads, or simply retries) gets a fresh request.
    _dbPromise = null;
    throw err;
  });
  return _dbPromise;
}

// Drop the memoised connection, closing it first.
//
// The app itself never needs this — one connection for the life of the tab is
// correct — but a test that wants a fresh database between cases does, and so
// would any future code that needs the next openDB() to re-run the upgrade path.
export async function closeDB() {
  const p = _dbPromise;
  _dbPromise = null;
  if (!p) return;
  try { (await p).close(); } catch { /* already closed or never opened */ }
}

// The current schema version, exported so a test can open a fixture database at
// the version the app will actually ask for rather than hard-coding a number
// that goes stale the next time the schema changes.
export const CURRENT_DB_VERSION = DB_VERSION;
export const DB_NAME_FOR_TESTS = DB_NAME;

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
// Finished workouts the server does not have yet, oldest first.
//
// A full scan rather than an index: adding an index would mean a schema upgrade
// that rewrites every row to populate it, and this runs once on launch and once
// per reconnect over a list the app already reads whole on every refresh.
export async function getUnsyncedWorkouts() {
  const all = await getAllWorkouts();
  return all
    .filter((w) => !w.isActive && w.status === 'finished' && w.synced === false)
    .sort((a, b) => a.date - b.date);
}

// Flip one workout's `synced` flag without rewriting anything else about it.
//
// Reads, patches and writes inside ONE readwrite transaction, so a set edit
// landing at the same moment cannot be clobbered by a stale copy held across an
// await. Returns false when the record is gone (deleted while queued), which is
// the signal to drop its queued upload rather than retry forever.
export async function setWorkoutSynced(id, synced) {
  const db = await openDB();
  const t = tx(db, 'workouts', 'readwrite');
  const store = t.objectStore('workouts');
  const existing = await reqPromise(store.get(id));
  if (!existing) return false;
  await reqPromise(store.put({ ...existing, synced: !!synced }));
  return true;
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
// Wipe the live stores. The automatic pre-upgrade snapshot and its manifest are
// deliberately NOT touched: an import or a "clear all data" is exactly the moment
// somebody might need the net, and clearing meta wholesale used to orphan the
// backup stores behind a manifest that no longer existed.
export async function clearAll() {
  const db = await openDB();
  const t = tx(db, ['exercises', 'workouts', 'settings', 'meta'], 'readwrite');
  const metaStore = t.objectStore('meta');
  const preserved = await reqPromise(metaStore.get(BACKUP_META_KEY));
  await Promise.all([
    reqPromise(t.objectStore('exercises').clear()),
    reqPromise(t.objectStore('workouts').clear()),
    reqPromise(t.objectStore('settings').clear()),
    reqPromise(metaStore.clear())
  ]);
  if (preserved) await reqPromise(metaStore.put(preserved));
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

// ---- The automatic pre-upgrade backup ----
//
// Everything below reads or retires the snapshot taken by the v4 block of
// applyUpgrades(). Nothing below ever writes to it: a backup that the running
// app can modify is not a backup.

// The manifest, or null if this device never had data to protect (a fresh
// install) or the snapshot has already been retired.
export async function getBackupInfoLocal() {
  const info = await getMeta(BACKUP_META_KEY);
  return info || null;
}

// What is actually in the snapshot, counted from the stores rather than trusted
// from the manifest — so the Settings row cannot promise a restore of 1,284
// workouts that are not there.
export async function readBackupCounts() {
  const db = await openDB();
  const t = tx(db, Object.values(BACKUP_STORES));
  const [workouts, exercises, settings] = await Promise.all(
    Object.values(BACKUP_STORES).map((name) => reqPromise(t.objectStore(name).count()))
  );
  return { workouts, exercises, settings };
}

// The snapshot as a backup-file-shaped object, so it can be fed to the exact
// same importer a JSON file goes through, or downloaded as one.
export async function readBackupAsExport() {
  const db = await openDB();
  const t = tx(db, Object.values(BACKUP_STORES));
  const [workouts, exercises, settingRows] = await Promise.all([
    reqPromise(t.objectStore(BACKUP_STORES.workouts).getAll()),
    reqPromise(t.objectStore(BACKUP_STORES.exercises).getAll()),
    reqPromise(t.objectStore(BACKUP_STORES.settings).getAll())
  ]);
  const settings = {};
  for (const r of settingRows || []) settings[r.key] = r.value;
  const info = await getBackupInfoLocal();
  return {
    app: 'lift-workout-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(info?.createdAt || Date.now()).toISOString(),
    fromDbVersion: info?.fromVersion ?? null,
    settings,
    exercises: exercises || [],
    workouts: workouts || []
  };
}

// Count the launch, and retire the snapshot once it has clearly done its job.
//
// Two conditions, both required: BACKUP_KEEP_DAYS of calendar time, so a problem
// that only shows up on the third week still has something to fall back on, and
// BACKUP_KEEP_LAUNCHES clean starts, so a device that opens the app once a month
// keeps its net until the new build has actually proven itself there.
//
// Returns { kept: true } or { kept: false, reason }. Silent either way: this is
// housekeeping, and there is nothing here a person needs to be told.
export async function noteLaunchAndMaybeCleanBackup(now = Date.now()) {
  const info = await getBackupInfoLocal();
  if (!info) return { kept: false, reason: 'none' };
  const launches = (info.launches || 0) + 1;
  const ageDays = (now - (info.createdAt || now)) / 86400000;
  if (ageDays < BACKUP_KEEP_DAYS || launches < BACKUP_KEEP_LAUNCHES) {
    await setMeta(BACKUP_META_KEY, { ...info, launches });
    return { kept: true, launches, ageDays };
  }
  const db = await openDB();
  const t = tx(db, [...Object.values(BACKUP_STORES), 'meta'], 'readwrite');
  await Promise.all(Object.values(BACKUP_STORES).map((n) => reqPromise(t.objectStore(n).clear())));
  await reqPromise(t.objectStore('meta').delete(BACKUP_META_KEY));
  return { kept: false, reason: 'retired', launches, ageDays };
}

// ---- Reading the database without being able to run the app ----
//
// Opens at WHATEVER VERSION IS ON DISK — no version argument, so no upgrade is
// triggered and no data is touched — and dumps every store it finds. This is the
// function the recovery screen uses: it has to work when applyUpgrades() itself
// is what failed, which rules out openDB() and every helper above it.
export async function rawDump() {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is not available in this browser.');
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the database.'));
    req.onblocked = () => reject(new Error('Another tab is holding the database open. Close it and try again.'));
  });
  try {
    const names = [...db.objectStoreNames];
    if (!names.length) return { app: 'lift-workout-tracker-raw', dbVersion: db.version, stores: {} };
    const t = db.transaction(names, 'readonly');
    const stores = {};
    // Read every store, including the backup stores and the ones a future build
    // may have added. A raw dump is not the place to be selective.
    await Promise.all(names.map(async (n) => {
      try { stores[n] = await reqPromise(t.objectStore(n).getAll()); }
      catch (err) { stores[n] = { error: String(err?.message || err) }; }
    }));
    return {
      app: 'lift-workout-tracker-raw',
      note: 'Raw store dump taken by the recovery screen. Import it back with Settings → Import, '
        + 'or send it on for help — every record the app had is in here.',
      dbVersion: db.version,
      dumpedAt: new Date().toISOString(),
      stores
    };
  } finally {
    db.close();
  }
}

// ---- Storage eviction ----
//
// Browsers evict "best effort" origin storage under pressure. A persisted origin
// is not evicted without the user deleting it. Asking is free and silent: the
// answer depends on engagement heuristics we do not control, and a denial is not
// an error — it is the normal answer on a first visit.
//
// iOS Safari: see DESIGN.md §12. An INSTALLED (Home Screen) PWA is durable; a
// tab is subject to the 7-day eviction of unused script-writable storage, and
// persist() there resolves false more often than not.
export async function requestPersistentStorage() {
  try {
    if (!navigator?.storage?.persist) return { supported: false, persisted: false };
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (already) return { supported: true, persisted: true, alreadyGranted: true };
    const granted = await navigator.storage.persist();
    return { supported: true, persisted: !!granted };
  } catch (err) {
    // Never let a storage-policy question break boot.
    return { supported: false, persisted: false, error: String(err?.message || err) };
  }
}

export async function storageEstimate() {
  try {
    if (!navigator?.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? null, quota: quota ?? null };
  } catch { return null; }
}
