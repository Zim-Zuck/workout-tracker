import { useMemo, useState } from 'react';
import { Search, Trash2, Edit3, Filter, ChevronRight } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import SetRow from '../components/SetRow.jsx';
import { formatDate, formatDuration, formatDateTime } from '../utils/date.js';
import { formatWeight } from '../utils/units.js';
import { workingVolume, isWorking } from '../services/calculations.js';

export default function HistoryScreen({ workout, settings }) {
  const { workouts, exercises, updateHistoricalWorkout, deleteHistoricalWorkout } = workout;
  const [q, setQ] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openId, setOpenId] = useState(null);

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const fmt = (kg) => formatWeight(kg, settings.unit);

  const filtered = useMemo(() => {
    return workouts.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (exerciseFilter && !w.exercises.includes(exerciseFilter)) return false;
      if (dateFrom) {
        const t = new Date(dateFrom).getTime();
        if (w.date < t) return false;
      }
      if (dateTo) {
        const t = new Date(dateTo).getTime() + 86399000;
        if (w.date > t) return false;
      }
      return true;
    });
  }, [workouts, q, exerciseFilter, dateFrom, dateTo]);

  const opened = openId ? workouts.find((w) => w.id === openId) : null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workouts"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
          />
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className={`h-11 px-3 rounded-xl border flex items-center gap-1 text-sm ${
            (exerciseFilter || dateFrom || dateTo) ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted'
          }`}
          aria-label="Filter"
        >
          <Filter size={16} /> Filter
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-muted text-sm py-16">
          {workouts.length === 0 ? 'No workouts logged yet.' : 'No workouts match your filters.'}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((w) => {
          const vol = workingVolume(w.sets);
          const dur = w.endTime ? w.endTime - w.startTime : 0;
          return (
            <li key={w.id}>
              <button
                onClick={() => setOpenId(w.id)}
                className="w-full text-left bg-surface border border-border rounded-2xl p-3 active:bg-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{w.name}</div>
                    <div className="text-xs text-muted mt-0.5">{formatDate(w.date)} · {formatDuration(dur)}</div>
                  </div>
                  <ChevronRight size={18} className="text-muted shrink-0" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted">
                  <Stat label="Exercises" value={w.exercises.length} />
                  <Stat label="Sets" value={w.sets.filter(isWorking).length} />
                  <Stat label="Volume" value={fmt(vol)} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter workouts">
        <div className="space-y-3">
          <label className="block text-sm">
            Exercise
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value)}
              className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm"
            >
              <option value="">All</option>
              {[...exercises].sort((a,b)=>a.name.localeCompare(b.name)).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm" />
            </label>
            <label className="text-sm">To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm" />
            </label>
          </div>
          <button
            onClick={() => { setExerciseFilter(''); setDateFrom(''); setDateTo(''); }}
            className="w-full h-11 rounded-lg border border-border text-muted"
          >
            Clear filters
          </button>
        </div>
      </Modal>

      {opened && (
        <WorkoutDetail
          key={opened.id}
          workout={opened}
          exMap={exMap}
          unit={settings.unit}
          onClose={() => setOpenId(null)}
          onSave={async (w) => { await updateHistoricalWorkout(w); }}
          onDelete={async () => { await deleteHistoricalWorkout(opened.id); setOpenId(null); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-card border border-border rounded-lg py-1.5 px-2">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className="text-xs font-semibold text-text">{value}</div>
    </div>
  );
}

function WorkoutDetail({ workout, exMap, unit, onClose, onSave, onDelete }) {
  const [w, setW] = useState(workout);
  const [confirmDel, setConfirmDel] = useState(false);
  const fmt = (kg) => formatWeight(kg, unit);
  const dur = w.endTime ? w.endTime - w.startTime : 0;
  const groupedIds = w.exercises.length ? w.exercises : [...new Set(w.sets.map(s => s.exerciseId))];

  const updateSet = (id, patch) => setW({ ...w, sets: w.sets.map((s) => s.id === id ? { ...s, ...patch } : s) });
  const removeSet = (id) => setW({ ...w, sets: w.sets.filter((s) => s.id !== id) });

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={w.name || 'Workout'}
      footer={
        <div className="flex gap-2">
          <button onClick={() => setConfirmDel(true)} className="flex-1 h-11 rounded-xl border border-danger/60 text-danger flex items-center justify-center gap-2">
            <Trash2 size={16} /> Delete
          </button>
          <button onClick={async () => { await onSave(w); onClose(); }} className="flex-1 h-11 rounded-xl bg-accent text-white font-semibold flex items-center justify-center gap-2">
            <Edit3 size={16} /> Save
          </button>
        </div>
      }
    >
      <div className="space-y-1 mb-3">
        <input
          value={w.name}
          onChange={(e) => setW({ ...w, name: e.target.value })}
          className="w-full h-10 bg-card border border-border rounded-lg px-3 text-sm font-medium"
          aria-label="Workout name"
        />
        <div className="text-xs text-muted">{formatDateTime(w.startTime || w.date)} · {formatDuration(dur)}</div>
      </div>
      <div className="space-y-3">
        {groupedIds.map((exId) => {
          const ex = exMap.get(exId);
          const rows = w.sets.filter((s) => s.exerciseId === exId).sort((a, b) => a.timestamp - b.timestamp);
          return (
            <div key={exId} className="bg-card border border-border rounded-xl p-2">
              <div className="text-sm font-semibold mb-2">{ex ? ex.name : `Deleted exercise (${exId.slice(0,8)}…)`}</div>
              <div className="space-y-2">
                {rows.map((s, i) => (
                  <SetRow
                    key={s.id}
                    index={i}
                    set={s}
                    unit={unit}
                    onChange={(patch) => updateSet(s.id, patch)}
                    onComplete={() => updateSet(s.id, { completed: !s.completed })}
                    onDelete={() => removeSet(s.id)}
                  />
                ))}
                {rows.length === 0 && <div className="text-xs text-muted p-2">No sets</div>}
              </div>
            </div>
          );
        })}
      </div>
      {w.notes && (
        <p className="mt-3 text-sm text-muted whitespace-pre-wrap">{w.notes}</p>
      )}
      {confirmDel && (
        <div className="mt-4 p-3 border border-danger/40 bg-danger/10 rounded-xl text-sm">
          Delete this workout? This can't be undone.
          <div className="flex gap-2 mt-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-10 rounded-lg border border-border">Cancel</button>
            <button onClick={onDelete} className="flex-1 h-10 rounded-lg bg-danger text-white font-semibold">Delete</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
