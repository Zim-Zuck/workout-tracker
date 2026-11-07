// EXPORTING A HANDFUL OF WORKOUTS, AS TEXT A PERSON CAN READ.
//
// This is NOT the backup path. dataManager.js exports the whole database as
// JSON so it can be restored; this exports a CHOSEN FEW workouts so they can be
// pasted into a message, a coach's inbox or a spreadsheet. Different job,
// different shape: no envelope, no schema version, nothing machine-only.
//
// Everything here is PURE — strings in, strings out, no IndexedDB and no DOM —
// so the format is covered by tests rather than by opening the app and reading
// it. The two functions that touch the browser (copy, download) live at the
// bottom and do nothing but move an already-built string.
import { orderedSets, setLabels } from '../db/normalize.js';
import { workoutTitle } from './splits.js';
import { isWorking, workingVolume, estimate1RM, setVolume } from './calculations.js';
import { formatWeight, formatVolume } from '../utils/units.js';
import { formatDuration, ymd } from '../utils/date.js';

// Dates in an export are written out in full, with the year, and NOT via
// formatDate() — that one drops the year because on History you already know
// what year it is. In a file that gets pasted somewhere else six months later,
// you don't.
function longDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

function clockTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// One set, as it reads in prose: "60 kg × 10". A set that was logged but never
// ticked is marked rather than hidden — it is part of what happened in the
// session, and silently dropping it would make the export disagree with the
// screen it came from.
function setPhrase({ set, tag }) {
  // A pull-up logged at zero is not "0 kg × 8", it is eight pull-ups. The app
  // stores bodyweight work as a 0 kg load, and printing that number in a
  // message to another human reads as a bug.
  const core = set.weightKg ? `${formatWeight(set.weightKg)} × ${set.reps}` : `bodyweight × ${set.reps}`;
  const marks = [];
  if (tag) marks.push(tag === 'W' ? 'warm-up' : tag === 'D' ? 'drop' : 'failure');
  if (!set.completed) marks.push('not done');
  return marks.length ? `${core} (${marks.join(', ')})` : core;
}

// A workout as a readable block. `exMap` is id → exercise, exactly as History
// already builds it.
export function workoutToText(w, exMap) {
  const title = workoutTitle(w, exMap);
  const dur = w.endTime && w.startTime ? w.endTime - w.startTime : 0;
  const head = [title, `${longDate(w.date)}, ${clockTime(w.startTime || w.date)}`];
  if (dur) head.push(formatDuration(dur));

  const lines = [head.join(' · ')];
  if (w.name && w.name !== title) lines.push(`"${w.name}"`);
  lines.push('');

  // The exercise order the person actually trained in, falling back to first
  // appearance in the sets for a record that lost its exercise list.
  const ids = w.exercises?.length ? w.exercises : [...new Set((w.sets || []).map((s) => s.exerciseId))];
  for (const id of ids) {
    const ex = exMap.get(id);
    lines.push(ex ? ex.name : `Deleted exercise (${String(id).slice(0, 8)}…)`);
    const rows = setLabels(orderedSets(w.sets || [], id));
    lines.push(rows.length ? `  ${rows.map(setPhrase).join(', ')}` : '  no sets');
  }

  const skipped = (w.skipped || [])
    .map((id) => exMap.get(id)?.name)
    .filter(Boolean);
  if (skipped.length) lines.push(`Skipped: ${skipped.join(', ')}`);

  const working = (w.sets || []).filter(isWorking);
  lines.push('');
  lines.push(`${working.length} working ${working.length === 1 ? 'set' : 'sets'} · ${formatVolume(workingVolume(w.sets || []))}`);
  if (w.notes) lines.push(`Notes: ${w.notes}`);

  return lines.join('\n');
}

// The chosen workouts as one pasteable document, newest first — the order they
// appear in on History, so what you copy matches what you ticked.
export function workoutsToText(workouts, exMap) {
  if (!workouts.length) return '';
  const sorted = [...workouts].sort((a, b) => b.date - a.date);
  const header = sorted.length > 1
    ? `Kun · ${sorted.length} workouts · ${longDate(sorted[sorted.length - 1].date)} – ${longDate(sorted[0].date)}\n\n`
    : '';
  // Two blank lines between sessions. One is not enough: each block already
  // uses single blank lines inside it, and the eye needs the bigger gap to find
  // where a session starts.
  return header + sorted.map((w) => workoutToText(w, exMap)).join('\n\n\n') + '\n';
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  'Date', 'Time', 'Workout', 'Exercise', 'Set', 'Type',
  'Weight (kg)', 'Reps', 'Volume (kg)', 'Est. 1RM (kg)', 'Completed'
];

// One row per set, oldest first — a spreadsheet is read downwards through time,
// which is the opposite of how History is read. Numbers are written unitless so
// a cell stays a number; the unit is in the column heading.
export function workoutsToCsv(workouts, exMap) {
  const rows = [CSV_COLUMNS];
  const sorted = [...workouts].sort((a, b) => a.date - b.date);
  for (const w of sorted) {
    const title = workoutTitle(w, exMap);
    const ids = w.exercises?.length ? w.exercises : [...new Set((w.sets || []).map((s) => s.exerciseId))];
    for (const id of ids) {
      const ex = exMap.get(id);
      for (const { set, number, tag } of setLabels(orderedSets(w.sets || [], id))) {
        const ts = set.completedAt || set.timestamp || w.date;
        rows.push([
          ymd(ts),
          clockTime(ts),
          title,
          ex ? ex.name : 'Deleted exercise',
          number ?? tag,
          set.type,
          formatWeight(set.weightKg, { withUnit: false }),
          set.reps,
          isWorking(set) ? formatWeight(setVolume(set), { withUnit: false }) : '',
          isWorking(set) ? formatWeight(estimate1RM(set.weightKg, set.reps), { withUnit: false }) : '',
          set.completed ? 'yes' : 'no'
        ]);
      }
    }
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

export function buildExport(workouts, exMap, format) {
  return format === 'csv' ? workoutsToCsv(workouts, exMap) : workoutsToText(workouts, exMap);
}

export function exportFilename(workouts, format) {
  const ext = format === 'csv' ? 'csv' : 'txt';
  // Named for WHAT IS IN IT, not for when it was made: one workout gets its
  // date, several get the span. A folder of "lift-workouts-2026-11-07" files all
  // written on the same afternoon is a folder you have to open to tell apart.
  const dates = workouts.map((w) => ymd(w.date)).sort();
  const span = !dates.length ? 'empty'
    : dates[0] === dates[dates.length - 1] ? dates[0]
    : `${dates[0]}_${dates[dates.length - 1]}`;
  return `lift-workouts-${span}.${ext}`;
}

// ---- The two browser-facing helpers ----

// Clipboard, with the fallback that matters on iOS.
//
// navigator.clipboard is unavailable on a non-secure origin and rejects in a
// standalone PWA when the write is not close enough to the tap. The hidden
// textarea + execCommand path still works there, and when BOTH fail the caller
// is told so it can leave the text on screen for a manual copy rather than
// claiming a copy that never happened.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function downloadTextFile(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
