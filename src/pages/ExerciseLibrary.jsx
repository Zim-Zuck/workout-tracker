import { useMemo, useState } from 'react';
import { Search, Plus, Edit3, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { MUSCLE_GROUPS, EQUIPMENT } from '../data/defaultExercises.js';
import { saveExercise, deleteExercise as dbDeleteExercise, getAllExercises } from '../db/database.js';
import { uid } from '../utils/id.js';
import { useToast } from '../components/Toast.jsx';
import { searchExercises } from '../services/exerciseSearch.js';
import {
  visibleExercises, bestMatch, similarity, DID_YOU_MEAN_THRESHOLD
} from '../services/exerciseIdentity.js';

export default function ExerciseLibrary({ workout }) {
  const { exercises, setExercises, workouts } = workout;
  const [q, setQ] = useState('');
  const [filterMuscle, setFilterMuscle] = useState('');
  const [editing, setEditing] = useState(null); // exercise object or {} for new
  const toast = useToast();

  const usedIds = useMemo(() => {
    const s = new Set();
    for (const w of workouts) for (const id of w.exercises || []) s.add(id);
    return s;
  }, [workouts]);

  // The same normalized matcher the picker uses, so searching here and
  // searching there can never disagree. Merged custom exercises are hidden:
  // they behave as the library exercise they point at, and listing both would
  // show the same lift twice.
  const list = useMemo(() => {
    const pool = visibleExercises(exercises)
      .filter((e) => (!filterMuscle || (e.muscleGroups || []).includes(filterMuscle)));
    return searchExercises(pool, q);
  }, [exercises, q, filterMuscle]);

  const refresh = async () => setExercises(await getAllExercises());

  const remove = async (ex) => {
    if (usedIds.has(ex.id)) {
      toast('Cannot delete: exercise is referenced by past workouts. History would break.', { tone: 'error' });
      return;
    }
    await dbDeleteExercise(ex.id);
    await refresh();
    toast('Exercise deleted');
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, equipment or muscle"
            className="w-full h-tap pl-9 pr-3 rounded-row bg-glass-inset border border-glass-border outline-none focus:border-focus text-label"
          />
        </div>
        <button
          onClick={() => setEditing({})}
          aria-label="New exercise"
          className="h-tap px-3 rounded-row bg-primary text-on-primary font-semibold flex items-center gap-1"
        >
          <Plus size={18} /> New
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 scroll-y">
        <Chip active={!filterMuscle} onClick={() => setFilterMuscle('')} label="All" />
        {MUSCLE_GROUPS.map((m) => (
          <Chip key={m} active={filterMuscle === m} onClick={() => setFilterMuscle(m === filterMuscle ? '' : m)} label={m} />
        ))}
      </div>

      <ul className="space-y-2 mt-2">
        {list.map((ex) => (
          <li key={ex.id} className="bg-glass border border-glass-border rounded-row p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-label font-semibold truncate">{ex.name}{ex.builtin && <span className="ml-2 text-micro tracking-normal text-ink-tertiary uppercase">built-in</span>}</div>
              <div className="text-label text-ink-tertiary truncate">
                {(ex.muscleGroups || []).join(' · ')} · {ex.equipment} · {ex.defaultReps?.[0]}–{ex.defaultReps?.[1]} reps · {ex.defaultRestSec}s rest
              </div>
            </div>
            <button aria-label={`Edit ${ex.name}`} onClick={() => setEditing(ex)} className="w-10 h-10 rounded-control border border-glass-border flex items-center justify-center text-ink-tertiary active:bg-glass-inset">
              <Edit3 size={16} />
            </button>
            {!ex.builtin && (
              <button aria-label={`Delete ${ex.name}`} onClick={() => remove(ex)} className="w-10 h-10 rounded-control border border-glass-border flex items-center justify-center text-danger active:bg-glass-inset">
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-center py-8">
            <p className="text-label text-ink">
              {q.trim() ? `No exercise matches “${q.trim()}”` : 'No exercises match.'}
            </p>
            <button
              onClick={() => setEditing({ name: q.trim() })}
              className="mt-3 h-tap px-4 rounded-row bg-glass border border-glass-border text-label font-semibold text-ink"
            >
              Create custom exercise
            </button>
          </li>
        )}
      </ul>

      {editing && (
        <ExerciseEditor
          initial={editing}
          existing={exercises}
          onClose={() => setEditing(null)}
          // "Use library exercise" here means "stop creating, show me that one":
          // the list filters down to it so the next tap is on the real thing.
          onUseLibrary={(ex) => { setQ(ex.name); setFilterMuscle(''); setEditing(null); }}
          onSave={async (ex) => {
            await saveExercise(ex);
            await refresh();
            setEditing(null);
            toast('Saved');
          }}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full text-label border ${active ? 'bg-primary text-on-primary border-focus' : 'bg-glass-inset text-ink-tertiary border-glass-border'}`}
    >{label}</button>
  );
}

function ExerciseEditor({ initial, existing = [], onClose, onSave, onUseLibrary }) {
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name || '');
  const [groups, setGroups] = useState(initial.muscleGroups || []);
  const [equipment, setEquipment] = useState(initial.equipment || 'Barbell');
  const [repLow, setRepLow] = useState(initial.defaultReps?.[0] ?? 8);
  const [repHigh, setRepHigh] = useState(initial.defaultReps?.[1] ?? 10);
  const [rest, setRest] = useState(initial.defaultRestSec ?? 120);
  const [overridden, setOverridden] = useState(false);

  const toggle = (g) => setGroups((cur) => cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]);

  const canSave = name.trim().length > 0 && repLow > 0 && repHigh >= repLow;

  // DID YOU MEAN — the same prevention the picker's create flow offers, because
  // this is the other door into creating a custom exercise and a duplicate made
  // here is exactly as awkward to clean up later.
  const suggestion = useMemo(() => {
    if (!isNew || !name.trim() || overridden) return null;
    const draft = { id: '__draft__', name: name.trim(), equipment, muscleGroups: groups };
    const pool = visibleExercises(existing).filter((e) => e.id !== initial.id);
    const match = bestMatch(draft, pool);
    if (match) return match;
    let best = null;
    for (const c of pool) {
      const score = similarity(draft, c);
      if (score >= DID_YOU_MEAN_THRESHOLD && (!best || score > best.score)) best = { exercise: c, score };
    }
    return best;
  }, [isNew, name, equipment, groups, existing, initial.id, overridden]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isNew ? 'New exercise' : 'Edit exercise'}
      footer={
        <button
          disabled={!canSave}
          onClick={() => onSave({
            // Spread first: an edit must not silently drop fields this form does
            // not show (aliases, mergedInto, a per-user weight increment).
            ...initial,
            id: initial.id || uid('ex'),
            name: name.trim(),
            muscleGroups: groups,
            equipment,
            defaultReps: [Number(repLow), Number(repHigh)],
            defaultRestSec: Number(rest),
            builtin: initial.builtin || false
          })}
          className="w-full h-tap rounded-row bg-primary text-on-primary font-semibold disabled:opacity-40"
        >
          Save
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block text-label">Name
          <input value={name} onChange={(e) => { setName(e.target.value); setOverridden(false); }} className="mt-1 w-full h-tap rounded-control bg-glass-inset border border-glass-border px-3 text-label" />
        </label>

        {suggestion && (
          <div className="rounded-row bg-pr-soft border border-pr-border px-3 py-3">
            <p className="text-label font-semibold text-pr">
              Did you mean {suggestion.exercise.name}?
            </p>
            <p className="text-label text-ink-secondary mt-1">
              {[suggestion.exercise.equipment, (suggestion.exercise.muscleGroups || []).join(' · ')]
                .filter(Boolean).join(' — ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { onUseLibrary?.(suggestion.exercise); onClose?.(); }}
                className="h-9 px-3 rounded-full bg-glass border border-glass-border text-label font-semibold text-ink"
              >
                Use library exercise
              </button>
              <button
                type="button"
                onClick={() => setOverridden(true)}
                className="h-9 px-3 rounded-full bg-glass border border-glass-border text-label font-semibold text-ink"
              >
                Continue creating custom
              </button>
            </div>
          </div>
        )}
        <div>
          <div className="text-label mb-1">Muscle groups</div>
          <div className="flex flex-wrap gap-1">
            {MUSCLE_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => toggle(g)}
                className={`h-8 px-3 rounded-full text-label border ${groups.includes(g) ? 'bg-primary text-on-primary border-focus' : 'bg-glass-inset text-ink-tertiary border-glass-border'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-label">Equipment
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="mt-1 w-full h-tap rounded-control bg-glass-inset border border-glass-border px-2 text-label">
            {EQUIPMENT.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-label">Rep low
            <input type="number" inputMode="numeric" value={repLow} onChange={(e) => setRepLow(Number(e.target.value))} className="mt-1 w-full h-tap rounded-control bg-glass-inset border border-glass-border px-2 text-label" />
          </label>
          <label className="text-label">Rep high
            <input type="number" inputMode="numeric" value={repHigh} onChange={(e) => setRepHigh(Number(e.target.value))} className="mt-1 w-full h-tap rounded-control bg-glass-inset border border-glass-border px-2 text-label" />
          </label>
          <label className="text-label">Rest (s)
            <input type="number" inputMode="numeric" value={rest} onChange={(e) => setRest(Number(e.target.value))} className="mt-1 w-full h-tap rounded-control bg-glass-inset border border-glass-border px-2 text-label" />
          </label>
        </div>
      </div>
    </Modal>
  );
}
