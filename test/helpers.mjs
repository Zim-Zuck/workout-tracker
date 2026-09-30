// Shared machinery for the data-safety tests.
//
// These tests run in Node against fake-indexeddb, driving the REAL
// applyUpgrades() from src/db/database.js — not a copy of it, and not a
// description of what it is supposed to do. A migration test that tests a
// reimplementation of the migration tests nothing.
import 'fake-indexeddb/auto';
import { deepStrictEqual } from 'node:assert/strict';

export const req = (r) => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function deleteDatabase(name) {
  await new Promise((res) => {
    const d = indexedDB.deleteDatabase(name);
    d.onsuccess = d.onerror = d.onblocked = res;
  });
}

// The v1 and v2 schemas exactly as the old builds created them, so a fixture
// database is indistinguishable from one a real user's phone is holding.
export function createLegacySchema(db, version) {
  const w = db.createObjectStore('workouts', { keyPath: 'id' });
  w.createIndex('date', 'date');
  w.createIndex('isActive', 'isActive');
  db.createObjectStore('exercises', { keyPath: 'id' });
  db.createObjectStore('settings', { keyPath: 'key' });
  db.createObjectStore('meta', { keyPath: 'key' });
  if (version >= 2) {
    const o = db.createObjectStore('outbox', { keyPath: 'id' });
    o.createIndex('kind', 'kind');
    o.createIndex('createdAt', 'createdAt');
    db.createObjectStore('socialCache', { keyPath: 'key' });
  }
}

// Build a database at `version` holding `data`, then close it.
export async function buildLegacyDb(name, version, data = {}) {
  await deleteDatabase(name);
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open(name, version);
    q.onupgradeneeded = () => createLegacySchema(q.result, version);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const stores = ['workouts', 'exercises', 'settings', 'meta'];
  const t = db.transaction(stores, 'readwrite');
  for (const w of data.workouts || []) t.objectStore('workouts').put(w);
  for (const e of data.exercises || []) t.objectStore('exercises').put(e);
  for (const s of data.settings || []) t.objectStore('settings').put(s);
  for (const m of data.meta || []) t.objectStore('meta').put(m);
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  db.close();
  return db;
}

// Run the real upgrade against a fixture database and hand back the open
// connection. `applyUpgrades` is passed in so the test file owns the import.
export function upgradeTo(name, version, applyUpgrades) {
  return new Promise((res, rej) => {
    const q = indexedDB.open(name, version);
    q.onupgradeneeded = (e) => applyUpgrades(q.result, e.oldVersion, e.target.transaction);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error || new Error('upgrade failed'));
    q.onblocked = () => rej(new Error('upgrade blocked'));
  });
}

export async function readStore(db, store) {
  if (![...db.objectStoreNames].includes(store)) return null;
  return req(db.transaction(store).objectStore(store).getAll());
}

// ---- The invariants that matter ----
//
// "Nothing was lost" is not a feeling, it is three numbers: how many workouts,
// how many sets, and how much was lifted. Computed straight off the records with
// no app code in the way, so the same function can be run on the before and the
// after and the comparison means something.
export function tally(workouts) {
  let sets = 0;
  let completedSets = 0;
  let volumeKg = 0;
  let reps = 0;
  for (const w of workouts) {
    for (const s of w.sets || []) {
      sets += 1;
      if (!s.completed) continue;
      completedSets += 1;
      reps += s.reps || 0;
      // Working sets only, matching the app's own volume definition — warm-ups
      // and drop sets are logged but not counted as volume.
      if ((s.type || 'working') === 'working') volumeKg += (s.weightKg || 0) * (s.reps || 0);
    }
  }
  return { workouts: workouts.length, sets, completedSets, reps, volumeKg: Math.round(volumeKg * 100) / 100 };
}

export function assertTallyEqual(before, after, label) {
  deepStrictEqual(after, before, `${label}: tally changed\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(after)}`);
}
