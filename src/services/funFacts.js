// FUN FACTS — small, true things about your whole training history that you
// could not tell by looking at a chart: a single heaviest set buried in
// thousands of rows, which weekday quietly never gets trained, how many
// personal records actually happened.
//
// EVERY FACT IS ALL-TIME, not scoped to whichever two periods are on screen —
// that is what makes them facts rather than another reading of the same
// comparison. No new calculation is invented for anything that already has a
// canonical function (workingVolume, muscleVolume, repRangeCounts, rankExercises,
// prTimeline); a fact is a sentence built from a number one of those already
// computed, never a second opinion about it.
//
// Every builder returns a sentence or null — null when the history is too
// thin for that particular fact to mean anything (a "longest streak" of one
// week is not a fact, it is the only week there is). buildFunFacts() filters
// the nulls, so a brand-new account simply gets a shorter rotation rather
// than a fact stitched together from almost nothing.
import { isWorking, estimate1RM, workingVolume, muscleVolume, repRangeCounts, sessionMinutes } from './calculations.js';
import { rankExercises } from './exerciseStats.js';
import { prTimeline } from './prs.js';
import { formatVolume, formatWeight } from '../utils/units.js';
import { formatDuration, formatDate, startOfWeek } from '../utils/date.js';

const DAY = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toMap(exercises) {
  if (!exercises) return new Map();
  return typeof exercises.get === 'function' ? exercises : new Map(exercises.map((e) => [e.id, e]));
}

// A relatable object for "you've lifted the weight of N of these". Ordered
// lightest first so the loop below hands back the smallest object whose
// multiple is still a sentence worth saying, rather than always reaching for
// the most dramatic one regardless of how it reads ("0.02 blue whales" is not
// a fact, it is a unit conversion nobody asked for).
const REFERENCE_OBJECTS = [
  { name: 'a grand piano', kg: 300 },
  { name: 'a small car', kg: 1200 },
  { name: 'an African elephant', kg: 6000 },
  { name: 'a double-decker bus', kg: 12000 },
  { name: 'a blue whale', kg: 100000 }
];

function factWeightEquivalent(workouts) {
  let total = 0;
  for (const w of workouts) total += workingVolume(w.sets || []);
  if (total <= 0) return null;
  for (const obj of REFERENCE_OBJECTS) {
    const multiple = total / obj.kg;
    if (multiple >= 1.5 && multiple <= 300) {
      const m = multiple >= 10 ? Math.round(multiple) : Math.round(multiple * 10) / 10;
      return `You've lifted a total of ${formatVolume(total)} — about ${m}x the weight of ${obj.name}.`;
    }
  }
  return null;
}

function factTotalReps(workouts) {
  let reps = 0;
  for (const w of workouts) {
    for (const s of w.sets || []) {
      if (isWorking(s)) reps += Number.isFinite(s.reps) ? s.reps : 0;
    }
  }
  if (reps < 50) return null;
  return `You've performed ${reps.toLocaleString()} total reps across your training history.`;
}

function factHeaviestSet(workouts, exercises) {
  const exMap = toMap(exercises);
  let best = null;
  for (const w of workouts) {
    for (const s of w.sets || []) {
      if (!isWorking(s) || !(s.weightKg > 0)) continue;
      if (!best || s.weightKg > best.weightKg) {
        const ex = exMap.get(s.exerciseId);
        if (ex) best = { weightKg: s.weightKg, reps: s.reps, name: ex.name };
      }
    }
  }
  if (!best) return null;
  return `The heaviest single set you've ever logged: ${formatWeight(best.weightKg)} × ${best.reps} on ${best.name}.`;
}

function factBestEstimated1RM(workouts, exercises) {
  const exMap = toMap(exercises);
  let best = null;
  for (const w of workouts) {
    for (const s of w.sets || []) {
      if (!isWorking(s)) continue;
      const e1rm = estimate1RM(s.weightKg, s.reps);
      if (e1rm > 0 && (!best || e1rm > best.e1rm)) {
        const ex = exMap.get(s.exerciseId);
        if (ex) best = { e1rm, name: ex.name };
      }
    }
  }
  if (!best) return null;
  return `Your best lift on paper is an estimated ${formatWeight(best.e1rm)} for a single rep, on ${best.name}.`;
}

function factFavoriteExercise(workouts, exercises) {
  const { rows } = rankExercises(workouts, exercises, { mode: 'frequency', start: -Infinity, end: Infinity });
  if (!rows.length || rows[0].sessions < 3) return null;
  const top = rows[0];
  return `Your most-trained exercise of all time is ${top.exercise.name}, with ${top.sessions} sessions.`;
}

function factMostTrainedMuscle(workouts, exercises) {
  const rows = muscleVolume(workouts, exercises, {});
  if (!rows.length || rows[0].volumeKg <= 0) return null;
  const top = rows[0];
  return `Across your whole history, ${top.label} has taken on the most total work: ${formatVolume(top.volumeKg)}.`;
}

const REP_FLAVOR = {
  '1–5': 'a strength-focused',
  '6–9': 'a classic hypertrophy',
  '10–14': 'a higher-volume',
  '15+': 'an endurance-leaning'
};

function factRepRangePersonality(workouts) {
  const rows = repRangeCounts(workouts, {});
  const total = rows.reduce((a, r) => a + r.count, 0);
  if (total < 20) return null;
  const top = [...rows].sort((a, b) => b.count - a.count)[0];
  if (!top || top.pct < 30) return null;
  const flavor = REP_FLAVOR[top.label] || 'a';
  return `${top.pct}% of every set you've ever logged falls in the ${top.label} rep range — you're ${flavor} lifter at heart.`;
}

function weekdayCounts(workouts) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const w of workouts) counts[new Date(w.date).getDay()]++;
  return counts;
}

function factBusiestWeekday(workouts) {
  if (workouts.length < 8) return null;
  const counts = weekdayCounts(workouts);
  const max = Math.max(...counts);
  if (max === 0 || counts.filter((c) => c === max).length > 1) return null;
  return `Most of your sessions land on ${WEEKDAYS[counts.indexOf(max)]}s — ${max} of your ${workouts.length} workouts.`;
}

function factNeverTrainedWeekday(workouts) {
  if (workouts.length < 8) return null;
  const counts = weekdayCounts(workouts);
  const zeroDays = counts.map((c, i) => (c === 0 ? WEEKDAYS[i] : null)).filter(Boolean);
  if (zeroDays.length !== 1) return null;
  return `You've never once logged a workout on a ${zeroDays[0]}.`;
}

function factLongestSession(workouts) {
  let best = null;
  for (const w of workouts) {
    const min = sessionMinutes(w);
    if (min != null && (!best || min > best.min)) best = { min, date: w.date };
  }
  if (!best) return null;
  return `Your longest session ever ran ${formatDuration(best.min * 60000)}, on ${formatDate(best.date)}.`;
}

function factBiggestSessionVolume(workouts) {
  let best = null;
  for (const w of workouts) {
    const vol = workingVolume(w.sets || []);
    if (vol > 0 && (!best || vol > best.vol)) best = { vol, date: w.date };
  }
  if (!best) return null;
  return `Your biggest single session moved ${formatVolume(best.vol)}, on ${formatDate(best.date)}.`;
}

// The longest run of CONSECUTIVE trained weeks anywhere in your history — not
// the current streak (computeStreak in calculations.js already owns that,
// counted back from today). A different question: the best run you ever put
// together, whenever it happened.
function factLongestStreak(workouts) {
  if (!workouts.length) return null;
  const weeks = [...new Set(workouts.map((w) => startOfWeek(w.date)))].sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let i = 1; i < weeks.length; i++) {
    current = weeks[i] - weeks[i - 1] === 7 * DAY ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  if (longest < 3) return null;
  return `Your longest training streak ever is ${longest} weeks in a row.`;
}

function factTrainingSpan(workouts, asOf) {
  if (!workouts.length) return null;
  const first = Math.min(...workouts.map((w) => w.date));
  const days = Math.floor((asOf - first) / DAY);
  if (days < 30) return null;
  const years = days / 365;
  if (years >= 1) return `You've been training for ${years.toFixed(1)} years, since ${formatDate(first)}.`;
  return `You've been training for ${Math.round(days / 7)} weeks, since ${formatDate(first)}.`;
}

function factTotalTimeTrained(workouts) {
  let totalMin = 0;
  for (const w of workouts) {
    const min = sessionMinutes(w);
    if (min != null) totalMin += min;
  }
  if (totalMin < 60) return null;
  const hours = totalMin / 60;
  const hoursText = hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString();
  const movies = Math.round(hours / 2);
  if (movies >= 2) {
    return `You've spent about ${hoursText} hours actually training — roughly ${movies} feature-length movies.`;
  }
  return `You've spent about ${hoursText} hours actually training, timer running.`;
}

function factPRCount(workouts) {
  const count = prTimeline(workouts).length;
  if (count < 3) return null;
  return `You've set ${count} personal records across your training history.`;
}

const FACT_BUILDERS = [
  (workouts) => factWeightEquivalent(workouts),
  (workouts) => factTotalReps(workouts),
  (workouts, exercises) => factHeaviestSet(workouts, exercises),
  (workouts, exercises) => factBestEstimated1RM(workouts, exercises),
  (workouts, exercises) => factFavoriteExercise(workouts, exercises),
  (workouts, exercises) => factMostTrainedMuscle(workouts, exercises),
  (workouts) => factRepRangePersonality(workouts),
  (workouts) => factBusiestWeekday(workouts),
  (workouts) => factNeverTrainedWeekday(workouts),
  (workouts) => factLongestSession(workouts),
  (workouts) => factBiggestSessionVolume(workouts),
  (workouts) => factLongestStreak(workouts),
  (workouts, _exercises, asOf) => factTrainingSpan(workouts, asOf),
  (workouts) => factTotalTimeTrained(workouts),
  (workouts) => factPRCount(workouts)
];

// Every computable fact, all-time, in a fixed order (the card does its own
// cycling — this just decides what is and is not a fact worth telling).
export function buildFunFacts(workouts, exercises, { asOf = Date.now() } = {}) {
  const all = workouts || [];
  return FACT_BUILDERS
    .map((build) => build(all, exercises, asOf))
    .filter(Boolean);
}
