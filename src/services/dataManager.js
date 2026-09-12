// Import/export of the full data set. Version-tagged so future migrations can adapt.
import {
  getAllExercises, getAllWorkouts, getSettings, clearAll, bulkPut, setMeta, SCHEMA_VERSION
} from '../db/database.js';

export async function exportAll() {
  const [exercises, workouts, settings] = await Promise.all([
    getAllExercises(), getAllWorkouts(), getSettings()
  ]);
  return {
    app: 'lift-workout-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    exercises,
    workouts
  };
}

export async function downloadBackup() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `lift-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Validate a parsed backup object. Throws Error on the first structural problem.
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Backup is not a JSON object.');
  if (obj.app !== 'lift-workout-tracker') throw new Error('This file is not a Lift backup.');
  if (typeof obj.schemaVersion !== 'number') throw new Error('Missing schemaVersion.');
  if (obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Backup is from a newer app version (schema v${obj.schemaVersion}). Update the app to import it.`);
  }
  if (!Array.isArray(obj.exercises)) throw new Error('exercises must be an array.');
  if (!Array.isArray(obj.workouts)) throw new Error('workouts must be an array.');
  for (const ex of obj.exercises) {
    if (!ex || typeof ex.id !== 'string' || typeof ex.name !== 'string') throw new Error('Malformed exercise entry.');
  }
  for (const w of obj.workouts) {
    if (!w || typeof w.id !== 'string' || typeof w.date !== 'number') throw new Error('Malformed workout entry.');
    if (!Array.isArray(w.sets)) throw new Error(`Workout ${w.id} has no sets array.`);
  }
  return true;
}

// Replace-all import: wipes and restores. Caller is expected to warn the user first.
export async function importReplaceAll(obj) {
  validateBackup(obj);
  await clearAll();
  await bulkPut('exercises', obj.exercises);
  // Normalize isActive to 0/1 for IDB index compatibility.
  const workouts = obj.workouts.map((w) => ({ ...w, isActive: w.isActive ? 1 : 0 }));
  await bulkPut('workouts', workouts);
  if (obj.settings && typeof obj.settings === 'object') {
    await bulkPut('settings', Object.entries(obj.settings).map(([key, value]) => ({ key, value })));
  }
  await setMeta('initialized', true);
  await setMeta('schemaVersion', SCHEMA_VERSION);
}

// Merge import: keep existing data, add anything with an unseen id.
export async function importMerge(obj) {
  validateBackup(obj);
  const [existingEx, existingW] = await Promise.all([getAllExercises(), getAllWorkouts()]);
  const exIds = new Set(existingEx.map((e) => e.id));
  const woIds = new Set(existingW.map((w) => w.id));
  const newEx = obj.exercises.filter((e) => !exIds.has(e.id));
  const newW = obj.workouts.filter((w) => !woIds.has(w.id)).map((w) => ({ ...w, isActive: 0 }));
  await bulkPut('exercises', newEx);
  await bulkPut('workouts', newW);
  return { newExercises: newEx.length, newWorkouts: newW.length };
}

export async function wipeAllData() {
  await clearAll();
}
