import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Trash2, Info, Wifi, WifiOff, ListChecks, LogIn, LogOut, CloudUpload, CloudDownload, UserX } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { SCHEMA_VERSION } from '../db/database.js';
import { downloadBackup, importReplaceAll, wipeAllData, validateBackup } from '../services/dataManager.js';
import { maybeSeed } from '../db/seedData.js';
import ExerciseLibrarySheet from '../components/ExerciseLibrarySheet.jsx';
import { backupNow, fetchBackup, restoreBackup, getBackupInfo } from '../services/backupApi.js';
import { deleteMyAccount } from '../services/profileApi.js';
import { relativeDay } from '../utils/date.js';

export default function SettingsScreen({ settings, updateSettings, workout, auth, onSignIn }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null); // parsed data
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [backupInfo, setBackupInfo] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

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
    <div className="p-3 space-y-4">
      {auth?.cloudConfigured && (
        <Section title="Account">
          {auth.signedIn ? (
            <>
              <Row label="Signed in as">
                <span className="text-sm text-muted truncate max-w-[55%]">{auth.user?.email}</span>
              </Row>
              <ActionButton icon={LogOut} label="Sign out" onClick={async () => {
                await auth.signOut();
                toast('Signed out');
              }} />
            </>
          ) : (
            <>
              <p className="text-xs text-muted mb-2">
                An account adds friends, challenges and cloud backup. Your workouts stay on this device either way.
              </p>
              <ActionButton icon={LogIn} label="Sign in or create account" onClick={onSignIn} />
            </>
          )}
        </Section>
      )}

      <Section title="Preferences">
        <Row label="Weight unit">
          <Segmented
            value={settings.unit}
            onChange={(v) => updateSettings({ unit: v })}
            options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]}
          />
        </Row>
        <Row label="Default rest timer">
          <select
            value={settings.defaultRestSec}
            onChange={(e) => updateSettings({ defaultRestSec: Number(e.target.value) })}
            className="h-10 rounded-lg bg-card border border-border px-2 text-sm"
          >
            {[60, 90, 120, 150, 180, 240].map((s) => <option key={s} value={s}>{s < 60 ? `${s}s` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}</option>)}
          </select>
        </Row>
        <Row label="Default rep range">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={settings.defaultRepsLow}
              onChange={(e) => updateSettings({ defaultRepsLow: Number(e.target.value) })}
              className="w-16 h-10 rounded-lg bg-card border border-border text-center text-sm" />
            <span className="text-muted">–</span>
            <input type="number" inputMode="numeric" value={settings.defaultRepsHigh}
              onChange={(e) => updateSettings({ defaultRepsHigh: Number(e.target.value) })}
              className="w-16 h-10 rounded-lg bg-card border border-border text-center text-sm" />
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
        <p className="text-xs text-muted mb-2">Add your own lifts, or edit the built-in ones. Also reachable while adding an exercise mid-workout.</p>
        <ActionButton icon={ListChecks} label="Exercise library" onClick={() => setLibraryOpen(true)} />
      </Section>

      <Section title="Data">
        <p className="text-xs text-muted mb-2">
          Your workouts are stored locally on this device. Export a backup regularly, or sign in to back them up to the cloud.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <ActionButton icon={Download} label="Export JSON backup" onClick={async () => { await downloadBackup(); toast('Backup downloaded'); }} />
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

      {auth?.signedIn && (
        <Section title="Cloud backup">
          <p className="text-xs text-muted mb-2">
            A copy of your workouts stored against your account, so a new phone can pick up where this one left off.
            It backs up automatically once a day after a workout.
          </p>
          <Row label="Last backup">
            <span className="text-sm text-muted">
              {backupInfo === null ? '—'
                : backupInfo.updatedAt ? relativeDay(backupInfo.updatedAt)
                : backupInfo.localLast ? relativeDay(backupInfo.localLast)
                : 'Never'}
            </span>
          </Row>
          <div className="grid grid-cols-1 gap-2">
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
          <p className="text-xs text-muted mb-2">
            Deleting your account removes your profile, friends, challenges and cloud backup permanently.
            Workouts on this device are not touched.
          </p>
          <ActionButton icon={UserX} label="Delete my account" danger onClick={() => setConfirmDeleteAccount(true)} />
        </Section>
      )}

      <Section title="About">
        <Row label="App"><span className="text-sm text-text font-medium">Kun Workouts</span></Row>
        <Row label="App version"><span className="text-sm text-muted">1.0.0</span></Row>
        <Row label="Data schema"><span className="text-sm text-muted">v{SCHEMA_VERSION}</span></Row>
        <Row label="Connection">
          <span className={`inline-flex items-center gap-1 text-sm ${online ? 'text-success' : 'text-warn'}`}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'Online' : 'Offline'}
          </span>
        </Row>
        <p className="text-xs text-muted mt-3">This app works fully offline after first load. Add it to your Home Screen from Safari's Share menu for an app-like experience.</p>
      </Section>

      <Modal open={!!pendingRestore} onClose={() => setPendingRestore(null)} title="Restore from cloud?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setPendingRestore(null)} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
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
              className="flex-1 h-11 rounded-xl bg-warn text-white font-semibold"
            >Replace</button>
          </div>
        }
      >
        <p className="text-sm">
          This will <span className="text-danger font-semibold">replace everything on this device</span> with your cloud backup.
        </p>
        {pendingRestore && (
          <p className="text-xs text-muted mt-2">
            {pendingRestore.exercises?.length ?? 0} exercises · {pendingRestore.workouts?.length ?? 0} workouts ·
            backed up {pendingRestore.exportedAt?.slice(0, 10)}
          </p>
        )}
      </Modal>

      <Modal open={confirmDeleteAccount} onClose={() => setConfirmDeleteAccount(false)} title="Delete your account?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmDeleteAccount(false)} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
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
              className="flex-1 h-11 rounded-xl bg-danger text-white font-semibold"
            >Delete account</button>
          </div>
        }
      >
        <p className="text-sm">
          Your profile, friendships, challenges and cloud backup are deleted permanently. This cannot be undone.
        </p>
        <p className="text-xs text-muted mt-2">
          Your workout history stays on this device — export a backup first if you want to keep a copy elsewhere.
        </p>
      </Modal>

      <ExerciseLibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} workout={workout} />

      <Modal open={!!pendingImport} onClose={() => setPendingImport(null)} title="Import backup?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setPendingImport(null)} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
            <button
              onClick={async () => {
                try {
                  await importReplaceAll(pendingImport);
                  await workout.refresh();
                  toast('Data restored', { tone: 'success' });
                } catch (err) {
                  toast(`Import failed: ${err.message}`, { tone: 'error' });
                } finally {
                  setPendingImport(null);
                }
              }}
              className="flex-1 h-11 rounded-xl bg-warn text-white font-semibold"
            >Replace</button>
          </div>
        }
      >
        <p className="text-sm">
          This will <span className="text-danger font-semibold">replace all of your current data</span> with the backup contents.
        </p>
        {pendingImport && (
          <p className="text-xs text-muted mt-2">
            {pendingImport.exercises?.length ?? 0} exercises · {pendingImport.workouts?.length ?? 0} workouts · schema v{pendingImport.schemaVersion} · exported {pendingImport.exportedAt?.slice(0,19).replace('T',' ')}
          </p>
        )}
      </Modal>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Clear all data?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setConfirmWipe(false)} className="flex-1 h-11 rounded-xl border border-border">Cancel</button>
            <button
              onClick={async () => {
                await wipeAllData();
                await workout.refresh();
                setConfirmWipe(false);
                toast('All data cleared', { tone: 'error' });
                // Ensure default exercises come back and app doesn't get stuck in an empty state.
                setTimeout(() => window.location.reload(), 400);
              }}
              className="flex-1 h-11 rounded-xl bg-danger text-white font-semibold"
            >Delete everything</button>
          </div>
        }
      >
        <p className="text-sm">This permanently deletes all workouts, custom exercises and settings on this device. Export a backup first if you want to keep them.</p>
      </Modal>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-3">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 min-h-[44px]">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg bg-card border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 h-10 text-sm ${value === o.value ? 'bg-accent text-white' : 'text-muted'}`}
        >{o.label}</button>
      ))}
    </div>
  );
}
function ActionButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full h-12 rounded-xl border flex items-center justify-center gap-2 font-medium ${
        danger ? 'border-danger/50 text-danger active:bg-danger/10' : 'border-border text-text active:bg-card'
      }`}
    >
      <Icon size={18} /> {label}
    </button>
  );
}
