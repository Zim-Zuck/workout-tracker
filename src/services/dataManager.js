// Import/export of the full data set. Version-tagged so future migrations can adapt.
import {
  getAllExercises, getAllWorkouts, getSettings, clearAll, bulkPut, setMeta, getMeta,
  SCHEMA_VERSION, readBackupAsExport, readBackupCounts, getBackupInfoLocal, rawDump
} from '../db/database.js';
import { repairWorkout, repairExercise, dedupeById } from '../db/normalize.js';
import { uid } from '../utils/id.js';
import { isWorking, estimate1RM, setVolume } from './calculations.js';
import { formatWeight } from '../utils/units.js';
import { ymd } from '../utils/date.js';

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

// meta key holding when this device last wrote an export file. Drives the gentle
// "Last backup: never" line in Settings — a reminder, never a gate.
export const LAST_EXPORT_KEY = 'lastLocalExportAt';

export function saveJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function downloadBackup() {
  const data = await exportAll();
  saveJsonFile(data, `lift-backup-${stamp()}.json`);
  // Recorded after the file is handed to the browser, so the reminder only
  // clears when an export actually happened.
  await setMeta(LAST_EXPORT_KEY, Date.now()).catch(() => {});
}

export async function getLastExportAt() {
  try { return (await getMeta(LAST_EXPORT_KEY)) || null; } catch { return null; }
}

// ---- The automatic pre-upgrade snapshot, as a restore ----

// What Settings needs to decide whether to offer a restore, and to describe it.
// Returns null when there is no snapshot (a fresh install, or one already retired).
export async function getAutomaticBackupStatus() {
  try {
    const info = await getBackupInfoLocal();
    if (!info) return null;
    const counts = await readBackupCounts();
    if (!counts.workouts && !counts.exercises && !counts.settings) return null;
    return { createdAt: info.createdAt, fromVersion: info.fromVersion, counts };
  } catch {
    return null;
  }
}

// Rebuild the live stores from the snapshot.
//
// It goes through the SAME importer a JSON file goes through — validate, wipe,
// bulk put, normalise — so there is exactly one restore code path in the app and
// a v2-shaped record from the snapshot lands in the current shape. The snapshot
// itself is untouched, so a restore can be repeated.
export async function restoreFromAutomaticBackup() {
  const data = await readBackupAsExport();
  if (!data.workouts.length && !data.exercises.length) {
    throw new Error('The automatic backup is empty — there is nothing to restore.');
  }
  return importReplaceAll(data);
}

// Download the snapshot as an ordinary backup file, for somebody who wants the
// pre-upgrade data in their hand rather than back in the app.
export async function downloadAutomaticBackup() {
  const data = await readBackupAsExport();
  saveJsonFile(data, `lift-pre-upgrade-backup-${stamp()}.json`);
}

// ---- Recovery: exporting when the app cannot start ----
//
// Reads the raw stores at whatever version is on disk and writes them out. No
// normalisation, no validation, no openDB() — the whole point is that this works
// when the code above it does not.
export async function downloadRawDump() {
  const data = await rawDump();
  saveJsonFile(data, `lift-raw-export-${stamp()}.json`);
  const counts = Object.fromEntries(
    Object.entries(data.stores || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );
  return counts;
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
  // Record-level problems are NOT fatal any more.
  //
  // They used to be: one workout with a null date, and the import threw before
  // writing a single record, so a file holding five years of training was
  // refused whole because of one bad row. The envelope checks above are what
  // tell us this is a Kun backup at all; from here on the job is to salvage as
  // much of it as possible. prepareImport() below repairs each record and
  // reports what it had to touch.
  return true;
}

// Turn a validated backup into exactly what goes into the database, repairing
// what is broken and collapsing duplicate ids. Pure — no database access — so a
// test can assert the outcome without opening IndexedDB, and so the counts shown
// to the user are the counts that will be written.
export function prepareImport(obj) {
  const problems = { repairedWorkouts: 0, repairedExercises: 0, droppedWorkouts: 0, droppedExercises: 0 };

  const exercisesRaw = [];
  for (const ex of obj.exercises) {
    const fixed = repairExercise(ex, () => uid('ex'));
    if (!fixed) { problems.droppedExercises += 1; continue; }
    if (fixed.id !== ex?.id || fixed.name !== ex?.name) problems.repairedExercises += 1;
    exercisesRaw.push(fixed);
  }

  const workoutsRaw = [];
  for (const w of obj.workouts) {
    const fixed = repairWorkout(w, () => uid('wo'));
    if (!fixed) { problems.droppedWorkouts += 1; continue; }
    if (fixed.id !== w?.id || fixed.date !== w?.date || !Array.isArray(w?.sets)) problems.repairedWorkouts += 1;
    workoutsRaw.push(fixed);
  }

  // A more complete session wins a key collision; the loser is re-keyed, not lost.
  const ex = dedupeById(exercisesRaw);
  const wo = dedupeById(workoutsRaw, { weigh: (w) => w.sets.length });

  // Only one workout may be active. Two active sessions makes getActiveWorkout()
  // pick arbitrarily and the resume pill point somewhere random; the most recent
  // one is the one the person was actually in.
  const active = wo.items.filter((w) => w.isActive).sort((a, b) => b.date - a.date);
  for (const w of active.slice(1)) w.isActive = 0;

  const settings = (obj.settings && typeof obj.settings === 'object') ? obj.settings : {};
  return {
    exercises: ex.items,
    workouts: wo.items,
    settings,
    problems: { ...problems, duplicateWorkouts: wo.duplicates, duplicateExercises: ex.duplicates }
  };
}

// Replace-all import: wipes and restores. Caller is expected to warn the user first.
// A backup can predate the v3 fields (order, completedAt, skipped) — schema
// version 1 backups are still valid and still importable. Every restored workout
// goes through the same repair + normalise the database upgrade uses, so a
// two-year-old export lands in exactly the shape a fresh session would.
//
// Returns the problem report from prepareImport(), so the caller can tell the
// user "restored 1,284 workouts, repaired 3" rather than just "done".
export async function importReplaceAll(obj) {
  validateBackup(obj);
  const { exercises, workouts, settings, problems } = prepareImport(obj);
  await clearAll();
  await bulkPut('exercises', exercises);
  await bulkPut('workouts', workouts);
  await bulkPut('settings', Object.entries(settings).map(([key, value]) => ({ key, value })));
  await setMeta('initialized', true);
  await setMeta('schemaVersion', SCHEMA_VERSION);
  return { workouts: workouts.length, exercises: exercises.length, problems };
}

// Merge import: keep existing data, add anything with an unseen id.
export async function importMerge(obj) {
  validateBackup(obj);
  const [existingEx, existingW] = await Promise.all([getAllExercises(), getAllWorkouts()]);
  const exIds = new Set(existingEx.map((e) => e.id));
  const woIds = new Set(existingW.map((w) => w.id));
  const newEx = obj.exercises.filter((e) => !exIds.has(e.id));
  const newW = obj.workouts
    .filter((w) => !woIds.has(w.id))
    .map((w) => ({ ...repairWorkout(w, () => uid('wo')), isActive: 0 }));
  await bulkPut('exercises', newEx);
  await bulkPut('workouts', newW);
  return { newExercises: newEx.length, newWorkouts: newW.length };
}

export async function wipeAllData() {
  await clearAll();
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Flat CSV of every completed set across finished workouts, for spreadsheet analysis.
export async function downloadSetsCSV() {
  const [exercises, workouts] = await Promise.all([getAllExercises(), getAllWorkouts()]);
  const exNames = new Map(exercises.map((e) => [e.id, e.name]));
  const rows = [['Date', 'Time', 'Workout', 'Exercise', 'Type', 'Weight (kg)', 'Reps', 'Est. 1RM (kg)', 'Volume (kg)']];
  const sorted = [...workouts].filter((w) => !w.isActive).sort((a, b) => a.date - b.date);
  for (const w of sorted) {
    for (const s of [...w.sets].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!s.completed) continue;
      const ts = s.timestamp || w.date;
      const d = new Date(ts);
      rows.push([
        ymd(ts),
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        w.name || 'Workout',
        exNames.get(s.exerciseId) || 'Unknown',
        s.type,
        formatWeight(s.weightKg, { withUnit: false }),
        s.reps,
        isWorking(s) ? formatWeight(estimate1RM(s.weightKg, s.reps), { withUnit: false }) : '',
        isWorking(s) ? formatWeight(setVolume(s), { withUnit: false }) : ''
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvField).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `lift-sets-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
