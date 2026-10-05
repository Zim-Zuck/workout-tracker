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

  // THE TWO FIELDS THE FINISH BUTTON DEPENDS ON.
  //
  // `status` says what this record IS ('active' while a session is in progress,
  // 'finished' once it has been completed) and `synced` says whether the server
  // has it. They are defaulted here rather than in a schema migration on
  // purpose: normalizeWorkout() runs on every read path already, so a record
  // written by any older build arrives correctly shaped without rewriting five
  // thousand rows inside a versionchange transaction.
  //
  // A record from before these fields existed defaults to synced=true. That is
  // deliberate: those sessions predate per-workout upload, their contents are
  // already covered by the backup pipeline, and defaulting them to false would
  // make the first launch after an update queue a user's entire history.
  if (next.status === undefined) next.status = next.isActive ? 'active' : 'finished';
  if (next.synced === undefined) next.synced = true;
  // The id the server deduplicates on. Always the local record's own id, so an
  // upload that is retried after a timeout cannot create a second server row.
  if (next.clientId === undefined) next.clientId = next.id ?? null;

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

// REPAIRING A RECORD RATHER THAN REFUSING IT.
//
// normalizeWorkout() above brings a well-formed old record up to date. This is
// the layer below that: what to do with a record that is not well-formed at all
// — no sets array, a null date, a missing id, two records sharing an id. These
// exist. A workout saved while the tab was killed mid-write, a hand-edited
// export, a row from a build with a bug in it.
//
// The rule is SALVAGE, NEVER DISCARD. A workout with a broken date is still a
// workout somebody did, and a restore that throws on record 4,001 of 5,000 has
// lost 999 workouts to protect nothing. Anything unrepairable is reported to the
// caller so it can be counted and shown, not silently dropped.

// A date we can sort by. Falls back through the fields that carry the same
// meaning, and finally to the epoch — which sorts to the bottom of History,
// visibly wrong, rather than crashing a chart.
function salvageDate(w) {
  for (const v of [w.date, w.startTime, w.endTime, w.completedAt]) {
    const n = typeof v === 'string' ? Date.parse(v) : v;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

// Repair one workout. `makeId` supplies an id when the record has none.
export function repairWorkout(w, makeId) {
  if (!w || typeof w !== 'object') return null;
  const out = { ...w };
  if (typeof out.id !== 'string' || !out.id) out.id = makeId();
  out.date = salvageDate(out);
  if (!Array.isArray(out.sets)) out.sets = [];
  out.sets = out.sets
    .filter((s) => s && typeof s === 'object')
    .map((s, i) => {
      const set = { ...s };
      if (typeof set.id !== 'string' || !set.id) set.id = `${out.id}_s${i}`;
      // A set with no exercise cannot be grouped, charted or ordered. Parking it
      // under a sentinel id keeps the row and its weight rather than deleting it;
      // the UI renders an unknown exercise as "Unknown", which it already had to
      // handle for an exercise the user deleted from the library.
      if (typeof set.exerciseId !== 'string' || !set.exerciseId) set.exerciseId = 'ex_unknown';
      if (typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg)) set.weightKg = 0;
      if (typeof set.reps !== 'number' || !Number.isFinite(set.reps)) set.reps = 0;
      if (typeof set.timestamp !== 'number' || !Number.isFinite(set.timestamp)) set.timestamp = out.date + i;
      set.completed = !!set.completed;
      return set;
    });
  if (!Array.isArray(out.exercises)) {
    // Reconstruct the exercise list from the sets, in order of first appearance,
    // for a record that lost it.
    out.exercises = [...new Set(out.sets.map((s) => s.exerciseId))];
  }
  out.isActive = out.isActive ? 1 : 0;
  return normalizeWorkout(out);
}

export function repairExercise(ex, makeId) {
  if (!ex || typeof ex !== 'object') return null;
  const out = { ...ex };
  if (typeof out.id !== 'string' || !out.id) out.id = makeId();
  if (typeof out.name !== 'string' || !out.name) out.name = 'Unnamed exercise';
  if (!Array.isArray(out.muscleGroups)) out.muscleGroups = [];
  return out;
}

// Repair a whole list and collapse duplicate ids.
//
// A duplicate id is not a choice between two records, it is two records that
// cannot both be stored — bulkPut() would silently overwrite one. Keeping the
// one with more logged sets keeps the more complete session, and the loser is
// re-keyed rather than thrown away, so nothing a person did disappears because
// of a key collision.
export function dedupeById(list, { weigh = () => 0 } = {}) {
  const byId = new Map();
  const rekeyed = [];
  for (const item of list) {
    const existing = byId.get(item.id);
    if (!existing) { byId.set(item.id, item); continue; }
    const [keep, move] = weigh(item) > weigh(existing) ? [item, existing] : [existing, item];
    byId.set(keep.id, keep);
    const moved = { ...move, id: `${move.id}_dup${rekeyed.length + 1}`, duplicateOf: move.id };
    rekeyed.push(moved);
    byId.set(moved.id, moved);
  }
  return { items: [...byId.values()], duplicates: rekeyed.length };
}
