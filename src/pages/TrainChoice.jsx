import { ArrowLeft, ArrowRight, ListChecks, Plus } from 'lucide-react';
import { IconButton, Spinner } from '../ui/index.js';
import { splitLabel } from '../services/splits.js';

// "How do you want to train today?" — what the hero's arrow used to skip
// straight past. It answered that question for you, silently, by always
// building a plan. Some days that plan is exactly right and some days you
// would rather just start lifting and figure it out as you go — this screen
// is the one tap that tells us which, instead of us guessing.
export default function TrainChoice({ splitId, onBack, onMakePlan, onLogAsIGo, starting = false }) {
  const label = splitLabel(splitId) || 'Workout';

  return (
    <div className="px-base pb-nav">
      <div className="flex items-center gap-sm pt-sm -ml-sm">
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} disabled={starting} />
      </div>

      <p className="mt-base text-micro font-semibold uppercase text-ink-tertiary">Today's session</p>
      <h1 className="text-display font-semibold text-ink mt-xs">{label}</h1>
      <p className="text-label font-regular text-ink-secondary mt-sm">How do you want to train today?</p>

      <div className="mt-xl flex flex-col gap-base">
        <ChoiceCard
          tone="primary"
          icon={ListChecks}
          title="Make plan"
          description={`Pick your exercises before you start. We'll load the ${label} suggestions so you can keep, swap or add.`}
          onClick={onMakePlan}
          disabled={starting}
        />
        <ChoiceCard
          tone="glass"
          icon={Plus}
          title="Log as I go"
          description="Start a blank session now. Add exercises and log sets as you train, no setup."
          onClick={onLogAsIGo}
          disabled={starting}
          loading={starting}
        />
      </div>

      <p className="mt-xl text-label font-regular text-ink-tertiary text-center">
        You can add or swap exercises mid-workout either way.
      </p>
    </div>
  );
}

function ChoiceCard({ tone, icon: Icon, title, description, onClick, disabled = false, loading = false }) {
  const primary = tone === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={[
        'w-full text-left rounded-hero border p-lg transition-colors duration-fast ease-out',
        'active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none',
        primary
          ? 'bg-primary text-on-primary border-transparent shadow-pill active:bg-primary-pressed'
          : 'bg-glass text-ink border-glass-border active:bg-glass-pressed'
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className={[
          'w-11 h-11 rounded-full flex items-center justify-center shrink-0',
          primary ? 'bg-on-primary text-primary' : 'bg-glass-inset text-ink'
        ].join(' ')}>
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <span className={[
          'w-11 h-11 rounded-full flex items-center justify-center shrink-0',
          primary ? 'bg-on-primary text-primary' : 'bg-glass-inset text-ink'
        ].join(' ')}>
          {loading
            ? <Spinner tone={primary ? 'light' : 'light'} />
            : <ArrowRight size={18} strokeWidth={2.2} />}
        </span>
      </div>
      <h2 className="mt-lg text-title font-semibold">{title}</h2>
      <p className={`mt-xs text-label font-regular ${primary ? 'text-on-primary/70' : 'text-ink-secondary'}`}>
        {description}
      </p>
    </button>
  );
}
