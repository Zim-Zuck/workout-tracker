// FINISHING A WORKOUT. THE ONE PATH IN THIS APP THAT MAY NEVER TOUCH THE NETWORK.
//
// Why this is its own module, outside the React hook that used to own it:
//
// The old implementation lived in useWorkout.finishWorkout() and finished the
// session from the `active` object held in React state. Three things were wrong
// with that, and all three are the reason "Finish" was unreliable:
//
//   1. IT FINISHED A COPY, NOT THE RECORD. `active` is a snapshot taken at the
//      last render. Ticking the final set calls setActive() and THEN awaits the
//      IndexedDB write, so a Finish tap inside that window built the completed
//      workout from the pre-tick snapshot and wrote it back over the newer
//      record — losing the last set the person logged.
//
//   2. IT NEVER CONFIRMED THE WRITE. saveWorkout() resolves on the put()
//      request, and nothing read the record back. A transaction that aborted
//      afterwards (storage pressure, an eviction, a versionchange from another
//      tab) left the session still active with the UI insisting it was saved.
//
//   3. NOTHING CAUGHT A FAILURE. The caller wrapped the await in try/finally
//      with no catch, so a thrown error became an unhandled rejection: the
//      spinner stopped, the screen did not move, no message appeared. That is
//      precisely the reported symptom — tapping Finish does nothing.
//
// The critical path here is: read the authoritative record, write it finished,
// read it back to prove the write landed, then return. Nothing in it is
// conditional on connectivity, and the upload is queued strictly afterwards,
// outside the part the caller awaits.
import { getActiveWorkout, getWorkout, saveWorkout } from '../db/database.js';
import { enqueueWorkoutUpload } from './workoutSync.js';

// Thrown when the local write could not be proven. The caller must keep the
// user on the workout screen and show this message: a workout we cannot confirm
// is saved must never be reported as saved.
export class WorkoutSaveError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'WorkoutSaveError';
    this.cause = cause;
  }
}

const SAVE_FAILED =
  'Could not save this workout to this device. Nothing has been lost — '
  + 'your session is still open. Free up some storage and try Finish again.';

// Finalize the active session locally.
//
// `fallback` is the hook's in-memory copy, used only when IndexedDB has no
// active record at all (which would otherwise mean a session visible on screen
// could not be finished). The on-disk record wins whenever it exists.
//
// Returns the finished workout, or null when there was no session to finish.
// Throws WorkoutSaveError when the local write cannot be confirmed.
export async function finishActiveWorkout({ fallback = null, now = Date.now() } = {}) {
  let current = null;
  try {
    current = await getActiveWorkout();
  } catch (err) {
    // Even reading can fail on a wedged database. Fall back to what the screen
    // is holding rather than refusing to finish a session the user can see.
    if (!fallback) throw new WorkoutSaveError(SAVE_FAILED, err);
  }
  current = current || fallback;
  if (!current) return null;

  const done = {
    ...current,
    isActive: 0,
    status: 'finished',
    endTime: current.endTime || now,
    // Queued for the server, not sent. The upload is a separate, retryable
    // concern; this flag is the only record of whether it has happened.
    synced: false,
    // Generated on this device, before any server is involved, and never
    // regenerated. It is what makes a retried upload idempotent.
    clientId: current.clientId || current.id
  };

  try {
    await saveWorkout(done);
  } catch (err) {
    throw new WorkoutSaveError(SAVE_FAILED, err);
  }

  // PROVING THE WRITE. An IndexedDB put() that resolves is not the same as a
  // transaction that committed, and the difference matters exactly once — on the
  // device where it fails. Reading the record back is cheap and turns a silent
  // loss into a message the user can act on.
  let confirmed = null;
  try {
    confirmed = await getWorkout(done.id);
  } catch (err) {
    throw new WorkoutSaveError(SAVE_FAILED, err);
  }
  if (!confirmed || confirmed.isActive || confirmed.status !== 'finished') {
    throw new WorkoutSaveError(SAVE_FAILED);
  }

  return confirmed;
}

// Queue the finished workout for upload. Deliberately NOT part of the function
// above and never awaited by the Finish handler: it writes to the outbox, which
// is local, but there is no reason for the summary screen to wait even on that.
//
// Safe to call when signed out or offline — the item simply sits in the queue.
export function queueWorkoutUpload(workout) {
  if (!workout) return Promise.resolve(null);
  return enqueueWorkoutUpload(workout).catch((err) => {
    // A failure to QUEUE is not a failure to save. The workout is already on
    // disk with synced=false, so the next sync sweep picks it up from the
    // database regardless of whether this queue write succeeded.
    console.warn('Could not queue workout upload (it will be retried):', err);
    return null;
  });
}
