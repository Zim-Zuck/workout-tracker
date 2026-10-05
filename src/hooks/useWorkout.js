import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, getAllWorkouts, getAllExercises, saveExercise
} from '../db/database.js';
import { nextOrder, orderedSets } from '../db/normalize.js';
import { finishActiveWorkout, queueWorkoutUpload } from '../services/workoutCompletion.js';
import { uid } from '../utils/id.js';

// Central state for exercises, workout history and the (single) active workout.
// The active workout is persisted to IndexedDB on every mutation, so an
// unexpected close never loses progress.
export function useWorkout() {
  const [exercises, setExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [active, setActive] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // A cancelled session, held in memory only, so Undo can put it back. It is
  // already out of IndexedDB by the time it lands here: the toast is the last
  // moment it exists, which is the honest way to offer an undo we can keep.
  const cancelled = useRef(null);

  const refresh = useCallback(async () => {
    const [ex, wos, a] = await Promise.all([getAllExercises(), getAllWorkouts(), getActiveWorkout()]);
    setExercises(ex);
    setWorkouts(wos.filter((w) => !w.isActive)); // History = non-active workouts.
    setActive(a);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoaded(true); })();
  }, [refresh]);

  const persistActive = useCallback(async (next) => {
    setActive(next);
    if (next) await saveWorkout(next);
    return next;
  }, []);

  // ---- Workout lifecycle ----

  // `plan` comes from sessionBuilder: [{ exercise, sets, target }]. Passing it
  // here rather than adding exercises one by one means the session that starts
  // is exactly the session that was previewed on the hero — same exercises, same
  // set counts, same prefilled weights.
  const startWorkout = useCallback(async ({ split = null, name = null, plan = [] } = {}) => {
    // Re-check IDB (not just local state) so a stale hook instance or a second
    // tab can never create two concurrently active workouts.
    const existing = await getActiveWorkout();
    if (existing) { setActive(existing); return existing; }

    const now = Date.now();
    const sets = [];
    for (const item of plan) {
      for (let i = 0; i < (item.sets || 0); i++) {
        sets.push({
          id: uid('set'),
          exerciseId: item.exercise.id,
          type: 'working',
          weightKg: item.target?.targetWeightKg || 0,
          reps: item.target?.targetRepsLow || 0,
          order: i,
          timestamp: now,
          completedAt: null,
          completed: false
        });
      }
    }

    const wo = {
      id: uid('wo'),
      date: now,
      startTime: now,
      endTime: null,
      split,
      // Named by its split, never "Afternoon Workout".
      name: name || null,
      exercises: plan.map((p) => p.exercise.id),
      sets,
      skipped: [],
      notes: '',
      isActive: 1,
      status: 'active',
      // The id the server will deduplicate on, generated here — before the
      // first set is logged and long before any request is made.
      clientId: null,
      // An active session is not something the server has, and finishing is
      // what makes it eligible to be sent.
      synced: false
    };
    wo.clientId = wo.id;
    await persistActive(wo);
    return wo;
  }, [persistActive]);

  // FINISH. LOCAL-FIRST, AND NOTHING IN HERE TOUCHES THE NETWORK.
  //
  // The work itself is in services/workoutCompletion.js, which reads the
  // authoritative record out of IndexedDB rather than finishing the React
  // snapshot held here (that snapshot can be one set behind, and writing it
  // back used to silently drop the last set logged) and proves the write landed
  // before returning.
  //
  // Errors are NOT swallowed: they propagate to the caller, which keeps the
  // user on the workout screen and shows what happened. A workout we cannot
  // confirm is saved must never be reported as saved.
  const finishWorkout = useCallback(async () => {
    const done = await finishActiveWorkout({ fallback: active });
    if (!done) return null;
    setActive(null);
    await refresh();
    // Strictly after the local write is confirmed, and deliberately not
    // awaited. The upload is a background concern from here on.
    queueWorkoutUpload(done);
    return done;
  }, [active, refresh]);

  // Cancelling is undoable, not a confirmation dialog. The session leaves the
  // database immediately (so a reload cannot resurrect a half-cancelled state)
  // and is held in memory for as long as the toast is on screen.
  const cancelWorkout = useCallback(async () => {
    if (!active) return null;
    cancelled.current = active;
    await deleteWorkout(active.id);
    setActive(null);
    await refresh();
    return active;
  }, [active, refresh]);

  const restoreCancelled = useCallback(async () => {
    const w = cancelled.current;
    if (!w) return null;
    cancelled.current = null;
    await saveWorkout(w);
    await refresh();
    return w;
  }, [refresh]);

  // ---- Exercises inside the active workout ----

  const addExerciseToActive = useCallback(async (exerciseId, seedSets = 0, target = null) => {
    if (!active) return;
    if (active.exercises.includes(exerciseId)) return;
    const now = Date.now();
    const seeded = Array.from({ length: seedSets }, (_, i) => ({
      id: uid('set'), exerciseId, type: 'working',
      weightKg: target?.targetWeightKg || 0, reps: target?.targetRepsLow || 0,
      order: i, timestamp: now, completedAt: null, completed: false
    }));
    await persistActive({
      ...active,
      exercises: [...active.exercises, exerciseId],
      sets: [...active.sets, ...seeded]
    });
  }, [active, persistActive]);

  // REMOVE deletes the exercise and every set logged for it. Returns what it
  // removed so the caller's undo toast can put it back exactly.
  const removeExerciseFromActive = useCallback(async (exerciseId) => {
    if (!active) return null;
    const removedSets = active.sets.filter((s) => s.exerciseId === exerciseId);
    const index = active.exercises.indexOf(exerciseId);
    await persistActive({
      ...active,
      exercises: active.exercises.filter((e) => e !== exerciseId),
      sets: active.sets.filter((s) => s.exerciseId !== exerciseId),
      skipped: (active.skipped || []).filter((e) => e !== exerciseId)
    });
    return { exerciseId, index, sets: removedSets };
  }, [active, persistActive]);

  const restoreRemovedExercise = useCallback(async (snapshot) => {
    if (!active || !snapshot) return;
    const list = active.exercises.slice();
    list.splice(Math.min(snapshot.index, list.length), 0, snapshot.exerciseId);
    await persistActive({ ...active, exercises: list, sets: [...active.sets, ...snapshot.sets] });
  }, [active, persistActive]);

  // SKIP is not remove. The exercise stays in the session, its sets stay
  // logged, and it is recorded in `skipped` so the session builder learns to
  // stop suggesting a lift that keeps getting walked past. Nothing about a skip
  // counts against the person: not the streak, not volume, not completion.
  const skipExercise = useCallback(async (exerciseId) => {
    if (!active) return;
    if ((active.skipped || []).includes(exerciseId)) return;
    await persistActive({ ...active, skipped: [...(active.skipped || []), exerciseId] });
  }, [active, persistActive]);

  const unskipExercise = useCallback(async (exerciseId) => {
    if (!active) return;
    await persistActive({ ...active, skipped: (active.skipped || []).filter((e) => e !== exerciseId) });
  }, [active, persistActive]);

  const reorderExercises = useCallback(async (fromIdx, toIdx) => {
    if (!active) return;
    if (toIdx < 0 || toIdx >= active.exercises.length) return;
    const next = active.exercises.slice();
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    await persistActive({ ...active, exercises: next });
  }, [active, persistActive]);

  // REPLACING NEVER REASSIGNS LOGGED SETS.
  //
  // The old implementation moved every set from the old exercise to the new one
  // "so effort isn't lost", which quietly rewrote history: three sets of lat
  // pulldown at 60 kg became three sets of cable row at 60 kg, and the PR, the
  // progression target and the published summary all followed the lie.
  //
  // If nothing has been logged yet, the swap is clean. If sets exist, they stay
  // attributed to the lift that was actually performed and the replacement is
  // inserted after it — you did both, so the session says you did both.
  const replaceExercise = useCallback(async (oldId, newId, target = null) => {
    if (!active) return { kept: false };
    if (active.exercises.includes(newId)) return { kept: false, alreadyPresent: true };

    const logged = active.sets.filter((s) => s.exerciseId === oldId);
    const idx = active.exercises.indexOf(oldId);
    const now = Date.now();
    // The replacement arrives with the same three empty sets a fresh exercise
    // gets, already loaded with its own progression target.
    const seeded = Array.from({ length: 3 }, (_, i) => ({
      id: uid('set'), exerciseId: newId, type: 'working',
      weightKg: target?.targetWeightKg || 0, reps: target?.targetRepsLow || 0,
      order: i, timestamp: now, completedAt: null, completed: false
    }));

    if (!logged.length) {
      const next = active.exercises.slice();
      next[idx] = newId;
      await persistActive({
        ...active,
        exercises: next,
        sets: [...active.sets, ...seeded],
        skipped: (active.skipped || []).filter((e) => e !== oldId)
      });
      return { kept: false };
    }

    const next = active.exercises.slice();
    next.splice(idx + 1, 0, newId);
    await persistActive({
      ...active,
      exercises: next,
      // The replaced lift is marked skipped: you stopped doing it mid-session,
      // which is exactly what skip means, and it keeps the card collapsed
      // instead of leaving two open cards competing for attention.
      skipped: [...new Set([...(active.skipped || []), oldId])],
      sets: [...active.sets, ...seeded]
    });
    return { kept: true, keptCount: logged.length };
  }, [active, persistActive]);

  // Create a custom exercise and hand it straight back, so the caller (the
  // picker's empty state) can add it to the session in the same tap.
  //
  // Duplicate prevention happens in the UI BEFORE this is called — see
  // CreateExerciseSheet, which offers the library match and a "keep creating"
  // option rather than refusing. This function does not second-guess a user who
  // chose to continue.
  const createCustomExercise = useCallback(async (fields) => {
    const ex = {
      id: uid('ex'),
      name: String(fields.name || '').trim(),
      muscleGroups: fields.muscleGroups || [],
      equipment: fields.equipment || 'Other',
      defaultReps: fields.defaultReps || [8, 12],
      defaultRestSec: fields.defaultRestSec ?? 120,
      aliases: fields.aliases || [],
      builtin: false
    };
    if (!ex.name) return null;
    await saveExercise(ex);
    await refresh();
    return ex;
  }, [refresh]);

  // ---- Exercise preferences ----
  const updateExercise = useCallback(async (exerciseId, patch) => {
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    const next = { ...ex, ...patch };
    await saveExercise(next);
    setExercises((list) => list.map((e) => (e.id === exerciseId ? next : e)));
  }, [exercises]);

  // ---- Sets ----

  const addSet = useCallback(async (exerciseId, patch) => {
    if (!active) return;
    const now = Date.now();
    const set = {
      id: uid('set'),
      exerciseId,
      type: 'working',
      weightKg: 0,
      reps: 0,
      // Monotonic per exercise: deleting set 2 of 3 and adding a new one gives
      // it order 3, so no two sets in a session can ever share a position.
      order: nextOrder(active.sets, exerciseId),
      timestamp: now,
      completedAt: null,
      completed: false,
      ...patch
    };
    await persistActive({ ...active, sets: [...active.sets, set] });
    return set;
  }, [active, persistActive]);

  const updateSet = useCallback(async (setId, patch) => {
    if (!active) return;
    await persistActive({
      ...active,
      sets: active.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s))
    });
  }, [active, persistActive]);

  // Ticking a set records WHEN, and touches nothing that decides WHERE the row
  // sits. That separation is the whole fix for the duplicate set number.
  const toggleSetComplete = useCallback(async (setId) => {
    if (!active) return null;
    const set = active.sets.find((s) => s.id === setId);
    if (!set) return null;
    const completed = !set.completed;
    await persistActive({
      ...active,
      sets: active.sets.map((s) => (
        s.id === setId ? { ...s, completed, completedAt: completed ? Date.now() : null } : s
      ))
    });
    return { ...set, completed };
  }, [active, persistActive]);

  const deleteSet = useCallback(async (setId) => {
    if (!active) return null;
    const removed = active.sets.find((s) => s.id === setId);
    await persistActive({ ...active, sets: active.sets.filter((s) => s.id !== setId) });
    return removed;
  }, [active, persistActive]);

  const restoreSet = useCallback(async (set) => {
    if (!active || !set) return;
    await persistActive({ ...active, sets: [...active.sets, set] });
  }, [active, persistActive]);

  const setNotes = useCallback(async (notes) => {
    if (!active) return;
    await persistActive({ ...active, notes });
  }, [active, persistActive]);

  const renameWorkout = useCallback(async (name) => {
    if (!active) return;
    await persistActive({ ...active, name });
  }, [active, persistActive]);

  // ---- Historical workouts (History screen) ----
  const updateHistoricalWorkout = useCallback(async (w) => {
    // Edited history is history the server's copy no longer matches, so the
    // record goes back into the unsynced state and the sync engine re-uploads
    // it onto the same row (same clientId, so still one workout).
    await saveWorkout({
      ...w, isActive: 0, status: 'finished', synced: false, clientId: w.clientId || w.id
    });
    await refresh();
  }, [refresh]);

  // Deleting history is undoable too: the record is handed back so the caller
  // can hold it for the life of a toast and put it back on request.
  const deleteHistoricalWorkout = useCallback(async (id) => {
    const all = await getAllWorkouts();
    const snapshot = all.find((w) => w.id === id) || null;
    await deleteWorkout(id);
    await refresh();
    return snapshot;
  }, [refresh]);

  const restoreHistoricalWorkout = useCallback(async (w) => {
    if (!w) return;
    await saveWorkout(w);
    await refresh();
  }, [refresh]);

  // Sets of one exercise in the active workout, in their permanent order.
  const setsFor = useCallback(
    (exerciseId) => (active ? orderedSets(active.sets, exerciseId) : []),
    [active]
  );

  return {
    loaded,
    exercises,
    setExercises,
    workouts,
    active,
    setsFor,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    restoreCancelled,
    addExerciseToActive,
    removeExerciseFromActive,
    restoreRemovedExercise,
    skipExercise,
    unskipExercise,
    reorderExercises,
    replaceExercise,
    updateExercise,
    createCustomExercise,
    addSet,
    updateSet,
    toggleSetComplete,
    deleteSet,
    restoreSet,
    setNotes,
    renameWorkout,
    updateHistoricalWorkout,
    deleteHistoricalWorkout,
    restoreHistoricalWorkout,
    refresh
  };
}
