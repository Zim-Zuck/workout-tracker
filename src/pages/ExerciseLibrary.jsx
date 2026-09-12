import { useMemo, useState } from 'react';
import { Search, Plus, Edit3, Trash2 } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { MUSCLE_GROUPS, EQUIPMENT } from '../data/defaultExercises.js';
import { saveExercise, deleteExercise as dbDeleteExercise, getAllExercises } from '../db/database.js';
import { uid } from '../utils/id.js';
import { useToast } from '../components/Toast.jsx';

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

  const list = useMemo(() => {
    return exercises
      .filter((e) => (!q || e.name.toLowerCase().includes(q.toLowerCase())))
      .filter((e) => (!filterMuscle || (e.muscleGroups || []).includes(filterMuscle)))
      .sort((a, b) => a.name.localeCompare(b.name));
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search exercises"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
          />
        </div>
        <button
          onClick={() => setEditing({})}
          aria-label="New exercise"
          className="h-11 px-3 rounded-xl bg-accent text-white font-semibold flex items-center gap-1"
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
          <li key={ex.id} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{ex.name}{ex.builtin && <span className="ml-2 text-[10px] text-muted uppercase">built-in</span>}</div>
              <div className="text-xs text-muted truncate">
                {(ex.muscleGroups || []).join(' · ')} · {ex.equipment} · {ex.defaultReps?.[0]}–{ex.defaultReps?.[1]} reps · {ex.defaultRestSec}s rest
              </div>
            </div>
            <button aria-label={`Edit ${ex.name}`} onClick={() => setEditing(ex)} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-muted active:bg-card">
              <Edit3 size={16} />
            </button>
            {!ex.builtin && (
              <button aria-label={`Delete ${ex.name}`} onClick={() => remove(ex)} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-danger active:bg-card">
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="text-center text-muted text-sm py-8">No exercises match.</li>}
      </ul>

      {editing && (
        <ExerciseEditor
          initial={editing}
          onClose={() => setEditing(null)}
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
      className={`shrink-0 h-8 px-3 rounded-full text-xs border ${active ? 'bg-accent text-white border-accent' : 'bg-card text-muted border-border'}`}
    >{label}</button>
  );
}

function ExerciseEditor({ initial, onClose, onSave }) {
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name || '');
  const [groups, setGroups] = useState(initial.muscleGroups || []);
  const [equipment, setEquipment] = useState(initial.equipment || 'Barbell');
  const [repLow, setRepLow] = useState(initial.defaultReps?.[0] ?? 8);
  const [repHigh, setRepHigh] = useState(initial.defaultReps?.[1] ?? 10);
  const [rest, setRest] = useState(initial.defaultRestSec ?? 120);

  const toggle = (g) => setGroups((cur) => cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]);

  const canSave = name.trim().length > 0 && repLow > 0 && repHigh >= repLow;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isNew ? 'New exercise' : 'Edit exercise'}
      footer={
        <button
          disabled={!canSave}
          onClick={() => onSave({
            id: initial.id || uid('ex'),
            name: name.trim(),
            muscleGroups: groups,
            equipment,
            defaultReps: [Number(repLow), Number(repHigh)],
            defaultRestSec: Number(rest),
            builtin: initial.builtin || false
          })}
          className="w-full h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-40"
        >
          Save
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-3 text-sm" />
        </label>
        <div>
          <div className="text-sm mb-1">Muscle groups</div>
          <div className="flex flex-wrap gap-1">
            {MUSCLE_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => toggle(g)}
                className={`h-8 px-3 rounded-full text-xs border ${groups.includes(g) ? 'bg-accent text-white border-accent' : 'bg-card text-muted border-border'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">Equipment
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm">
            {EQUIPMENT.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Rep low
            <input type="number" inputMode="numeric" value={repLow} onChange={(e) => setRepLow(Number(e.target.value))} className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm" />
          </label>
          <label className="text-sm">Rep high
            <input type="number" inputMode="numeric" value={repHigh} onChange={(e) => setRepHigh(Number(e.target.value))} className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm" />
          </label>
          <label className="text-sm">Rest (s)
            <input type="number" inputMode="numeric" value={rest} onChange={(e) => setRest(Number(e.target.value))} className="mt-1 w-full h-11 rounded-lg bg-card border border-border px-2 text-sm" />
          </label>
        </div>
      </div>
    </Modal>
  );
}
