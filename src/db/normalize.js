// Bringing a workout record up to the current shape.
//
// ONE function, used by every entrance to the data: the IndexedDB upgrade in
// database.js, the backup importer in dataManager.js, and the dev seeder. A
// record written by any older build of the app, or restored from any older
// backup, goes through here and comes out with the fields the current UI needs.
//
// It is pure, idempotent, and NEVER drops a field it does not recognise. Running
// it twice changes nothing; running it on an already-current record changes
// nothing. That is what makes it safe to apply on every read path.

// WHY `order` EXISTS
// Sets used to be displayed in `timestamp` order, numbered by their position in
// that list. But `timestamp` was rewritten every time a set was ticked, so
// completing a set moved it and renumbered its neighbours — and when two sets
// landed on the same millisecond, two rows rendered the same number, one checked
// and one not. `order` is assigned once, per exercise, and never changes.
//
// WHY `completedAt` EXISTS
// Because `timestamp` was carrying two meanings at once: when the set was
// created, and when it was ticked. Splitting them means ordering can be stable
// while "when did this actually happen" stays truthful.
export function normalizeSet(set, order) {
  const next = { ...set };
  if (typeof next.order !== 'number') next.order = order;
  if (next.completedAt === undefined) {
    // For historical sets, `timestamp` IS the completion time — that is what the
    // old code wrote into it when the set was ticked. Uncompleted sets get null.
    next.completedAt = next.completed ? (next.timestamp ?? null) : null;
  }
  if (!next.type) next.type = 'working';
  return next;
}

export function normalizeWorkout(workout) {
  if (!workout || typeof workout !== 'object') return workout;

  const sets = Array.isArray(workout.sets) ? workout.sets : [];

  // Order is assigned PER EXERCISE, from the historical timestamp ordering,
  // which is the best reconstruction of the sequence the person actually lifted
  // in. Sets already carrying an order keep it.
  const counters = new Map();
  const byExercise = new Map();
  for (const s of sets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }
  for (const arr of byExercise.values()) {
    arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  const orderById = new Map();
  for (const [exId, arr] of byExercise) {
    let n = 0;
    for (const s of arr) {
      orderById.set(s.id, typeof s.order === 'number' ? s.order : n);
      n = Math.max(n, orderById.get(s.id)) + 1;
    }
    counters.set(exId, n);
  }

  const next = {
    ...workout,
    sets: sets.map((s) => normalizeSet(s, orderById.get(s.id) ?? 0))
  };

  // Exercises deliberately skipped during the session. An old workout has none:
  // an empty array, not undefined, so every consumer can call .includes()
  // without a guard.
  if (!Array.isArray(next.skipped)) next.skipped = [];

  // The split this session belongs to ('push' | 'pull' | 'legs' | 'upper' |
  // 'lower' | null). Left null for historical workouts rather than guessed here:
  // History derives a display title from the muscle groups actually trained,
  // which is honest about a session that predates splits existing.
  if (next.split === undefined) next.split = null;

  if (!Array.isArray(next.exercises)) next.exercises = [];

  return next;
}

// The next `order` value for an exercise inside a workout. Monotonic: deleting
// set 2 of 3 and adding a new one gives it order 3, not 2, so no two sets in a
// session can ever share an order.
export function nextOrder(sets, exerciseId) {
  let max = -1;
  for (const s of sets) {
    if (s.exerciseId === exerciseId && typeof s.order === 'number') max = Math.max(max, s.order);
  }
  return max + 1;
}

// Sets of one exercise, in the order they were logged. This is THE ordering
// function — nothing else may sort sets for display.
export function orderedSets(sets, exerciseId) {
  return sets
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Display numbers for a list of ordered sets.
//
// Working sets are numbered 1..n independently of warm-ups, drops and failures,
// which are lettered instead. A warm-up is not set 1 of your working sets, and
// numbering it as though it were is how "3 sets of 8" turns into four rows.
export function setLabels(orderedList) {
  let n = 0;
  return orderedList.map((s) => {
    if (s.type === 'working') { n += 1; return { set: s, number: n, tag: null }; }
    return { set: s, number: null, tag: s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : 'F' };
  });
}
