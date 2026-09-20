// Cloud backup: one JSON snapshot per user, overwritten in place.
//
// Reuses the existing export/import pipeline rather than inventing a second
// serialization format — a cloud backup is byte-identical to the file you get
// from "Export JSON backup", so the two paths cannot drift apart and a file
// downloaded from either can be restored by either.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { exportAll, importReplaceAll, validateBackup } from './dataManager.js';
import { setMeta, getMeta } from '../db/database.js';

const BUCKET = 'backups';
const FILE = 'latest.json';
const LAST_BACKUP_KEY = 'lastCloudBackupAt';

// Automatic backups are rate-limited to once a day. Backing up after every
// session would burn mobile data at the gym for almost no benefit.
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;

function pathFor(userId) {
  return `${userId}/${FILE}`;
}

export async function backupNow(userId) {
  if (!userId) throw new Error('Sign in to back up.');
  if (!isOnline()) throw new Error('No connection — try again when you are online.');

  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(pathFor(userId), blob, { contentType: 'application/json', upsert: true });

  if (error) throw new Error(friendlyError(error));

  const at = Date.now();
  await setMeta(LAST_BACKUP_KEY, at);
  return { at, workouts: data.workouts.length, exercises: data.exercises.length };
}

// Called after a workout finishes. Silent by design: a backup is housekeeping,
// and a failed one must never interrupt someone who just finished training.
export async function maybeAutoBackup(userId) {
  if (!userId || !isOnline()) return false;
  const last = (await getMeta(LAST_BACKUP_KEY)) || 0;
  if (Date.now() - last < AUTO_INTERVAL_MS) return false;
  try {
    await backupNow(userId);
    return true;
  } catch {
    return false;
  }
}

// Metadata about the stored backup, without downloading it.
export async function getBackupInfo(userId) {
  const localLast = (await getMeta(LAST_BACKUP_KEY)) || null;
  if (!userId || !isOnline()) return { exists: null, localLast };

  const sb = await getSupabase();
  if (!sb) return { exists: null, localLast };

  const { data, error } = await sb.storage.from(BUCKET).list(userId, { search: FILE });
  if (error) return { exists: null, localLast };

  const file = (data || []).find((f) => f.name === FILE);
  return {
    exists: !!file,
    localLast,
    updatedAt: file?.updated_at ? new Date(file.updated_at).getTime() : null,
    sizeBytes: file?.metadata?.size ?? null
  };
}

// Downloads and validates the backup WITHOUT applying it, so the UI can show
// what a restore would contain before the user commits to replacing everything.
export async function fetchBackup(userId) {
  if (!userId) throw new Error('Sign in to restore.');
  if (!isOnline()) throw new Error('No connection — try again when you are online.');

  const sb = await getSupabase();
  if (!sb) throw new Error('Cloud features are not configured.');

  const { data, error } = await sb.storage.from(BUCKET).download(pathFor(userId));
  if (error) {
    if (/not found|does not exist/i.test(error.message || '')) {
      throw new Error('No cloud backup found for this account yet.');
    }
    throw new Error(friendlyError(error));
  }

  let parsed;
  try {
    parsed = JSON.parse(await data.text());
  } catch {
    throw new Error('The stored backup is corrupted and cannot be read.');
  }
  validateBackup(parsed);
  return parsed;
}

// Destructive: replaces everything local. Callers must confirm first.
export async function restoreBackup(parsed) {
  await importReplaceAll(parsed);
}

export async function deleteBackup(userId) {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.storage.from(BUCKET).remove([pathFor(userId)]);
  await setMeta(LAST_BACKUP_KEY, null);
}
