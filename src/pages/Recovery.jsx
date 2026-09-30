import { useEffect, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, LifeBuoy } from 'lucide-react';
import { downloadRawDump } from '../services/dataManager.js';
// Statically imported, deliberately. A recovery screen that has to fetch a
// JavaScript chunk before it can read your data is a recovery screen that does
// not work offline, or behind a service worker serving a stale asset list.
import { rawDump } from '../db/database.js';

// THE SCREEN THAT EXISTS SO A FAILURE IS NEVER A BLANK ONE.
//
// Shown when the database could not be opened, the schema upgrade failed, or app
// boot threw. The old version of this was a paragraph of text: correct, and
// useless, because the one thing a person in that state wants is their training
// history out of the device and somewhere safe.
//
// Everything on this screen is deliberately built out of as little of the app as
// possible. No hooks that touch the database, no openDB(), no design-system
// components that might themselves be part of what is broken — just Tailwind
// classes and one function that reads the raw stores at whatever version is on
// disk. If the recovery screen depends on the thing that failed, there is no
// recovery screen.
export default function RecoveryScreen({ error, blocked }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [exportError, setExportError] = useState(null);

  // Whether there is anything to export at all. Asked once, on mount, so the
  // button can promise a count instead of hoping.
  const [found, setFound] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dump = await rawDump();
        if (!alive) return;
        setFound({
          workouts: dump.stores?.workouts?.length ?? 0,
          exercises: dump.stores?.exercises?.length ?? 0,
          backupWorkouts: dump.stores?.workouts_backup_v2?.length ?? 0,
          dbVersion: dump.dbVersion
        });
      } catch {
        if (alive) setFound({ unreadable: true });
      }
    })();
    return () => { alive = false; };
  }, []);

  const total = found && !found.unreadable
    ? Math.max(found.workouts, found.backupWorkouts)
    : 0;

  return (
    <div className="min-h-screen px-base py-xl flex flex-col items-center safe-top">
      <div className="w-full max-w-app">
        <AlertTriangle size={28} strokeWidth={2} className="text-danger mb-md" />
        <h1 className="text-title font-semibold text-ink mb-md">Kun Workouts could not start</h1>

        {/* THE FIRST THING SAID IS THAT THE DATA IS STILL THERE. Every other
            sentence on this screen is less urgent than that one. */}
        <p className="text-body text-ink mb-md">
          {blocked
            ? 'Another tab or window still has an older version of the app open, and it is holding the database.'
            : 'Something went wrong while opening your workout database.'}
          {' '}
          <span className="font-semibold">
            Your workouts have not been deleted or changed.
          </span>
        </p>

        {blocked ? (
          <p className="text-label text-ink-secondary mb-lg">
            Close every other Kun Workouts tab and window, then reload this page. If you have it
            on your Home Screen, close it there too.
          </p>
        ) : (
          <p className="text-label text-ink-secondary mb-lg">
            Nothing was written, so the data on this device is exactly as it was before. Export a
            copy now — that file can be imported back into the app at any time.
          </p>
        )}

        {found && !found.unreadable && (
          <div className="bg-glass border border-glass-border rounded-card px-base py-md mb-md">
            <p className="text-label text-ink">
              Readable on this device:{' '}
              <span className="font-semibold">{found.workouts.toLocaleString()} workouts</span>
              {found.backupWorkouts > 0 && (
                <>, plus an automatic pre-upgrade backup of{' '}
                <span className="font-semibold">{found.backupWorkouts.toLocaleString()}</span></>
              )}
              .
            </p>
            <p className="text-label text-ink-tertiary mt-1">
              Database version {found.dbVersion}. The export below includes everything, both sets of records.
            </p>
          </div>
        )}
        {found?.unreadable && (
          <div className="bg-glass border border-glass-border rounded-card px-base py-md mb-md">
            <p className="text-label text-ink-secondary">
              The database could not be read to count records. The export below is still worth
              trying — it takes a different route to the same data.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setExportError(null);
            try {
              setResult(await downloadRawDump());
            } catch (err) {
              setExportError(err?.message || String(err));
            } finally { setBusy(false); }
          }}
          className="w-full min-h-tap rounded-full bg-primary text-on-primary font-semibold
                     flex items-center justify-center gap-sm mb-sm disabled:opacity-50"
        >
          <Download size={18} strokeWidth={2} />
          {busy ? 'Reading your data…' : total ? `Export my data (${total.toLocaleString()} workouts)` : 'Export my data'}
        </button>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full min-h-tap rounded-full border border-glass-border text-ink font-semibold
                     flex items-center justify-center gap-sm"
        >
          <RefreshCw size={18} strokeWidth={2} /> Reload and try again
        </button>

        {result && (
          <p className="text-label text-done mt-md">
            Exported. {Object.entries(result)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${n.toLocaleString()} ${k}`)
              .join(' · ')}. Keep that file somewhere safe — Settings → Import JSON backup reads it back.
          </p>
        )}
        {exportError && (
          <p className="text-label text-danger mt-md">
            The export failed: {exportError}. Try reloading, or open the app in another browser on
            this device — the data belongs to this browser, not to the app.
          </p>
        )}

        <div className="mt-xl pt-md border-t border-hairline">
          <div className="flex items-center gap-sm text-ink-tertiary mb-sm">
            <LifeBuoy size={16} strokeWidth={2} />
            <h2 className="text-micro font-semibold uppercase">Technical detail</h2>
          </div>
          <p className="text-label text-ink-tertiary break-words"
             style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            {error || 'No error message was reported.'}
          </p>
          <p className="text-label text-ink-tertiary mt-sm">
            Private-browsing mode disables IndexedDB in some browsers. If you are in a private
            window, the app cannot store anything — open it in a normal window.
          </p>
        </div>
      </div>
    </div>
  );
}
