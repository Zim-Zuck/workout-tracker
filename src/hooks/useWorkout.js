import { useCallback, useEffect, useState } from 'react';
import {
  getActiveWorkout, saveWorkout, deleteWorkout, getAllWorkouts, getAllExercises
} from '../db/database.js';
import { uid } from '../utils/id.js';

// Central state for exercises, workout history and the (single) active workout.
// The active workout is persisted to IndexedDB on every mutation so an unexpected
// close never loses progress.
export function useWorkout() {
  const [exercises, setExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [active, setActive] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [undoStack, setUndoStack] = useState([]); // in-memory only

  const refresh = useCallback(async () => {
    const [ex, wos, a] = await Promise.all([getAllExercises(), getAllWorkouts(), getActiveWorkout()]);
    setExercises(ex);
    // History = non-active workouts.
    setWorkouts(wos.filter((w) => !w.isActive));
    setActive(a);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoaded(true);
    })();
  }, [refresh]);

  // Save an updated active workout to IDB and state atomically.
  const persistActive = useCallback(async (next) => {
    setActive(next);
    if (next) await saveWorkout(next);
  }, []);

  // ---- Workout lifecycle ----
  const startWorkout = useCallback(async (name = 'Workout') => {
    // Re-check IDB (not just local `active` state) so a stale hook instance or a
    // second tab can never create two concurrently active workouts.
    const existing = await getActiveWorkout();
    if (existing) {
      setActive(existing);
      return existing;
    }
    const now = Date.now();
    const wo = {
      id: uid('wo'),
      date: now,
      startTime: now,
      endTime: null,
      name,
      exercises: [],
      sets: [],
      notes: '',
      isActive: 1
    };
    await persistActive(wo);
    return wo;
  }, [persistActive]);

  const finishWorkout = useCallback(async () => {
    if (!active) return;
    const done = { ...active, isActive: 0, endTime: Date.now() };
    await saveWorkout(done);
    setActive(null);
    await refresh();
    return done;
  }, [active, refresh]);

  const cancelWorkout = useCallback(async () => {
    if (!active) return;
    await deleteWorkout(active.id);
    setActive(null);
    await refresh();
  }, [active, refresh]);

  // ---- Exercise editing inside the active workout ----
  const addExerciseToActive = useCallback(async (exerciseId) => {
    if (!active) return;
    if (active.exercises.includes(exerciseId)) return;
    await persistActive({ ...active, exercises: [...active.exercises, exerciseId] });
  }, [active, persistActive]);

  const removeExerciseFromActive = useCallback(async (exerciseId) => {
    if (!active) return;
    const removedSets = active.sets.filter((s) => s.exerciseId === exerciseId);
    setUndoStack((u) => [...u, { kind: 'removeExercise', exerciseId, sets: removedSets }].slice(-10));
    await persistActive({
      ...active,
      exercises: active.exercises.filter((e) => e !== exerciseId),
      sets: active.sets.filter((s) => s.exerciseId !== exerciseId)
    });
  }, [active, persistActive]);

  const reorderExercises = useCallback(async (fromIdx, toIdx) => {
    if (!active) return;
    const next = active.exercises.slice();
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    await persistActive({ ...active, exercises: next });
  }, [active, persistActive]);

  const replaceExercise = useCallback(async (oldId, newId) => {
    if (!active) return;
    if (active.exercises.includes(newId)) return;
    const nextEx = active.exercises.map((e) => (e === oldId ? newId : e));
    // Keep sets referencing the old exercise as history in this workout? No — they meant a different lift.
    // We move any sets already logged to the replacement, so effort isn't lost.
    const nextSets = active.sets.map((s) => (s.exerciseId === oldId ? { ...s, exerciseId: newId } : s));
    await persistActive({ ...active, exercises: nextEx, sets: nextSets });
  }, [active, persistActive]);

  // ---- Set editing ----
  const addSet = useCallback(async (exerciseId, patch) => {
    if (!active) return;
    const set = {
      id: uid('set'),
      exerciseId,
      type: 'working',
      weightKg: 0,
      reps: 0,
      timestamp: Date.now(),
      completed: false,
      ...patch
    };
    await persistActive({ ...active, sets: [...active.sets, set] });
    return set;
  }, [active, persistActive]);

  const updateSet = useCallback(async (setId, patch) => {
    if (!active) return;
    const nextSets = active.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
    await persistActive({ ...active, sets: nextSets });
  }, [active, persistActive]);

  const deleteSet = useCallback(async (setId) => {
    if (!active) return;
    const removed = active.sets.find((s) => s.id === setId);
    if (removed) setUndoStack((u) => [...u, { kind: 'removeSet', set: removed }].slice(-10));
    await persistActive({ ...active, sets: active.sets.filter((s) => s.id !== setId) });
  }, [active, persistActive]);

  const undo = useCallback(async () => {
    if (!active || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    if (last.kind === 'removeSet') {
      await persistActive({ ...active, sets: [...active.sets, last.set] });
    } else if (last.kind === 'removeExercise') {
      await persistActive({
        ...active,
        exercises: [...active.exercises, last.exerciseId],
        sets: [...active.sets, ...last.sets]
      });
    }
  }, [active, undoStack, persistActive]);

  const setNotes = useCallback(async (notes) => {
    if (!active) return;
    await persistActive({ ...active, notes });
  }, [active, persistActive]);

  const renameWorkout = useCallback(async (name) => {
    if (!active) return;
    await persistActive({ ...active, name });
  }, [active, persistActive]);

  // ---- Historical workout editing (used in History screen) ----
  const updateHistoricalWorkout = useCallback(async (w) => {
    await saveWorkout({ ...w, isActive: 0 });
    await refresh();
  }, [refresh]);

  const deleteHistoricalWorkout = useCallback(async (id) => {
    await deleteWorkout(id);
    await refresh();
  }, [refresh]);

  return {
    loaded,
    exercises,
    setExercises, // so ExerciseLibrary can refresh
    workouts,
    active,
    startWorkout,
    finishWorkout,
    cancelWorkout,
    addExerciseToActive,
    removeExerciseFromActive,
    reorderExercises,
    replaceExercise,
    addSet,
    updateSet,
    deleteSet,
    undo,
    canUndo: undoStack.length > 0,
    setNotes,
    renameWorkout,
    updateHistoricalWorkout,
    deleteHistoricalWorkout,
    refresh
  };
}
