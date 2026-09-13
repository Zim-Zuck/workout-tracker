import { useMemo, useState } from 'react';
import { MoreVertical, Plus, ArrowUp, ArrowDown, Trash2, Repeat, Award } from 'lucide-react';
import SetRow from './SetRow.jsx';
import { formatWeight } from '../utils/units.js';
import { previousPerformance, summarizeSets, detectPRs, isWorking } from '../services/calculations.js';
import { recommend } from '../services/progression.js';

export default function ExerciseCard({
  exercise,
  activeSets,
  history,
  unit,
  index,
  totalCount,
  onAddSet,
  onUpdateSet,
  onCompleteSet,
  onDeleteSet,
  onRemoveExercise,
  onMoveUp,
  onMoveDown,
  onReplace
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const prev = useMemo(() => previousPerformance(exercise.id, history), [exercise.id, history]);
  const rec = useMemo(() => recommend({ exercise, workoutHistory: history, unit }), [exercise, history, unit]);

  const fmt = (kg) => formatWeight(kg, unit);
  const prevSummary = prev
    ? summarizeSets(prev.sets, fmt)
    : 'No previous data';

  // PR detection against workouts BEFORE the active workout (i.e. all of history).
  const priorWorkingSets = useMemo(() => {
    const out = [];
    for (const w of history) for (const s of w.sets || []) if (s.exerciseId === exercise.id && isWorking(s)) out.push(s);
    return out;
  }, [history, exercise.id]);
  const currentWorking = activeSets.filter(isWorking);
  const prs = useMemo(() => detectPRs(priorWorkingSets, currentWorking), [priorWorkingSets, currentWorking]);
  const anyPR = prs.weight || prs.reps || prs.e1rm || prs.volume;

  const targetLine = rec.action === 'first-session'
    ? `${rec.targetRepsLow}–${rec.targetRepsHigh} reps`
    : `${fmt(rec.targetWeightKg)} × ${rec.targetRepsLow}–${rec.targetRepsHigh}`;

  return (
    <section className={`bg-surface border border-border rounded-2xl p-3 ${anyPR ? 'pr-flash' : ''}`} aria-label={exercise.name}>
      <header className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold truncate">{exercise.name}</h3>
          <p className="text-xs text-muted mt-0.5 truncate">
            <span className="text-text/80">Prev:</span> {prevSummary}
          </p>
          <p className="text-xs text-muted mt-0.5 truncate">
            <span className="text-text/80">Target:</span> {targetLine}
          </p>
          {anyPR && (
            <p className="mt-1 inline-flex items-center gap-1 text-warn text-xs font-semibold">
              <Award size={14} /> New PR{' '}
              {[prs.weight && 'weight', prs.reps && 'reps', prs.e1rm && '1RM', prs.volume && 'volume'].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Exercise menu"
            aria-expanded={menuOpen}
            className="w-9 h-9 rounded-lg text-muted hover:text-text hover:bg-card flex items-center justify-center"
          >
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                <MenuItem icon={ArrowUp} label="Move up" disabled={index === 0} onClick={() => { onMoveUp(); setMenuOpen(false); }} />
                <MenuItem icon={ArrowDown} label="Move down" disabled={index === totalCount - 1} onClick={() => { onMoveDown(); setMenuOpen(false); }} />
                <MenuItem icon={Repeat} label="Replace exercise" onClick={() => { onReplace(); setMenuOpen(false); }} />
                <MenuItem icon={Trash2} label="Remove from workout" danger onClick={() => { onRemoveExercise(); setMenuOpen(false); }} />
              </div>
            </>
          )}
        </div>
      </header>

      <div className="mt-3">
        <div
          className="grid items-center pb-1 text-[10px] uppercase tracking-[0.08em] text-muted/70"
          style={{ gridTemplateColumns: '28px 1fr 1fr 40px', columnGap: 4 }}
        >
          <span className="text-center">Set</span>
          <span className="text-center">Weight</span>
          <span className="text-center">Reps</span>
          <span />
        </div>
        <div className="divide-y divide-white/[.04]">
          {activeSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              set={s}
              unit={unit}
              prevSet={prev?.sets?.[i] || null}
              onChange={(patch) => onUpdateSet(s.id, patch)}
              onComplete={() => onCompleteSet(s)}
              onDelete={() => onDeleteSet(s.id)}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          // Prefill next set from the last one for speed.
          const last = activeSets[activeSets.length - 1];
          const seed = last
            ? { weightKg: last.weightKg, reps: last.reps, type: last.type === 'warmup' ? 'working' : last.type }
            : {
                weightKg: rec.targetWeightKg || (prev ? prev.sets[prev.sets.length - 1].weightKg : 0),
                reps: rec.targetRepsLow,
                type: 'working'
              };
          onAddSet(seed);
        }}
        className="mt-2 w-full h-10 rounded-lg text-accent text-[14px] font-medium flex items-center justify-center gap-1.5 active:opacity-60"
      >
        <Plus size={15} strokeWidth={2.5} /> Add set
      </button>
    </section>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-3 text-sm text-left ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface'
      } ${danger ? 'text-danger' : 'text-text'}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
