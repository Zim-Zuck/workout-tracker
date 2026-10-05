import { useEffect, useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { BottomSheet, PrimaryButton, SecondaryButton } from '../ui/index.js';
import { MUSCLE_GROUPS, EQUIPMENT } from '../data/defaultExercises.js';
import { bestMatch, similarity, DID_YOU_MEAN_THRESHOLD, visibleExercises } from '../services/exerciseIdentity.js';

// CREATING A CUSTOM EXERCISE, WITH THE DUPLICATE CAUGHT BEFORE IT EXISTS.
//
// Reconciliation (services/exerciseReconcile.js) cleans up duplicates that are
// already there. This is the cheaper half of the same problem: the moment
// somebody types "Bayesian Cable Curls" and the library already has "Bayesian
// Cable Curl", say so.
//
// IT NEVER REFUSES. The library match is offered as the FIRST option because it
// is usually what the person wanted, but "Create it anyway" is right there and
// is a real choice — plenty of gyms have a machine that genuinely is not the
// library's version of the lift. A creation flow that blocks you is worse than
// a duplicate.
export default function CreateExerciseSheet({
  open, initialName = '', exercises = [], onClose, onCreate, onUseLibrary
}) {
  const [name, setName] = useState(initialName);
  const [groups, setGroups] = useState([]);
  const [equipment, setEquipment] = useState('Other');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Set once the user has seen the suggestion and chosen to carry on, so the
  // card does not reappear and ask the same question again.
  const [overridden, setOverridden] = useState(false);

  // Re-seed whenever the sheet opens, so typing "bayes" in the picker and
  // tapping Create arrives with that text already in the field.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setGroups([]);
    setEquipment('Other');
    setOverridden(false);
    setError(null);
  }, [open, initialName]);

  const draft = useMemo(
    () => ({ id: '__draft__', name: name.trim(), equipment, muscleGroups: groups }),
    [name, equipment, groups]
  );

  // "Did you mean?" uses a LOWER bar than the merge suggestion threshold. Being
  // shown the library's Cable Curl while typing "Bayesian Cable Curl" costs one
  // tap; not being shown it costs a duplicate that has to be reconciled later.
  const suggestion = useMemo(() => {
    if (!name.trim() || overridden) return null;
    const candidates = visibleExercises(exercises);
    const match = bestMatch(draft, candidates);
    if (match) return match;
    // bestMatch only returns identical/similar pairs. Fall back to the lower
    // did-you-mean bar so a weaker-but-plausible match is still offered.
    let best = null;
    for (const c of candidates) {
      const score = similarity(draft, c);
      if (score >= DID_YOU_MEAN_THRESHOLD && (!best || score > best.score)) {
        best = { exercise: c, score, tier: 'did-you-mean' };
      }
    }
    return best;
  }, [draft, exercises, name, overridden]);

  const canSave = name.trim().length > 0;

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await onCreate?.({
        name: name.trim(),
        muscleGroups: groups,
        equipment
      });
      if (!created) throw new Error('Could not save that exercise.');
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not save that exercise.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Create custom exercise"
      description="It behaves exactly like a library exercise — progression, PRs, charts and all."
      footer={
        <PrimaryButton full onClick={submit} disabled={!canSave} loading={saving}>
          {suggestion && !overridden ? 'Create it anyway' : 'Create exercise'}
        </PrimaryButton>
      }
    >
      <div className="flex flex-col gap-base">
        <label className="block">
          <span className="block text-label font-regular text-ink-secondary mb-sm">Name</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setOverridden(false); }}
            placeholder="e.g. Bayesian Cable Curl"
            className="w-full h-tap px-base rounded-row bg-glass-inset border border-glass-inset-border
                       text-body font-regular text-ink placeholder:text-ink-tertiary outline-none
                       focus:border-glass-border"
          />
        </label>

        {/* DID YOU MEAN. Shown as soon as there is a plausible match, above the
            rest of the form, because answering it correctly means the rest of
            the form never has to be filled in. */}
        {suggestion && (
          <div className="rounded-row bg-pr-soft border border-pr-border px-base py-md">
            <p className="flex items-start gap-sm text-label font-semibold text-pr">
              <Lightbulb size={15} strokeWidth={2.2} className="shrink-0 mt-xxs" />
              <span>Did you mean {suggestion.exercise.name}?</span>
            </p>
            <p className="text-label font-regular text-ink-secondary mt-sm">
              {[suggestion.exercise.equipment, (suggestion.exercise.muscleGroups || []).join(' · ')]
                .filter(Boolean).join(' — ')}
            </p>
            <div className="mt-md flex flex-wrap gap-sm">
              <SecondaryButton onClick={() => { onUseLibrary?.(suggestion.exercise); onClose?.(); }}>
                Use library exercise
              </SecondaryButton>
              <SecondaryButton onClick={() => setOverridden(true)}>
                Continue creating custom
              </SecondaryButton>
            </div>
          </div>
        )}

        <div>
          <span className="block text-label font-regular text-ink-secondary mb-sm">Muscle groups</span>
          <div className="flex flex-wrap gap-sm">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))}
                aria-pressed={groups.includes(g)}
                className={`h-9 px-md rounded-full text-label font-semibold border transition-colors duration-fast ease-out
                            ${groups.includes(g)
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-glass-inset text-ink-secondary border-glass-inset-border'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-label font-regular text-ink-secondary mb-sm">Equipment</span>
          <div className="flex flex-wrap gap-sm">
            {EQUIPMENT.map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setEquipment(eq)}
                aria-pressed={equipment === eq}
                className={`h-9 px-md rounded-full text-label font-semibold border transition-colors duration-fast ease-out
                            ${equipment === eq
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-glass-inset text-ink-secondary border-glass-inset-border'}`}
              >
                {eq}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-label font-regular text-danger">{error}</p>
        )}
      </div>
    </BottomSheet>
  );
}
