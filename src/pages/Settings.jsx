import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, Trash2, Info, Wifi, WifiOff, ListChecks, LogIn, LogOut, CloudUpload, CloudDownload, UserX, History } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { SCHEMA_VERSION } from '../db/database.js';
import {
  downloadBackup, importReplaceAll, wipeAllData, validateBackup,
  getAutomaticBackupStatus, restoreFromAutomaticBackup, downloadAutomaticBackup, getLastExportAt
} from '../services/dataManager.js';
import { storageEstimate } from '../db/database.js';
import { maybeSeed } from '../db/seedData.js';
import ExerciseLibrarySheet from '../components/ExerciseLibrarySheet.jsx';
import { backupNow, fetchBackup, restoreBackup, getBackupInfo } from '../services/backupApi.js';
import { deleteMyAccount } from '../services/profileApi.js';
import { relativeDay } from '../utils/date.js';
import { MERGE_UNDO_DAYS } from '../services/exerciseReconcile.js';

export default function SettingsScreen({ settings, updateSettings, workout, auth, onSignIn, reconciliation }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null); // parsed data
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [backupInfo, setBackupInfo] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  // The automatic pre-upgrade snapshot: null while unknown, null forever on a
  // device that never had data to protect.
  const [autoBackup, setAutoBackup] = useState(null);
  const [confirmAutoRestore, setConfirmAutoRestore] = useState(false);
  const [lastExport, setLastExport] = useState(undefined); // undefined = loading
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    getAutomaticBackupStatus().then(setAutoBackup).catch(() => setAutoBackup(null));
    getLastExportAt().then(setLastExport).catch(() => setLastExport(null));
    storageEstimate().then(setStorage).catch(() => {});
  }, []);

  // Backup metadata is a listing, not a download — cheap enough to fetch on
  // mount and it keeps the row from saying "never" when a backup exists.
  useEffect(() => {
    if (!auth?.signedIn) { setBackupInfo(null); return; }
    getBackupInfo(auth.userId).then(setBackupInfo).catch(() => {});
  }, [auth?.signedIn, auth?.userId]);

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      validateBackup(parsed);
      setPendingImport(parsed);
    } catch (err) {
      toast(`Import failed: ${err.message}`, { tone: 'error', duration: 4500 });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="px-base pb-nav pt-base">
      {auth?.cloudConfigured && (
        <Section title="Account">
          {auth.signedIn ? (
            <>
              <Row label="Signed in as">
                <span className="text-label font-regular text-ink-tertiary truncate max-w-[55%]">{auth.user?.email}</span>
              </Row>
              <ActionButton icon={LogOut} label="Sign out" onClick={async () => {
                await auth.signOut();
                toast('Signed out');
              }} />
            </>
          ) : (
            <>
              <p className="text-label font-regular text-ink-tertiary py-sm">
                An account adds friends, challenges and cloud backup. Your workouts stay on this device either way.
              </p>
              <ActionButton icon={LogIn} label="Sign in or create account" onClick={onSignIn} />
            </>
          )}
        </Section>
      )}

      <Section title="Preferences">
        <Row label="Default rest timer">
          <select
            value={settings.defaultRestSec}
            onChange={(e) => updateSettings({ defaultRestSec: Number(e.target.value) })}
            className="h-tap rounded-full bg-glass-inset border border-glass-inset-border px-md text-label font-semibold text-ink outline-none"
          >
            {[60, 90, 120, 150, 180, 240].map((s) => <option key={s} value={s}>{s < 60 ? `${s}s` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}</option>)}
          </select>
        </Row>
        <Row label="Default rep range">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={settings.defaultRepsLow}
              onChange={(e) => updateSettings({ defaultRepsLow: Number(e.target.value) })}
              className="w-16 h-tap rounded-full bg-glass-inset border border-glass-inset-border text-center text-label font-semibold text-ink outline-none" />
            <span className="text-ink-tertiary">–</span>
            <input type="number" inputMode="numeric" value={settings.defaultRepsHigh}
              onChange={(e) => updateSettings({ defaultRepsHigh: Number(e.target.value) })}
              className="w-16 h-tap rounded-full bg-glass-inset border border-glass-inset-border text-center text-label font-semibold text-ink outline-none" />
          </div>
        </Row>
        <Row label="Rest timer sound">
          <Segmented
            value={settings.soundEnabled ? 'on' : 'off'}
            onChange={(v) => updateSettings({ soundEnabled: v === 'on' })}
            options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
          />
        </Row>
        <Row label="Vibration">
          <Segmented
            value={settings.vibrationEnabled ? 'on' : 'off'}
            onChange={(v) => updateSettings({ vibrationEnabled: v === 'on' })}
            options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
          />
        </Row>
      </Section>

      <Section title="Exercises">
        <p className="text-label font-regular text-ink-tertiary py-sm">Add your own lifts, or edit the built-in ones. Also reachable while adding an exercise mid-workout.</p>
        <ActionButton icon={ListChecks} label="Exercise library" onClick={() => setLibraryOpen(true)} />
      </Section>

      {/* REVERSING A MERGE.
          The toast's Undo is there for the thirty seconds after a merge; this is
          there for the thirty days after it, which is when somebody actually
          notices their Bayesian curl chart looks different. The custom record
          and every set logged against it were never deleted, so reversing is
          just dropping the redirect. */}
      <MergedExercisesSection
        exercises={workout.allExercises}
        onUndo={async (customId, name) => {
          await reconciliation?.undoMerge(customId);
          toast(`“${name}” is a separate exercise again`);
        }}
      />

      <Section title="Data">
        <p className="text-label font-regular text-ink-tertiary py-sm">
          Your workouts are stored locally on this device. Export a backup regularly, or sign in to back them up to the cloud.
        </p>
        {/* A REMINDER, NOT A GATE.
            It states a fact and stops. No badge, no modal, no interstitial on
            launch, nothing that stands between somebody and logging a set —
            an app that nags about backups is an app people close. */}
        <Row label="Last export from this device">
          <span className={`text-label font-regular ${lastExport ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
            {lastExport === undefined ? '—' : lastExport ? relativeDay(lastExport) : 'Never'}
          </span>
        </Row>
        <div className="flex flex-col divide-y divide-hairline">
          <ActionButton icon={Download} label="Export JSON backup" onClick={async () => {
            await downloadBackup();
            setLastExport(await getLastExportAt());
            toast('Backup downloaded');
          }} />
          <ActionButton icon={Upload} label="Import JSON backup" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          <ActionButton icon={Trash2} label="Clear all data" danger onClick={() => setConfirmWipe(true)} />
          {import.meta.env.DEV && (
            <ActionButton icon={Info} label="Seed sample data (dev)" onClick={async () => {
              const r = await maybeSeed({ force: true });
              await workout.refresh();
              toast(r.seeded ? `Seeded ${r.count} workouts` : 'Skipped (data exists)');
            }} />
          )}
        </div>
      </Section>

      {/* THE AUTOMATIC SAFETY NET.
          Only rendered when a snapshot actually exists, so it appears for the
          users who were upgraded and quietly disappears once it has aged out —
          no dead row promising a restore of nothing. */}
      {autoBackup && (
        <Section title="Automatic backup">
          <p className="text-label font-regular text-ink-tertiary py-sm">
            Before this version changed anything, it copied your data as it was. Nothing since has
            touched that copy. It is kept for 30 days and then removed on its own.
          </p>
          <Row label="Taken">
            <span className="text-label font-regular text-ink-tertiary">{relativeDay(autoBackup.createdAt)}</span>
          </Row>
          <Row label="Contains">
            <span className="text-label font-regular text-ink-tertiary">
              {plural(autoBackup.counts.workouts, 'workout')} · {plural(autoBackup.counts.exercises, 'exercise')}
            </span>
          </Row>
          <div className="flex flex-col divide-y divide-hairline">
            <ActionButton icon={Download} label="Download it as a file" onClick={async () => {
              try { await downloadAutomaticBackup(); toast('Pre-upgrade backup downloaded'); }
              catch (err) { toast(err.message, { tone: 'error' }); }
            }} />
            <ActionButton icon={History} label="Restore from automatic backup" danger onClick={() => setConfirmAutoRestore(true)} />
          </div>
        </Section>
      )}

      {auth?.signedIn && (
        <Section title="Cloud backup">
          <p className="text-label font-regular text-ink-tertiary py-sm">
            A copy of your workouts stored against your account, so a new phone can pick up where this one left off.
            It backs up automatically once a day after a workout.
          </p>
          <Row label="Last backup">
            <span className="text-label font-regular text-ink-tertiary">
              {backupInfo === null ? '—'
                : backupInfo.updatedAt ? relativeDay(backupInfo.updatedAt)
                : backupInfo.localLast ? relativeDay(backupInfo.localLast)
                : 'Never'}
            </span>
          </Row>
          <div className="flex flex-col divide-y divide-hairline">
            <ActionButton
              icon={CloudUpload}
              label={backupBusy ? 'Working…' : 'Back up now'}
              onClick={async () => {
                setBackupBusy(true);
                try {
                  const r = await backupNow(auth.userId);
                  setBackupInfo(await getBackupInfo(auth.userId));
                  toast(`Backed up ${r.workouts} workouts`, { tone: 'success' });
                } catch (err) {
                  toast(err.message, { tone: 'error', duration: 4000 });
                } finally { setBackupBusy(false); }
              }}
            />
            <ActionButton
              icon={CloudDownload}
              label="Restore from cloud"
              onClick={async () => {
                setBackupBusy(true);
                try {
                  setPendingRestore(await fetchBackup(auth.userId));
                } catch (err) {
                  toast(err.message, { tone: 'error', duration: 4000 });
                } finally { setBackupBusy(false); }
              }}
            />
          </div>
        </Section>
      )}

      {auth?.signedIn && (
        <Section title="Danger zone">
          <p className="text-label font-regular text-ink-tertiary py-sm">
            Deleting your account removes your profile, friends, challenges and cloud backup permanently.
            Workouts on this device are not touched.
          </p>
          <ActionButton icon={UserX} label="Delete my account" danger onClick={() => setConfirmDeleteAccount(true)} />
        </Section>
      )}

      <Section title="About">
        <Row label="App"><span className="text-label text-ink font-semibold">Kun Workouts</span></Row>
        <Row label="App version"><span className="text-label font-regular text-ink-tertiary">1.0.0</span></Row>
        <Row label="Data schema"><span className="text-label font-regular text-ink-tertiary">v{SCHEMA_VERSION}</span></Row>
        {storage?.usage != null && (
          <Row label="Data on this device">
            <span className="text-label font-regular text-ink-tertiary">
              {(storage.usage / 1048576).toFixed(1)} MB used
            </span>
          </Row>
        )}
        <Row label="Connection">
          <span className={`inline-flex items-center gap-1 text-label ${online ? 'text-done' : 'text-ink-secondary'}`}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'Online' : 'Offline'}
          </span>
        </Row>
        <p className="text-label text-ink-tertiary mt-3">This app works fully offline after first load. Add it to your Home Screen from Safari's Share menu for an app-like experience.</p>
      </Section>

      <Modal open={!!pendingRestore} onClose={() => setPendingRestore(null)} title="Restore from cloud?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setPendingRestore(null)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  await restoreBackup(pendingRestore);
                  await workout.refresh();
                  toast('Restored from cloud', { tone: 'success' });
                } catch (err) {
                  toast(`Restore failed: ${err.message}`, { tone: 'error' });
                } finally { setPendingRestore(null); }
              }}
              className="flex-1 h-tap rounded-full bg-danger-soft border border-danger-border text-danger font-semibold"
            >Replace</button>
          </div>
        }
      >
        <p className="text-label">
          This will <span className="text-danger font-semibold">replace everything on this device</span> with your cloud backup.
        </p>
        {pendingRestore && (
          <p className="text-label text-ink-tertiary mt-2">
            {pendingRestore.exercises?.length ?? 0} exercises · {pendingRestore.workouts?.length ?? 0} workouts ·
            backed up {pendingRestore.exportedAt?.slice(0, 10)}
          </p>
        )}
      </Modal>

      <Modal open={confirmDeleteAccount} onClose={() => setConfirmDeleteAccount(false)} title="Delete your account?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmDeleteAccount(false)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  await deleteMyAccount(auth.userId);
                  await auth.signOut();
                  setConfirmDeleteAccount(false);
                  toast('Account deleted', { tone: 'error' });
                } catch (err) {
                  toast(err.message, { tone: 'error' });
                }
              }}
              className="flex-1 h-tap rounded-row bg-danger text-on-primary font-semibold"
            >Delete account</button>
          </div>
        }
      >
        <p className="text-label">
          Your profile, friendships, challenges and cloud backup are deleted permanently. This cannot be undone.
        </p>
        <p className="text-label text-ink-tertiary mt-2">
          Your workout history stays on this device — export a backup first if you want to keep a copy elsewhere.
        </p>
      </Modal>

      <ExerciseLibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} workout={workout} />

      <Modal open={!!pendingImport} onClose={() => setPendingImport(null)} title="Import backup?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setPendingImport(null)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  const r = await importReplaceAll(pendingImport);
                  await workout.refresh();
                  const repaired = r.problems.repairedWorkouts + r.problems.duplicateWorkouts;
                  toast(
                    `Restored ${r.workouts} workouts${repaired ? ` · ${repaired} repaired` : ''}`,
                    { tone: 'success', duration: 4000 }
                  );
                } catch (err) {
                  toast(`Import failed: ${err.message}`, { tone: 'error' });
                } finally {
                  setPendingImport(null);
                }
              }}
              className="flex-1 h-tap rounded-full bg-danger-soft border border-danger-border text-danger font-semibold"
            >Replace</button>
          </div>
        }
      >
        <p className="text-label">
          This will <span className="text-danger font-semibold">replace all of your current data</span> with the backup contents.
        </p>
        {pendingImport && (
          <p className="text-label text-ink-tertiary mt-2">
            {pendingImport.exercises?.length ?? 0} exercises · {pendingImport.workouts?.length ?? 0} workouts · schema v{pendingImport.schemaVersion} · exported {pendingImport.exportedAt?.slice(0,19).replace('T',' ')}
          </p>
        )}
      </Modal>

      <Modal open={confirmAutoRestore} onClose={() => setConfirmAutoRestore(false)} title="Restore the automatic backup?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmAutoRestore(false)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  const r = await restoreFromAutomaticBackup();
                  await workout.refresh();
                  const repaired = r.problems.repairedWorkouts + r.problems.duplicateWorkouts;
                  toast(
                    `Restored ${r.workouts} workouts${repaired ? ` · ${repaired} repaired` : ''}`,
                    { tone: 'success', duration: 4000 }
                  );
                } catch (err) {
                  toast(`Restore failed: ${err.message}`, { tone: 'error', duration: 4500 });
                } finally { setConfirmAutoRestore(false); }
              }}
              className="flex-1 h-tap rounded-full bg-danger-soft border border-danger-border text-danger font-semibold"
            >Restore</button>
          </div>
        }
      >
        <p className="text-label">
          This will <span className="text-danger font-semibold">replace everything on this device</span> with
          your data as it was before this version.
        </p>
        <p className="text-label text-ink-tertiary mt-2">
          Anything logged since then will be gone — export a backup first if you want to keep it.
          The automatic copy itself is not consumed, so this can be done again.
        </p>
      </Modal>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Clear all data?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmWipe(false)} className="flex-1 h-tap rounded-row border border-glass-border">Cancel</button>
            <button
              onClick={async () => {
                await wipeAllData();
                await workout.refresh();
                setConfirmWipe(false);
                toast('All data cleared', { tone: 'error' });
                // Ensure default exercises come back and app doesn't get stuck in an empty state.
                setTimeout(() => window.location.reload(), 400);
              }}
              className="flex-1 h-tap rounded-row bg-danger text-on-primary font-semibold"
            >Delete everything</button>
          </div>
        }
      >
        <p className="text-label">This permanently deletes all workouts, custom exercises and settings on this device. Export a backup first if you want to keep them.</p>
      </Modal>
    </div>
  );
}

// "1 exercises" is the kind of thing that makes an app feel unfinished.
function plural(n, word) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

// The list of merges still inside the undo window.
//
// Renders nothing at all when there are none, which is the normal case — a
// settings screen should not carry a permanently empty section explaining a
// feature most people never touch.
function MergedExercisesSection({ exercises = [], onUndo }) {
  const [busy, setBusy] = useState(null);
  const merges = useMemo(() => listReversibleMergesSync(exercises), [exercises]);
  if (!merges.length) return null;

  return (
    <Section title="Merged exercises">
      <p className="text-label font-regular text-ink-tertiary py-sm">
        A merged custom exercise behaves as the library one everywhere — its sets,
        PRs and charts are all counted under it. Nothing was deleted, so a merge
        can be reversed for {MERGE_UNDO_DAYS} days.
      </p>
      {merges.map((m) => (
        <div key={m.customId} className="flex items-center justify-between gap-md min-h-tap py-sm">
          <span className="min-w-0">
            <span className="block text-body font-regular text-ink truncate">
              {m.customName} → {m.intoName}
            </span>
            <span className="block text-label font-regular text-ink-tertiary">
              {m.daysLeft} {m.daysLeft === 1 ? 'day' : 'days'} left to reverse
            </span>
          </span>
          <button
            type="button"
            disabled={busy === m.customId}
            onClick={async () => {
              setBusy(m.customId);
              try { await onUndo?.(m.customId, m.customName); }
              finally { setBusy(null); }
            }}
            className="shrink-0 h-9 px-md rounded-full bg-glass border border-glass-border
                       text-label font-semibold text-ink disabled:opacity-40 active:bg-glass-pressed"
          >
            Reverse
          </button>
        </div>
      ))}
    </Section>
  );
}

// The same computation as listReversibleMerges(), but over the exercise list
// the app is already holding rather than a fresh database read — so the section
// updates the moment a merge is reversed, with no second source of truth.
function listReversibleMergesSync(exercises) {
  const now = Date.now();
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const dayMs = 86400000;
  return exercises
    .filter((e) => e.mergedInto && (now - (e.mergedAt || 0)) <= MERGE_UNDO_DAYS * dayMs)
    .map((e) => ({
      customId: e.id,
      customName: e.name,
      intoName: byId.get(e.mergedInto)?.name || 'Unknown exercise',
      mergedAt: e.mergedAt || 0,
      daysLeft: Math.max(0, Math.ceil(MERGE_UNDO_DAYS - (now - (e.mergedAt || 0)) / dayMs))
    }))
    .sort((a, b) => b.mergedAt - a.mergedAt);
}

// The section heading sits OUTSIDE the card, on the page. A heading inside a
// card is a title for the card; a heading above it is a title for the group,
// which is what these are.
function Section({ title, children }) {
  return (
    <section className="mt-xl">
      <h2 className="text-micro font-semibold uppercase text-ink-tertiary mb-sm">{title}</h2>
      <div className="bg-glass border border-glass-border rounded-card px-base divide-y divide-hairline">
        {children}
      </div>
    </section>
  );
}
function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-md min-h-tap py-sm">
      <span className="text-body font-regular text-ink">{label}</span>
      {children}
    </div>
  );
}
// A two-state switch, shaped like a switch. The old inline segmented control
// made On/Off look like a pair of equal choices rather than a thing that is
// currently one way.
function Segmented({ value, onChange, options }) {
  const on = value === options[0].value;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(on ? options[1].value : options[0].value)}
      // The switch LOOKS 52x32 and IS 52x44: the track is drawn inside a
      // full-height hit area rather than being the hit area.
      className="relative w-[52px] h-tap shrink-0 flex items-center"
    >
      <span
        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 rounded-full border
                    transition-colors duration-fast ease-out
                    ${on ? 'bg-primary border-transparent' : 'bg-glass-inset border-glass-inset-border'}`}
      />
      <span
        className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full transition-[left] duration-fast ease-out
                    ${on ? 'left-[23px] bg-on-primary' : 'left-[3px] bg-ink-tertiary'}`}
      />
    </button>
  );
}
// A full-width row that does something, rather than a bordered button inside a
// bordered card. Cards group; they do not need a second frame inside them.
function ActionButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-tap py-md -mx-base px-base flex items-center gap-md text-left
                  text-body font-regular transition-colors duration-fast ease-out
                  active:bg-glass-pressed ${danger ? 'text-danger' : 'text-ink'}`}
    >
      <Icon size={18} strokeWidth={2} className="shrink-0" /> {label}
    </button>
  );
}
